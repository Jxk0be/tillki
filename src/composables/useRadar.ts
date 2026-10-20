import { callFunction } from '@/lib/edgeFunctions'
import type {
  AniListCandidate,
  RadarAction,
  RadarScore,
  RadarSet,
  RadarSnapshot,
} from '@/lib/radar'
import { supabase } from '@/lib/supabase'
import type { Json } from '@/types/database'
import { notifyDataChanged } from './useDataChanged'

export interface RadarRun {
  id: string
  started_at: string
  finished_at: string | null
  ok: boolean | null
  /** Series snapshotted, from the run's detail. */
  snapshots: number | null
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
      .select('id, name, anilist_id, anilist_match, anilist_candidates')
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

/** Scores from the last few days (the page shows the newest per set). */
export async function listScores(): Promise<RadarScore[]> {
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('buy_scores')
    .select('template_id, scored_on, total, action, reasons')
    .gte('scored_on', since)
    .limit(5000)
  if (error) throw new Error(error.message)
  return (data ?? []).map((s) => ({ ...s, action: s.action as RadarAction }))
}

export async function latestAniListRun(): Promise<RadarRun | null> {
  const { data, error } = await supabase
    .from('radar_runs')
    .select('id, started_at, finished_at, ok, detail')
    .eq('kind', 'anilist')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const d = data.detail
  const snapshots =
    d && typeof d === 'object' && !Array.isArray(d) && typeof d.snapshots === 'number'
      ? d.snapshots
      : null
  return {
    id: data.id,
    started_at: data.started_at,
    finished_at: data.finished_at,
    ok: data.ok,
    snapshots,
  }
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
