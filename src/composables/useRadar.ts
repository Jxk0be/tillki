import { callFunction } from '@/lib/edgeFunctions'
import type { LotSetContext } from '@/lib/lotCheck'
import type {
  AniListCandidate,
  DigestContent,
  RadarAction,
  RadarScore,
  RadarSet,
  RadarSnapshot,
  ScoreComponents,
} from '@/lib/radar'
import { supabase } from '@/lib/supabase'
import type { Json } from '@/types/database'
import { notifyDataChanged } from './useDataChanged'

export type RunKind = 'anilist' | 'ebay' | 'digest'

export interface RadarRun {
  id: string
  started_at: string
  finished_at: string | null
  ok: boolean | null
  /** Series snapshotted, from the run's detail. */
  snapshots: number | null
  /** Why the run did nothing (e.g. eBay keys not set yet). */
  skipped: string | null
}

function toCandidates(value: Json | null): AniListCandidate[] | null {
  if (!Array.isArray(value)) return null
  return value.flatMap((c) => {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return []
    if (typeof c.anilist_id !== 'number' || typeof c.title !== 'string') return []
    return [
      {
        anilist_id: c.anilist_id,
        title: c.title,
        score: typeof c.score === 'number' ? c.score : 0,
        format: typeof c.format === 'string' ? c.format : null,
        url: typeof c.url === 'string' ? c.url : null,
      },
    ]
  })
}

/** Unarchived manga sets with their AniList link and what we own. */
export async function listRadarSets(): Promise<RadarSet[]> {
  const [links, stock] = await Promise.all([
    supabase
      .from('item_templates')
      .select('id, name, publisher, anilist_id, anilist_match, anilist_candidates')
      .eq('category', 'manga')
      .is('archived_at', null),
    supabase
      .from('v_templates')
      .select('id, volumes_owned, units_in_stock, total_volumes, missing_count, missing_ranges')
      .eq('category', 'manga')
      .is('archived_at', null),
  ])
  if (links.error) throw new Error(links.error.message)
  if (stock.error) throw new Error(stock.error.message)
  const byId = new Map((stock.data ?? []).map((s) => [s.id, s]))
  return (links.data ?? []).map((t) => {
    const s = byId.get(t.id)
    return {
      id: t.id,
      name: t.name,
      publisher: t.publisher,
      anilist_id: t.anilist_id,
      anilist_match: t.anilist_match as RadarSet['anilist_match'],
      anilist_candidates: toCandidates(t.anilist_candidates),
      volumes_owned: s?.volumes_owned ?? 0,
      units_in_stock: s?.units_in_stock ?? 0,
      total_volumes: s?.total_volumes ?? null,
      missing_count: s?.missing_count ?? 0,
      missing_ranges: s?.missing_ranges ?? '',
    }
  })
}

/** The last ~35 days of snapshots for these series. */
export async function listSnapshots(anilistIds: number[]): Promise<RadarSnapshot[]> {
  if (anilistIds.length === 0) return []
  const since = new Date(Date.now() - 35 * 86_400_000).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('anilist_snapshots')
    .select(
      'anilist_id, captured_on, trending, popularity, favourites, mean_score, status, has_upcoming_anime, anime_airing, next_episode_at',
    )
    .in('anilist_id', anilistIds)
    .gte('captured_on', since)
    .order('captured_on')
    .limit(5000)
  if (error) throw new Error(error.message)
  return data ?? []
}

const COMPONENT_KEYS = [
  'momentum',
  'adaptation',
  'velocity',
  'margin',
  'supply',
  'set_gap',
] as const

function toComponents(value: Json): ScoreComponents {
  const out: ScoreComponents = {
    momentum: 0.5,
    adaptation: 0,
    velocity: 0.5,
    margin: 0.5,
    supply: 0.5,
    set_gap: 0,
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const k of COMPONENT_KEYS) {
      const v = value[k]
      if (typeof v === 'number') out[k] = v
    }
  }
  return out
}

/** Scores from the last few days (the page shows the newest per set). */
export async function listScores(): Promise<RadarScore[]> {
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('buy_scores')
    .select('template_id, scored_on, total, action, reasons, components')
    .gte('scored_on', since)
    .limit(5000)
  if (error) throw new Error(error.message)
  return (data ?? []).map((s) => ({
    template_id: s.template_id,
    scored_on: s.scored_on,
    total: s.total,
    action: s.action as RadarAction,
    reasons: s.reasons,
    components: toComponents(s.components),
  }))
}

/** The newest run of one job, for the health line. */
export async function latestRun(kind: RunKind): Promise<RadarRun | null> {
  const { data, error } = await supabase
    .from('radar_runs')
    .select('id, started_at, finished_at, ok, detail')
    .eq('kind', kind)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const d = data.detail
  const obj = d && typeof d === 'object' && !Array.isArray(d) ? d : {}
  return {
    id: data.id,
    started_at: data.started_at,
    finished_at: data.finished_at,
    ok: data.ok,
    snapshots: typeof obj.snapshots === 'number' ? obj.snapshots : null,
    skipped: typeof obj.skipped === 'string' ? obj.skipped : null,
  }
}

export function latestAniListRun(): Promise<RadarRun | null> {
  return latestRun('anilist')
}

/** Starts an AniList sync now. It runs in the background; poll latestAniListRun for the result. */
export async function startAniListSync(): Promise<{ run_id: string; already_running: boolean }> {
  return callFunction('anilist-sync', {})
}

/** Links a set to an AniList series by hand, or marks it as not on AniList (id null). */
export async function setAniListMatch(templateId: string, anilistId: number | null) {
  const { error } = await supabase
    .from('item_templates')
    .update(
      anilistId === null
        ? { anilist_id: null, anilist_match: 'none' }
        : { anilist_id: anilistId, anilist_match: 'confirmed', anilist_candidates: null },
    )
    .eq('id', templateId)
  if (error) throw new Error(error.message)
  notifyDataChanged()
}

/** Clears a match so the next sync searches AniList again. */
export async function resetAniListMatch(templateId: string) {
  const { error } = await supabase
    .from('item_templates')
    .update({ anilist_id: null, anilist_match: null, anilist_candidates: null })
    .eq('id', templateId)
  if (error) throw new Error(error.message)
  notifyDataChanged()
}

// ----------------------------------------------------------------------------- watchlist
export interface WatchEntry {
  template_id: string
  note: string | null
  max_buy_cents: number | null
}

export async function listWatchlist(): Promise<WatchEntry[]> {
  const { data, error } = await supabase
    .from('radar_watchlist')
    .select('template_id, note, max_buy_cents')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function saveWatch(entry: WatchEntry) {
  const { error } = await supabase
    .from('radar_watchlist')
    .upsert(entry, { onConflict: 'template_id' })
  if (error) throw new Error(error.message)
  notifyDataChanged()
}

export async function removeWatch(templateId: string) {
  const { error } = await supabase.from('radar_watchlist').delete().eq('template_id', templateId)
  if (error) throw new Error(error.message)
  notifyDataChanged()
}

// ----------------------------------------------------------------------------- detail
export interface SeriesPerformance {
  units_bought: number
  units_sold: number
  units_on_hand: number
  avg_cost_cents: number | null
  avg_sale_cents: number | null
  avg_net_cents: number | null
  margin_pct: number | null
  median_days_to_sell: number | null
  sold_last_30d: number
  sold_last_90d: number
  stale_count: number
  sample_size: number
}

export interface PlatformPerformance {
  platform: string
  units_sold: number
  avg_net_cents: number | null
  margin_pct: number | null
  median_days_to_sell: number | null
}

export interface PriceRow {
  item_scope: string
  source: string
  captured_on: string
  min_cents: number | null
  median_cents: number | null
  max_cents: number | null
  listing_count: number | null
}

export interface SeriesDetail {
  performance: SeriesPerformance | null
  platforms: PlatformPerformance[]
  /** Newest row per scope and source. */
  prices: PriceRow[]
  /** About 90 days of AniList history, oldest first. */
  history: { captured_on: string; popularity: number | null; trending: number | null }[]
}

const num = (v: number | string | null) => (v === null ? null : Number(v))

async function anilistHistory(anilistId: number | null) {
  if (!anilistId) return []
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('anilist_snapshots')
    .select('captured_on, popularity, trending')
    .eq('anilist_id', anilistId)
    .gte('captured_on', since)
    .order('captured_on')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getSeriesDetail(
  templateId: string,
  anilistId: number | null,
): Promise<SeriesDetail> {
  const [perf, platforms, prices, history] = await Promise.all([
    supabase.from('series_performance').select('*').eq('template_id', templateId).maybeSingle(),
    supabase.from('series_platform_performance').select('*').eq('template_id', templateId),
    supabase
      .from('price_snapshots')
      .select('item_scope, source, captured_on, min_cents, median_cents, max_cents, listing_count')
      .eq('template_id', templateId)
      .order('captured_on', { ascending: false })
      .limit(60),
    anilistHistory(anilistId),
  ])
  if (perf.error) throw new Error(perf.error.message)
  if (platforms.error) throw new Error(platforms.error.message)
  if (prices.error) throw new Error(prices.error.message)
  const p = perf.data
  const seen = new Set<string>()
  const latestPrices: PriceRow[] = []
  for (const row of prices.data ?? []) {
    const key = `${row.item_scope}:${row.source}`
    if (seen.has(key)) continue
    seen.add(key)
    latestPrices.push(row)
  }
  return {
    performance: p
      ? {
          units_bought: p.units_bought ?? 0,
          units_sold: p.units_sold ?? 0,
          units_on_hand: p.units_on_hand ?? 0,
          avg_cost_cents: p.avg_cost_cents,
          avg_sale_cents: p.avg_sale_cents,
          avg_net_cents: p.avg_net_cents,
          margin_pct: num(p.margin_pct),
          median_days_to_sell: num(p.median_days_to_sell),
          sold_last_30d: p.sold_last_30d ?? 0,
          sold_last_90d: p.sold_last_90d ?? 0,
          stale_count: p.stale_count ?? 0,
          sample_size: p.sample_size ?? 0,
        }
      : null,
    platforms: (platforms.data ?? []).map((r) => ({
      platform: r.platform ?? 'other',
      units_sold: r.units_sold ?? 0,
      avg_net_cents: r.avg_net_cents,
      margin_pct: num(r.margin_pct),
      median_days_to_sell: num(r.median_days_to_sell),
    })),
    prices: latestPrices,
    history,
  }
}

// ----------------------------------------------------------------------------- digest
export interface RadarDigest {
  id: string
  created_at: string
  content: DigestContent
}

function toPicks(v: Json | undefined): DigestContent['buy'] {
  if (!Array.isArray(v)) return []
  return v.flatMap((p) =>
    p &&
    typeof p === 'object' &&
    !Array.isArray(p) &&
    typeof p.series_id === 'string' &&
    typeof p.why === 'string'
      ? [
          {
            series_id: p.series_id,
            why: p.why,
            suggested_max_cents:
              typeof p.suggested_max_cents === 'number' ? p.suggested_max_cents : null,
          },
        ]
      : [],
  )
}

function toDigest(value: Json | null): DigestContent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return {
    buy: toPicks(value.buy),
    finish_sets: toPicks(value.finish_sets),
    stop_buying: toPicks(value.stop_buying),
    watch: toPicks(value.watch),
    notes: typeof value.notes === 'string' ? value.notes : '',
  }
}

/** The newest digest that validated. */
export async function latestDigest(): Promise<RadarDigest | null> {
  const { data, error } = await supabase
    .from('radar_digests')
    .select('id, created_at, content')
    .eq('ok', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const content = data ? toDigest(data.content) : null
  return data && content ? { id: data.id, created_at: data.created_at, content } : null
}

/** Writes a new digest now (takes up to a minute). */
export async function runDigest(): Promise<void> {
  await callFunction('radar-digest', {})
  notifyDataChanged()
}

// ----------------------------------------------------------------------------- lot checker
/** Every manga set with what we own, its score, our sale price and any eBay price. */
export async function loadLotContexts(): Promise<LotSetContext[]> {
  const [sets, items, scores, perf, prices] = await Promise.all([
    supabase
      .from('item_templates')
      .select('id, name, total_volumes')
      .eq('category', 'manga')
      .is('archived_at', null)
      .order('name'),
    supabase
      .from('v_items')
      .select('template_id, volume_number, units_left')
      .not('template_id', 'is', null)
      .is('archived_at', null)
      .gt('units_left', 0)
      .limit(10000),
    listScores(),
    supabase.from('series_performance').select('template_id, avg_sale_cents, sample_size'),
    supabase
      .from('price_snapshots')
      .select('template_id, median_cents, captured_on')
      .eq('item_scope', 'single')
      .order('captured_on', { ascending: false })
      .limit(2000),
  ])
  if (sets.error) throw new Error(sets.error.message)
  if (items.error) throw new Error(items.error.message)
  if (perf.error) throw new Error(perf.error.message)
  if (prices.error) throw new Error(prices.error.message)
  const owned = new Map<string, number[]>()
  for (const i of items.data ?? []) {
    if (!i.template_id || i.volume_number === null) continue
    const list = owned.get(i.template_id) ?? []
    list.push(i.volume_number)
    owned.set(i.template_id, list)
  }
  const scoreBy = new Map<string, RadarScore>()
  for (const s of scores) {
    const seen = scoreBy.get(s.template_id)
    if (!seen || s.scored_on > seen.scored_on) scoreBy.set(s.template_id, s)
  }
  const perfBy = new Map((perf.data ?? []).map((p) => [p.template_id, p]))
  const priceBy = new Map<string, number>()
  for (const p of prices.data ?? [])
    if (!priceBy.has(p.template_id) && p.median_cents !== null)
      priceBy.set(p.template_id, p.median_cents)
  return (sets.data ?? []).map((s) => {
    const sc = scoreBy.get(s.id)
    const p = perfBy.get(s.id)
    return {
      template_id: s.id,
      name: s.name,
      total_volumes: s.total_volumes,
      owned: owned.get(s.id) ?? [],
      score: sc?.total ?? null,
      action: sc?.action ?? null,
      avg_sale_cents: p?.avg_sale_cents ?? null,
      sample_size: p?.sample_size ?? 0,
      ebay_median_cents: priceBy.get(s.id) ?? null,
    }
  })
}

/** The set and volume a scanned ISBN belongs to, if we've stocked that book before. */
export async function findByIsbn(
  isbn: string,
): Promise<{ template_id: string; volume_number: number } | null> {
  const { data, error } = await supabase
    .from('items')
    .select('template_id, volume_number')
    .eq('isbn', isbn)
    .not('template_id', 'is', null)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.template_id && data.volume_number !== null
    ? { template_id: data.template_id, volume_number: data.volume_number }
    : null
}
