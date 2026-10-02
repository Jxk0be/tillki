// Deal checker: should we buy this lot? Judged only on OUR OWN sales history for
// the same set, series or category, plus our target margin. Not market prices.
//
// POST { description, template_id?, series?, category?, volumes?, quantity?, condition?,
//        asking_price_cents, photo? } with the user's bearer token.
// Returns { verdict, history, formula_max_price_cents, target_margin_percent, basis, offered }.
import type Anthropic from '@anthropic-ai/sdk'
import {
  aiErrorMessage,
  anthropicFor,
  background,
  extractJson,
  json,
  logUsage,
  requireAdmin,
} from '../_shared/server.ts'
import {
  RequestBody,
  SYSTEM_PROMPT,
  Verdict,
  enforceConfidence,
  formulaMaxPriceCents,
  splitOffered,
  summarizeHistory,
  type DealRequest,
  type SaleRow,
} from './lib.ts'

const TZ = 'America/New_York'

interface SaleWithGroup extends SaleRow {
  template_id: string | null
  series: string | null
  template_name: string | null
  category: string
}

const lower = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

Deno.serve(async (req) => {
  const caller = await requireAdmin(req)
  if (caller instanceof Response) return caller
  const { db, userId } = caller

  let body: DealRequest
  try {
    const parsed = RequestBody.safeParse(await req.json())
    if (!parsed.success)
      return json(req, 400, { error: parsed.error.issues[0]?.message ?? 'Bad request.' })
    body = parsed.data
  } catch {
    return json(req, 400, { error: 'Send JSON with at least description and asking_price_cents.' })
  }

  const ai = anthropicFor(req)
  if (ai instanceof Response) return ai
  const { anthropic, model } = ai

  // ---- the set (if one was picked)
  let set: { id: string; name: string; total_volumes: number | null; category: string } | null =
    null
  if (body.template_id) {
    const { data } = await db
      .from('item_templates')
      .select('id, name, total_volumes, category')
      .eq('id', body.template_id)
      .maybeSingle()
    if (!data) return json(req, 404, { error: "That set doesn't exist." })
    set = data
  }
  const series = set?.name ?? body.series ?? null
  const category = set?.category ?? body.category ?? null

  // ---- our history: same set, else same series, else same category
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
  const [salesRes, stockRes, settingsRes] = await Promise.all([
    db.rpc('sales_between', { p_start: '2000-01-01', p_end: today, p_tz: TZ }),
    db
      .from('v_items')
      .select('template_id, template_name, series, category, volume_number, units_left, status')
      .is('archived_at', null)
      .gt('units_left', 0),
    db.from('app_settings').select('key, value').in('key', ['target_margin_percent', 'fee_rules']),
  ])
  if (salesRes.error || stockRes.error)
    return json(req, 500, { error: "Couldn't load your sales history." })
  const sales = (salesRes.data ?? []) as SaleWithGroup[]
  const stock = (stockRes.data ?? []) as {
    template_id: string | null
    template_name: string | null
    series: string | null
    category: string
    volume_number: number | null
    units_left: number
    status: string
  }[]

  type Basis = 'set' | 'series' | 'category' | 'none'
  const matchers: [
    Basis,
    (r: {
      template_id: string | null
      series: string | null
      template_name: string | null
      category: string
    }) => boolean,
  ][] = [
    ['set', (r) => !!set && r.template_id === set.id],
    [
      'series',
      (r) =>
        !!series && (lower(r.series) === lower(series) || lower(r.template_name) === lower(series)),
    ],
    ['category', (r) => !!category && r.category === category],
  ]
  let basis: Basis = 'none'
  let groupSales: SaleWithGroup[] = []
  let match: (r: Parameters<(typeof matchers)[number][1]>[0]) => boolean = () => false
  for (const [name, fn] of matchers) {
    const found = sales.filter(fn)
    if (found.length) {
      basis = name
      groupSales = found
      match = fn
      break
    }
  }
  const forSale = (s: string) => ['in_stock', 'listed', 'reserved'].includes(s)
  const unitsInStock = stock
    .filter((r) => forSale(r.status) && match(r))
    .reduce((s, r) => s + r.units_left, 0)
  const history = summarizeHistory(groupSales, unitsInStock)

  const settings = Object.fromEntries((settingsRes.data ?? []).map((r) => [r.key, r.value]))
  const targetMargin = Number(settings.target_margin_percent) || 40

  // ---- volumes offered vs what we have
  const offeredVolumes = body.volumes ?? []
  const owned = set
    ? stock
        .filter((r) => r.template_id === set.id && r.volume_number !== null)
        .map((r) => r.volume_number as number)
    : []
  const offered =
    set && offeredVolumes.length ? splitOffered(offeredVolumes, owned, set.total_volumes) : null
  const units = offeredVolumes.length || body.quantity || 1
  const formulaMax = formulaMaxPriceCents(history, units, targetMargin)

  const facts = {
    deal: {
      description: body.description,
      set: set?.name ?? null,
      set_total_volumes: set?.total_volumes ?? null,
      series,
      category,
      volumes_offered: offeredVolumes,
      units,
      condition: body.condition ?? null,
      asking_price_cents: body.asking_price_cents,
    },
    offered_vs_our_set: offered,
    our_history: { basis, ...history },
    target_margin_percent: targetMargin,
    formula_max_price_cents: formulaMax,
    fee_rules: settings.fee_rules ?? null,
  }

  const content: Anthropic.ContentBlockParam[] = []
  if (body.photo)
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: body.photo.media_type, data: body.photo.data },
    })
  content.push({ type: 'text', text: `Judge this deal.\n\n${JSON.stringify(facts, null, 2)}` })
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content }]

  const usage = { input_tokens: 0, output_tokens: 0 }
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const reply = await anthropic.messages.create({
        model,
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages,
      })
      usage.input_tokens += reply.usage.input_tokens
      usage.output_tokens += reply.usage.output_tokens
      const text = reply.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
      let problem: string
      try {
        const parsed = Verdict.safeParse(extractJson(text))
        if (parsed.success) {
          background(logUsage(userId, 'deal-check', model, usage))
          return json(req, 200, {
            verdict: enforceConfidence(parsed.data, history.sale_count),
            history,
            basis,
            formula_max_price_cents: formulaMax,
            target_margin_percent: targetMargin,
            offered,
            units,
          })
        }
        problem = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      } catch (e) {
        problem = e instanceof Error ? e.message : 'not JSON'
      }
      messages.push({ role: 'assistant', content: text || '(empty)' })
      messages.push({
        role: 'user',
        content: `That wasn't valid (${problem}). Reply with only the JSON object in the exact shape requested.`,
      })
    }
    background(logUsage(userId, 'deal-check', model, usage))
    return json(req, 502, { error: 'The verdict came back in the wrong format. Try again.' })
  } catch (e) {
    if (usage.input_tokens) background(logUsage(userId, 'deal-check', model, usage))
    return json(req, 502, { error: aiErrorMessage(e, 'deal-check') })
  }
})
