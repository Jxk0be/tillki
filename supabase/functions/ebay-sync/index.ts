// eBay price sync for Buy Radar: asking-price ranges and listing counts from the
// Browse API into price_snapshots (source 'ebay_browse'), for the watchlist and
// the top-scoring sets. Sold prices (Marketplace Insights, source 'ebay_sold')
// run only when EBAY_SOLD_ENABLED is 'true', since that API needs approval.
//
// Secrets (set by you): EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, optional
// EBAY_CATEGORY_ID, optional EBAY_SOLD_ENABLED. Without the keys the run is
// logged as skipped and nothing else happens.
//
// Called nightly by pg_cron (06:40 UTC, before the AniList sync scores) or by an admin.
import type { SupabaseClient } from '@supabase/supabase-js'
import { background, env, json, requireAdminOrCron } from '../_shared/server.ts'
import { newYorkDate } from '../anilist-sync/lib.ts'
import {
  BROWSE_SCOPE,
  BROWSE_URL,
  RESULTS_PER_SEARCH,
  SOLD_SCOPE,
  SOLD_URL,
  TOKEN_URL,
  TOP_SETS,
  priceRange,
  searchQuery,
  type ListingSummary,
  type Scope,
} from './lib.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function appToken(id: string, secret: string, scope: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope }),
  })
  if (!res.ok) throw new Error(`eBay token request failed (${res.status})`)
  const body = (await res.json()) as { access_token?: string }
  if (!body.access_token) throw new Error('eBay returned no access token')
  return body.access_token
}

async function search(
  url: string,
  token: string,
  q: string,
  key: 'itemSummaries' | 'itemSales',
): Promise<ListingSummary[]> {
  const params = new URLSearchParams({ q, limit: String(RESULTS_PER_SEARCH) })
  const category = env('EBAY_CATEGORY_ID')
  if (category) params.set('category_ids', category)
  if (key === 'itemSummaries') params.set('filter', 'itemLocationCountry:US,deliveryCountry:US')
  const res = await fetch(`${url}?${params}`, {
    headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' },
  })
  if (!res.ok) throw new Error(`eBay search failed (${res.status})`)
  const body = (await res.json()) as Record<string, ListingSummary[] | undefined>
  return body[key] ?? []
}

async function targets(db: SupabaseClient): Promise<{ id: string; name: string }[]> {
  const [{ data: latest }, { data: watch }] = await Promise.all([
    db
      .from('buy_scores')
      .select('scored_on')
      .order('scored_on', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from('radar_watchlist').select('template_id'),
  ])
  const ids = new Set((watch ?? []).map((w) => w.template_id as string))
  if (latest) {
    const { data: top } = await db
      .from('buy_scores')
      .select('template_id')
      .eq('scored_on', latest.scored_on)
      .order('total', { ascending: false })
      .limit(TOP_SETS)
    for (const t of top ?? []) ids.add(t.template_id)
  }
  if (ids.size === 0) return []
  const { data: sets } = await db
    .from('item_templates')
    .select('id, name')
    .in('id', [...ids])
    .is('archived_at', null)
  return sets ?? []
}

async function run(db: SupabaseClient, runId: string, id: string, secret: string) {
  const detail: Record<string, unknown> = { priced: 0, no_matches: 0, errors: [] }
  const errors = detail.errors as string[]
  try {
    const soldEnabled = env('EBAY_SOLD_ENABLED') === 'true'
    const browseToken = await appToken(id, secret, BROWSE_SCOPE)
    const soldToken = soldEnabled ? await appToken(id, secret, SOLD_SCOPE) : null
    const today = newYorkDate(new Date())
    const sets = await targets(db)
    detail.sets = sets.length
    for (const set of sets) {
      for (const scope of ['single', 'set'] as Scope[]) {
        const sources: {
          source: string
          url: string
          token: string
          key: 'itemSummaries' | 'itemSales'
        }[] = [{ source: 'ebay_browse', url: BROWSE_URL, token: browseToken, key: 'itemSummaries' }]
        if (soldToken)
          sources.push({ source: 'ebay_sold', url: SOLD_URL, token: soldToken, key: 'itemSales' })
        for (const s of sources) {
          try {
            const range = priceRange(
              await search(s.url, s.token, searchQuery(set.name, scope), s.key),
              set.name,
              scope,
            )
            await sleep(300)
            if (!range) {
              detail.no_matches = (detail.no_matches as number) + 1
              continue
            }
            const { error } = await db.from('price_snapshots').upsert(
              {
                template_id: set.id,
                item_scope: scope,
                source: s.source,
                captured_on: today,
                ...range,
              },
              { onConflict: 'template_id,item_scope,source,captured_on' },
            )
            if (error) throw error
            detail.priced = (detail.priced as number) + 1
          } catch (e) {
            errors.push(
              `${set.name} (${scope}, ${s.source}): ${e instanceof Error ? e.message : String(e)}`,
            )
          }
        }
      }
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }
  await db
    .from('radar_runs')
    .update({ finished_at: new Date().toISOString(), ok: errors.length === 0, detail })
    .eq('id', runId)
}

Deno.serve(async (req) => {
  const auth = await requireAdminOrCron(req)
  if (auth instanceof Response) return auth
  const { db, trigger } = auth

  const id = env('EBAY_CLIENT_ID')
  const secret = env('EBAY_CLIENT_SECRET')
  if (!id || !secret) {
    await db.from('radar_runs').insert({
      kind: 'ebay',
      finished_at: new Date().toISOString(),
      ok: true,
      detail: { trigger, skipped: 'EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are not set' },
    })
    return json(req, 200, { skipped: true })
  }

  const { data: runRow, error } = await db
    .from('radar_runs')
    .insert({ kind: 'ebay', detail: { trigger } })
    .select('id')
    .single()
  if (error || !runRow) return json(req, 500, { error: "Couldn't start the eBay sync." })
  background(run(db, runRow.id, id, secret))
  return json(req, 202, { run_id: runRow.id })
})
