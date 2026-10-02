// Draft listing: writes a title, description and tags for one item, or for a
// bundle of volumes from one set, using the item's facts and up to 5 photos.
//
// POST { item_id, platform } or { item_ids: [...], platform } with the user's bearer token.
// Returns { draft, platform, photos: { count, examples }, volumes, item_count }.
import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
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
  Draft,
  MAX_PHOTOS,
  RequestBody,
  factsText,
  finishDraft,
  systemPrompt,
  type ListingFacts,
} from './lib.ts'

const BUCKET = 'item-images'
type ImageType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

interface ItemRow {
  id: string
  sku: string | null
  name: string
  template_id: string | null
  template_name: string | null
  volume_number: number | null
  series: string | null
  category: string
  condition: string | null
  isbn: string | null
  effective_description: string | null
  list_price_cents: number | null
  units_left: number
  tags: string[]
}

function mediaType(path: string, header: string | null): ImageType | null {
  const fromHeader = header?.split(';')[0]?.trim()
  if (fromHeader && ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(fromHeader))
    return fromHeader as ImageType
  const ext = path.split('.').pop()?.toLowerCase()
  if (ext === 'webp') return 'image/webp'
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  return null
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

/** Signs and downloads photos (short-lived URLs), as image blocks for Claude. */
async function imageBlocks(
  db: SupabaseClient,
  paths: string[],
): Promise<Anthropic.ImageBlockParam[]> {
  const blocks = await Promise.all(
    paths.slice(0, MAX_PHOTOS).map(async (path): Promise<Anthropic.ImageBlockParam | null> => {
      const { data } = await db.storage.from(BUCKET).createSignedUrl(path, 60)
      if (!data?.signedUrl) return null
      const res = await fetch(data.signedUrl)
      if (!res.ok) return null
      const type = mediaType(path, res.headers.get('content-type'))
      if (!type) return null
      const bytes = new Uint8Array(await res.arrayBuffer())
      return { type: 'image', source: { type: 'base64', media_type: type, data: toBase64(bytes) } }
    }),
  )
  return blocks.filter((b): b is Anthropic.ImageBlockParam => b !== null)
}

/** This copy's own photos first; if there are none, the set's example photos. */
async function photoPaths(
  db: SupabaseClient,
  items: ItemRow[],
): Promise<{ paths: string[]; examples: boolean }> {
  const { data: own } = await db
    .from('item_images')
    .select('item_id, storage_path, position')
    .in(
      'item_id',
      items.map((i) => i.id),
    )
    .order('position')
  const order = new Map(items.map((i, n) => [i.id, n]))
  const ownPaths = (own ?? [])
    .sort(
      (a, b) =>
        (order.get(a.item_id) ?? 0) - (order.get(b.item_id) ?? 0) || a.position - b.position,
    )
    .map((r) => r.storage_path as string)
  if (ownPaths.length) return { paths: ownPaths.slice(0, MAX_PHOTOS), examples: false }

  const templateId = items[0]?.template_id
  if (!templateId) return { paths: [], examples: false }
  const { data: examples } = await db
    .from('template_images')
    .select('storage_path')
    .eq('template_id', templateId)
    .order('position')
    .limit(MAX_PHOTOS)
  return { paths: (examples ?? []).map((r) => r.storage_path as string), examples: true }
}

const dollars = (cents: number | null) => (cents === null ? null : `$${(cents / 100).toFixed(2)}`)

Deno.serve(async (req) => {
  const caller = await requireAdmin(req)
  if (caller instanceof Response) return caller
  const { db, userId } = caller

  let body: ReturnType<typeof RequestBody.parse>
  try {
    const parsed = RequestBody.safeParse(await req.json())
    if (!parsed.success)
      return json(req, 400, { error: parsed.error.issues[0]?.message ?? 'Bad request.' })
    body = parsed.data
  } catch {
    return json(req, 400, { error: 'Send JSON like {"item_id": "...", "platform": "ebay"}.' })
  }

  const ai = anthropicFor(req)
  if (ai instanceof Response) return ai
  const { anthropic, model } = ai

  // ---- the item(s)
  const ids = body.item_ids ?? (body.item_id ? [body.item_id] : [])
  const { data, error } = await db
    .from('v_items')
    .select(
      'id, sku, name, template_id, template_name, volume_number, series, category, condition, isbn, effective_description, list_price_cents, units_left, tags',
    )
    .in('id', ids)
  if (error) return json(req, 500, { error: "Couldn't load the item." })
  const items = ((data ?? []) as ItemRow[]).sort(
    (a, b) => (a.volume_number ?? 0) - (b.volume_number ?? 0),
  )
  const first = items[0]
  if (!first || items.length !== new Set(ids).size)
    return json(req, 404, { error: "That item doesn't exist." })

  const bundle = items.length > 1
  if (
    bundle &&
    (items.some((i) => !i.template_id) || new Set(items.map((i) => i.template_id)).size > 1)
  )
    return json(req, 400, { error: 'A bundle listing has to be volumes of one set.' })

  let volumes: string | null = null
  if (first.template_id) {
    const nums = items.map((i) => i.volume_number).filter((n): n is number => n !== null)
    const { data: ranges } = await db.rpc('format_volume_ranges', { p_volumes: nums })
    volumes = typeof ranges === 'string' ? ranges : nums.join(', ')
  }

  const conditions = [...new Set(items.map((i) => i.condition).filter(Boolean))]
  const facts: ListingFacts = {
    kind: bundle ? 'bundle' : first.template_id ? 'set_volume' : 'one_off',
    title: bundle ? `${first.template_name} Volumes ${volumes}` : first.name,
    set_name: first.template_name,
    volumes,
    series: first.series,
    category: first.category,
    // Volumes in a bundle can differ in condition; list each one that appears.
    condition: conditions.length ? conditions.join(' / ') : null,
    isbn: bundle ? null : first.isbn,
    sku: bundle ? null : first.sku,
    description: first.effective_description,
    tags: [...new Set(items.flatMap((i) => i.tags).filter((t) => t !== 'demo'))],
    copies_available: bundle ? 1 : Math.max(first.units_left, 1),
    asking_price: bundle
      ? dollars(items.reduce((s, i) => s + (i.list_price_cents ?? 0), 0) || null)
      : dollars(first.list_price_cents),
  }

  // ---- photos and the request
  const photos = await photoPaths(db, items)
  const images = await imageBlocks(db, photos.paths)
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: [
        ...images,
        {
          type: 'text',
          text: factsText(facts, { count: images.length, examples: photos.examples }),
        },
      ],
    },
  ]

  const usage = { input_tokens: 0, output_tokens: 0 }
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const reply = await anthropic.messages.create({
        model,
        max_tokens: 1200,
        system: systemPrompt(body.platform),
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
        const parsed = Draft.safeParse(extractJson(text))
        if (parsed.success) {
          background(logUsage(userId, 'draft-listing', model, usage))
          return json(req, 200, {
            draft: finishDraft(parsed.data, body.platform),
            platform: body.platform,
            photos: { count: images.length, examples: photos.examples },
            volumes,
            item_count: items.length,
          })
        }
        problem = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      } catch (e) {
        problem = e instanceof Error ? e.message : 'not JSON'
      }
      // One retry: show the model its reply and what was wrong with it.
      messages.push({ role: 'assistant', content: text || '(empty)' })
      messages.push({
        role: 'user',
        content: `That wasn't valid (${problem}). Reply with only the JSON object in the exact shape requested.`,
      })
    }
    background(logUsage(userId, 'draft-listing', model, usage))
    return json(req, 502, { error: 'The draft came back in the wrong format. Try again.' })
  } catch (e) {
    if (usage.input_tokens) background(logUsage(userId, 'draft-listing', model, usage))
    return json(req, 502, { error: aiErrorMessage(e, 'draft-listing') })
  }
})
