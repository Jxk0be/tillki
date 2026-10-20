// Loads everything the scorer needs, scores every manga set and saves today's
// buy_scores rows. Runs at the end of each AniList sync.
import type { SupabaseClient } from '@supabase/supabase-js'
import { scoreAll, type Performance, type SetInput, type SnapshotPoint } from './score.ts'

export async function scoreSets(
  db: SupabaseClient,
  scoredOn: string,
): Promise<{ scored: number; actions: Record<string, number> }> {
  const since = new Date(Date.now() - 35 * 86_400_000).toISOString().slice(0, 10)
  const [sets, stock, perf, watch, prices] = await Promise.all([
    db
      .from('item_templates')
      .select('id, name, anilist_id')
      .eq('category', 'manga')
      .is('archived_at', null),
    db
      .from('v_templates')
      .select('id, total_volumes, volumes_owned, missing_count')
      .eq('category', 'manga')
      .is('archived_at', null),
    db
      .from('series_performance')
      .select(
        'template_id, units_sold, units_on_hand, margin_pct, median_days_to_sell, sold_last_30d, stale_count, sample_size',
      ),
    db.from('radar_watchlist').select('template_id'),
    db
      .from('price_snapshots')
      .select('template_id, listing_count, captured_on')
      .eq('item_scope', 'single')
      .gte('captured_on', since)
      .order('captured_on', { ascending: false }),
  ])
  for (const r of [sets, stock, perf, watch, prices]) if (r.error) throw r.error

  const ids = [
    ...new Set(
      (sets.data ?? []).map((s) => s.anilist_id as number | null).filter((i): i is number => !!i),
    ),
  ]
  const snapshots = new Map<number, SnapshotPoint[]>()
  if (ids.length) {
    const { data, error } = await db
      .from('anilist_snapshots')
      .select('anilist_id, captured_on, trending, popularity, has_upcoming_anime, anime_airing')
      .in('anilist_id', ids)
      .gte('captured_on', since)
      .order('captured_on')
      .limit(10000)
    if (error) throw error
    for (const s of data ?? []) {
      const list = snapshots.get(s.anilist_id) ?? []
      list.push(s)
      snapshots.set(s.anilist_id, list)
    }
  }

  const stockById = new Map((stock.data ?? []).map((s) => [s.id as string, s]))
  const perfById = new Map(
    (perf.data ?? []).map((p) => [
      p.template_id as string,
      {
        units_sold: p.units_sold ?? 0,
        units_on_hand: p.units_on_hand ?? 0,
        margin_pct: p.margin_pct === null ? null : Number(p.margin_pct),
        median_days_to_sell: p.median_days_to_sell === null ? null : Number(p.median_days_to_sell),
        sold_last_30d: p.sold_last_30d ?? 0,
        stale_count: p.stale_count ?? 0,
        sample_size: p.sample_size ?? 0,
      } satisfies Performance,
    ]),
  )
  const watched = new Set((watch.data ?? []).map((w) => w.template_id as string))
  const listings = new Map<string, number>()
  for (const p of prices.data ?? []) {
    if (!listings.has(p.template_id) && p.listing_count !== null)
      listings.set(p.template_id, p.listing_count)
  }

  const inputs: SetInput[] = (sets.data ?? []).map((s) => {
    const st = stockById.get(s.id)
    return {
      template_id: s.id,
      name: s.name,
      snapshots: s.anilist_id ? (snapshots.get(s.anilist_id) ?? []) : [],
      performance: perfById.get(s.id) ?? null,
      total_volumes: st?.total_volumes ?? null,
      volumes_owned: st?.volumes_owned ?? 0,
      missing_count: st?.missing_count ?? 0,
      listing_count: listings.get(s.id) ?? null,
      on_watchlist: watched.has(s.id),
    }
  })

  const scores = scoreAll(inputs)
  if (scores.length) {
    const { error } = await db.from('buy_scores').upsert(
      scores.map((s) => ({ ...s, scored_on: scoredOn })),
      { onConflict: 'template_id,scored_on' },
    )
    if (error) throw error
  }
  const actions: Record<string, number> = {}
  for (const s of scores) actions[s.action] = (actions[s.action] ?? 0) + 1
  return { scored: scores.length, actions }
}
