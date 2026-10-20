// Buy Radar discover: AniList's trending (or most popular, or new) manga, marked
// with which ones we already have a set for. Read-only; nothing is stored.
//
// POST { sort?: 'trending' | 'popular' | 'new', include_manhwa?: boolean, page?: number }
// with an admin's bearer token. Returns { items, has_next }.
import { json, requireAdmin } from '../_shared/server.ts'
import { ANILIST_URL } from '../anilist-sync/lib.ts'
import {
  RequestBody,
  discoverQuery,
  toItem,
  type DiscoverMedia,
  type DiscoverRequest,
} from './lib.ts'

// AniList's lists change slowly; keep each page for 30 minutes per instance.
const cache = new Map<string, { at: number; body: unknown }>()
const TTL_MS = 30 * 60_000

Deno.serve(async (req) => {
  const caller = await requireAdmin(req)
  if (caller instanceof Response) return caller
  const { db } = caller

  let body: DiscoverRequest
  try {
    const parsed = RequestBody.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) return json(req, 400, { error: 'Bad request.' })
    body = parsed.data
  } catch {
    return json(req, 400, { error: 'Bad request.' })
  }

  // Which AniList series we already have sets for (always fresh, so "Watch" shows right away).
  const { data: sets, error } = await db
    .from('item_templates')
    .select('id, anilist_id')
    .not('anilist_id', 'is', null)
    .is('archived_at', null)
  if (error) return json(req, 500, { error: "Couldn't read your sets." })
  const owned = new Map((sets ?? []).map((s) => [s.anilist_id as number, s.id as string]))

  const key = JSON.stringify(body)
  let page = cache.get(key)
  if (!page || Date.now() - page.at > TTL_MS) {
    const { query, variables } = discoverQuery(body)
    const res = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
    if (res.status === 429)
      return json(req, 503, { error: 'AniList is busy right now. Try again in a minute.' })
    if (!res.ok) return json(req, 502, { error: `AniList returned ${res.status}.` })
    page = { at: Date.now(), body: await res.json() }
    cache.set(key, page)
  }

  const data = (
    page.body as {
      data?: { Page?: { pageInfo?: { hasNextPage?: boolean }; media?: (DiscoverMedia | null)[] } }
    }
  ).data?.Page
  const items = (data?.media ?? [])
    .filter((m): m is DiscoverMedia => !!m)
    .map((m) => toItem(m, owned))
  return json(req, 200, { items, has_next: data?.pageInfo?.hasNextPage ?? false })
})
