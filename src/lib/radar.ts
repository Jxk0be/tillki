/** Buy Radar list logic: joins sets to their AniList snapshots and works out trends. */

export type MatchState = 'matched' | 'review' | 'none' | 'pending'

export interface AniListCandidate {
  anilist_id: number
  title: string
  score: number
  format: string | null
  url: string | null
}

export interface RadarSet {
  id: string
  name: string
  anilist_id: number | null
  anilist_match: 'auto' | 'confirmed' | 'none' | null
  anilist_candidates: AniListCandidate[] | null
  volumes_owned: number
  units_in_stock: number
  total_volumes: number | null
  missing_count: number
  missing_ranges: string
}

export interface RadarSnapshot {
  anilist_id: number
  captured_on: string
  trending: number | null
  popularity: number | null
  favourites: number | null
  mean_score: number | null
  status: string | null
  has_upcoming_anime: boolean
  anime_airing: boolean
  next_episode_at: string | null
}

export type RadarAction = 'buy' | 'hold' | 'finish_set' | 'avoid'

export interface RadarScore {
  template_id: string
  scored_on: string
  total: number
  action: RadarAction
  reasons: string[]
}

export const actionLabels: Record<RadarAction, string> = {
  buy: 'Buy',
  finish_set: 'Finish set',
  hold: 'Hold',
  avoid: 'Avoid',
}

export interface RadarRow extends RadarSet {
  match: MatchState
  /** The most recent score, if the nightly run has scored this set. */
  score: RadarScore | null
  latest: RadarSnapshot | null
  /** Popularity gained since the snapshot 7 / 30 days before the latest one (null until there's history). */
  popularity7d: number | null
  popularity30d: number | null
  /** Days of snapshot history for this series. */
  historyDays: number
}

export function matchState(
  s: Pick<RadarSet, 'anilist_id' | 'anilist_match' | 'anilist_candidates'>,
): MatchState {
  if (s.anilist_id !== null) return 'matched'
  if (s.anilist_match === 'none') return 'none'
  if (s.anilist_candidates !== null) return 'review'
  return 'pending'
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/** Latest popularity minus the popularity from at least `days` earlier. */
function popularityChange(history: RadarSnapshot[], days: number): number | null {
  const latest = history[history.length - 1]
  if (!latest || latest.popularity === null) return null
  for (let i = history.length - 2; i >= 0; i--) {
    const h = history[i]!
    if (daysBetween(h.captured_on, latest.captured_on) >= days && h.popularity !== null) {
      return latest.popularity - h.popularity
    }
  }
  return null
}

/** The newest score per set. */
export function latestScores(scores: RadarScore[]): Map<string, RadarScore> {
  const out = new Map<string, RadarScore>()
  for (const s of scores) {
    const seen = out.get(s.template_id)
    if (!seen || s.scored_on > seen.scored_on) out.set(s.template_id, s)
  }
  return out
}

/**
 * One row per set, ranked by score when there is one. Without scores: matched
 * series with data by trending then popularity, then sets waiting on a match,
 * then ones marked "not on AniList".
 */
export function buildRadarRows(
  sets: RadarSet[],
  snapshots: RadarSnapshot[],
  scores: RadarScore[] = [],
): RadarRow[] {
  const scoreById = latestScores(scores)
  const byId = new Map<number, RadarSnapshot[]>()
  for (const s of [...snapshots].sort((a, b) => a.captured_on.localeCompare(b.captured_on))) {
    const list = byId.get(s.anilist_id) ?? []
    list.push(s)
    byId.set(s.anilist_id, list)
  }
  const rank: Record<MatchState, number> = { matched: 0, review: 1, pending: 2, none: 3 }
  return sets
    .map((set) => {
      const history = set.anilist_id !== null ? (byId.get(set.anilist_id) ?? []) : []
      return {
        ...set,
        match: matchState(set),
        score: scoreById.get(set.id) ?? null,
        latest: history[history.length - 1] ?? null,
        popularity7d: popularityChange(history, 7),
        popularity30d: popularityChange(history, 30),
        historyDays: history.length,
      }
    })
    .sort((a, b) => {
      if (!!a.score !== !!b.score) return a.score ? -1 : 1
      if (a.score && b.score && a.score.total !== b.score.total)
        return b.score.total - a.score.total
      const byMatch = rank[a.match] - rank[b.match]
      if (byMatch) return byMatch
      if (!!a.latest !== !!b.latest) return a.latest ? -1 : 1
      const trend = (b.latest?.trending ?? 0) - (a.latest?.trending ?? 0)
      if (trend) return trend
      const pop = (b.latest?.popularity ?? 0) - (a.latest?.popularity ?? 0)
      if (pop) return pop
      return a.name.localeCompare(b.name, undefined, { numeric: true })
    })
}

/** The AniList id in a pasted link like "https://anilist.co/manga/30002/Berserk/", or a bare id. */
export function parseAniListId(input: string): number | null {
  const text = input.trim()
  if (/^\d+$/.test(text)) {
    const n = Number(text)
    return n > 0 ? n : null
  }
  const m = text.match(/anilist\.co\/manga\/(\d+)/i)
  if (!m) return null
  const n = Number(m[1])
  return n > 0 ? n : null
}

export function anilistUrl(id: number): string {
  return `https://anilist.co/manga/${id}`
}

/** "+1,240" / "−35" / "0" for popularity changes. */
export function formatChange(n: number): string {
  const abs = new Intl.NumberFormat('en-US').format(Math.abs(n))
  return n > 0 ? `+${abs}` : n < 0 ? `−${abs}` : '0'
}

/** Whether a run is older than the limit (default 36 hours), for the health line. */
export function isStale(finishedAt: string | null, now: Date, hours = 36): boolean {
  if (!finishedAt) return true
  return now.getTime() - Date.parse(finishedAt) > hours * 3_600_000
}
