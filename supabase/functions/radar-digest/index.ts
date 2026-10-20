// Buy Radar weekly digest: Claude turns the latest scores into a short, cited
// shopping list. Claude sees only numbers Tillki computed and is told to cite
// them; the reply is validated with zod and unsupported prices are cleared.
//
// Called weekly by pg_cron (x-radar-cron) or by an admin from the Radar page.
// Writes radar_digests and a radar_runs row (kind 'digest').
import type Anthropic from '@anthropic-ai/sdk'
import {
  aiErrorMessage,
  anthropicFor,
  background,
  extractJson,
  json,
  logUsage,
  requireAdminOrCron,
} from '../_shared/server.ts'
import { newYorkDate } from '../anilist-sync/lib.ts'
import {
  Digest,
  SYSTEM_PROMPT,
  sanitizeDigest,
  selectForDigest,
  userMessage,
  type SeriesFacts,
} from './lib.ts'

Deno.serve(async (req) => {
  const auth = await requireAdminOrCron(req)
  if (auth instanceof Response) return auth
  const { db, trigger, userId } = auth

  const ai = anthropicFor(req)
  if (ai instanceof Response) return ai
  const { anthropic, model } = ai

  const { data: runRow } = await db
    .from('radar_runs')
    .insert({ kind: 'digest', detail: { trigger } })
    .select('id')
    .single()
  const runId: string | null = runRow?.id ?? null
  const finish = (ok: boolean, detail: Record<string, unknown>) =>
    runId
      ? db
          .from('radar_runs')
          .update({ finished_at: new Date().toISOString(), ok, detail: { trigger, ...detail } })
          .eq('id', runId)
      : Promise.resolve()

  const usage = { input_tokens: 0, output_tokens: 0 }
  try {
    // ---- gather the facts
    const { data: latest } = await db
      .from('buy_scores')
      .select('scored_on')
      .order('scored_on', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!latest) {
      await finish(false, { error: 'No scores yet.' })
      return json(req, 409, { error: 'There are no scores yet. Refresh the radar first.' })
    }
    const [scores, sets, perf, prices, watch] = await Promise.all([
      db
        .from('buy_scores')
        .select('template_id, total, action, components, reasons')
        .eq('scored_on', latest.scored_on),
      db.from('v_templates').select('id, name, missing_ranges').eq('category', 'manga'),
      db
        .from('series_performance')
        .select(
          'template_id, units_on_hand, units_sold, avg_cost_cents, avg_sale_cents, avg_net_cents, margin_pct, median_days_to_sell, sold_last_30d, stale_count, sample_size',
        ),
      db
        .from('price_snapshots')
        .select(
          'template_id, source, min_cents, median_cents, max_cents, listing_count, captured_on',
        )
        .eq('item_scope', 'single')
        .order('captured_on', { ascending: false })
        .limit(2000),
      db.from('radar_watchlist').select('template_id, max_buy_cents, note'),
    ])
    for (const r of [scores, sets, perf, prices, watch]) if (r.error) throw r.error

    const names = new Map((sets.data ?? []).map((s) => [s.id, s]))
    const perfById = new Map((perf.data ?? []).map((p) => [p.template_id, p]))
    const priceById = new Map<string, NonNullable<SeriesFacts['prices']>>()
    for (const p of prices.data ?? []) {
      if (!priceById.has(p.template_id))
        priceById.set(p.template_id, {
          source:
            p.source === 'ebay_sold'
              ? 'eBay sold'
              : p.source === 'manual'
                ? 'manual'
                : 'eBay asking',
          min_cents: p.min_cents,
          median_cents: p.median_cents,
          max_cents: p.max_cents,
          listing_count: p.listing_count,
        })
    }
    const watchById = new Map((watch.data ?? []).map((w) => [w.template_id, w]))

    const facts: SeriesFacts[] = (scores.data ?? []).flatMap((s) => {
      const set = names.get(s.template_id)
      if (!set) return []
      const p = perfById.get(s.template_id)
      const w = watchById.get(s.template_id)
      return [
        {
          series_id: s.template_id,
          name: set.name ?? '',
          score: s.total,
          action: s.action as SeriesFacts['action'],
          components: (s.components ?? {}) as Record<string, number>,
          reasons: s.reasons ?? [],
          missing_ranges: set.missing_ranges ?? '',
          performance: p
            ? {
                units_on_hand: p.units_on_hand ?? 0,
                units_sold: p.units_sold ?? 0,
                avg_cost_cents: p.avg_cost_cents,
                avg_sale_cents: p.avg_sale_cents,
                avg_net_cents: p.avg_net_cents,
                margin_pct: p.margin_pct === null ? null : Number(p.margin_pct),
                median_days_to_sell:
                  p.median_days_to_sell === null ? null : Number(p.median_days_to_sell),
                sold_last_30d: p.sold_last_30d ?? 0,
                stale_count: p.stale_count ?? 0,
                sample_size: p.sample_size ?? 0,
              }
            : null,
          prices: priceById.get(s.template_id) ?? null,
          watchlist: w ? { max_buy_cents: w.max_buy_cents, note: w.note } : null,
        },
      ]
    })
    const input = selectForDigest(facts)

    // ---- ask Claude, validate, retry once
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: userMessage(input, newYorkDate(new Date())) },
    ]
    let lastText = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      const reply = await anthropic.messages.create({
        model,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages,
      })
      usage.input_tokens += reply.usage.input_tokens
      usage.output_tokens += reply.usage.output_tokens
      if (reply.stop_reason === 'refusal') {
        lastText = '(the model declined)'
        break
      }
      lastText = reply.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
      let problem: string
      try {
        const parsed = Digest.safeParse(extractJson(lastText))
        if (parsed.success) {
          const content = sanitizeDigest(parsed.data, input)
          await db.from('radar_digests').insert({ run_id: runId, ok: true, content, model })
          await finish(true, { series: input.length, ...usage })
          background(logUsage(userId, 'radar-digest', model, usage))
          return json(req, 200, { ok: true, content })
        }
        problem = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      } catch (e) {
        problem = e instanceof Error ? e.message : 'not JSON'
      }
      messages.push({ role: 'assistant', content: lastText || '(empty)' })
      messages.push({
        role: 'user',
        content: `That wasn't valid (${problem}). Reply with only the JSON object in the exact shape requested.`,
      })
    }

    await db.from('radar_digests').insert({ run_id: runId, ok: false, raw_text: lastText, model })
    await finish(false, { series: input.length, error: 'invalid reply', ...usage })
    background(logUsage(userId, 'radar-digest', model, usage))
    return json(req, 502, { error: 'The digest came back in the wrong format. Try again.' })
  } catch (e) {
    if (usage.input_tokens) background(logUsage(userId, 'radar-digest', model, usage))
    const message = aiErrorMessage(e, 'radar-digest')
    await finish(false, { error: message })
    return json(req, 500, { error: message })
  }
})
