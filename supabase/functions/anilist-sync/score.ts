// Buy Radar scorer: pure and deterministic (no Deno or network imports, so Vitest
// can test it). The same inputs always give the same score. Tune weights here.

export const SCORE_CONFIG = {
  weights: {
    momentum: 0.3,
    adaptation: 0.15,
    velocity: 0.25,
    margin: 0.15,
    supply: 0.05,
    set_gap: 0.1,
  },
  /** Shrinkage toward neutral for sales-based signals: with n sales, (n*raw + k*0.5) / (n + k). */
  shrinkK: 5,
  buyAt: 70,
  /** finish_set: this few volumes missing and a set_gap at least this high. */
  finishSetMaxMissing: 3,
  finishSetMinGap: 0.6,
  /** avoid: at least this many stale copies and momentum below this. */
  avoidMinStale: 3,
  avoidMaxMomentum: 0.4,
  /** A margin of this percent or more counts as 1.0. */
  fullMarginPct: 50,
  /** Selling in this many days or fewer counts as fast (1.0); 90+ as 0. */
  fastDays: 14,
  slowDays: 90,
  /** Selling this many in 30 days counts as 1.0. */
  hot30d: 5,
  /** Listings at or above this count as a crowded market (supply 0). */
  crowdedListings: 100,
}

export type ScoreConfig = typeof SCORE_CONFIG
export type Action = 'buy' | 'hold' | 'finish_set' | 'avoid'

export interface SnapshotPoint {
  captured_on: string
  trending: number | null
  popularity: number | null
  has_upcoming_anime: boolean
  anime_airing: boolean
}

export interface Performance {
  units_sold: number
  units_on_hand: number
  margin_pct: number | null
  median_days_to_sell: number | null
  sold_last_30d: number
  stale_count: number
  sample_size: number
}

export interface SetInput {
  template_id: string
  name: string
  /** Oldest first, about 35 days. Empty when not on AniList or not matched. */
  snapshots: SnapshotPoint[]
  performance: Performance | null
  total_volumes: number | null
  volumes_owned: number
  missing_count: number
  /** Latest eBay listing count, if any. */
  listing_count: number | null
  on_watchlist: boolean
}

export interface Components {
  momentum: number
  adaptation: number
  velocity: number
  margin: number
  supply: number
  set_gap: number
}

export interface Score {
  template_id: string
  total: number
  components: Components
  action: Action
  reasons: string[]
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const round3 = (n: number) => Math.round(n * 1000) / 1000

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/** Relative popularity growth from at least `days` before the latest snapshot, or null. */
export function popularityGrowth(snapshots: SnapshotPoint[], days: number): number | null {
  const latest = snapshots[snapshots.length - 1]
  if (!latest?.popularity) return null
  for (let i = snapshots.length - 2; i >= 0; i--) {
    const s = snapshots[i]!
    if (daysBetween(s.captured_on, latest.captured_on) >= days && s.popularity) {
      return (latest.popularity - s.popularity) / s.popularity
    }
  }
  return null
}

/** Where a value falls among all values, 0..1 (ties share the middle rank). */
export function percentileRank(value: number, all: number[]): number {
  if (all.length <= 1) return 0.5
  let below = 0
  let equal = 0
  for (const v of all) {
    if (v < value) below++
    else if (v === value) equal++
  }
  return (below + (equal - 1) / 2) / (all.length - 1)
}

/** Pulls a sales-based signal toward 0.5 when there are few sales. */
export function shrink(raw: number, n: number, k: number): number {
  return (n * raw + k * 0.5) / (n + k)
}

interface Market {
  trending: number[]
  growth7: number[]
  growth30: number[]
}

/** The cross-series values momentum is normalised against. */
export function marketOf(sets: SetInput[]): Market {
  const market: Market = { trending: [], growth7: [], growth30: [] }
  for (const s of sets) {
    const latest = s.snapshots[s.snapshots.length - 1]
    if (!latest) continue
    market.trending.push(latest.trending ?? 0)
    const g7 = popularityGrowth(s.snapshots, 7)
    const g30 = popularityGrowth(s.snapshots, 30)
    if (g7 !== null) market.growth7.push(g7)
    if (g30 !== null) market.growth30.push(g30)
  }
  return market
}

function momentumOf(s: SetInput, market: Market): number {
  const latest = s.snapshots[s.snapshots.length - 1]
  if (!latest) return 0.5
  const parts = [percentileRank(latest.trending ?? 0, market.trending)]
  const g7 = popularityGrowth(s.snapshots, 7)
  const g30 = popularityGrowth(s.snapshots, 30)
  if (g7 !== null) parts.push(percentileRank(g7, market.growth7))
  if (g30 !== null) parts.push(percentileRank(g30, market.growth30))
  return parts.reduce((a, b) => a + b, 0) / parts.length
}

function adaptationOf(s: SetInput): number {
  const latest = s.snapshots[s.snapshots.length - 1]
  if (!latest) return 0
  if (latest.has_upcoming_anime) return 1
  if (latest.anime_airing) return 0.8
  // A season that ended within the snapshot window still lifts demand a little.
  if (s.snapshots.some((p) => p.anime_airing)) return 0.4
  return 0
}

function velocityOf(p: Performance | null, c: ScoreConfig): number {
  if (!p || p.sample_size === 0) return 0.5
  const recent = clamp01(p.sold_last_30d / c.hot30d)
  const speed =
    p.median_days_to_sell === null
      ? 0.5
      : clamp01(1 - (p.median_days_to_sell - c.fastDays) / (c.slowDays - c.fastDays))
  return shrink((recent + speed) / 2, p.sample_size, c.shrinkK)
}

function marginOf(p: Performance | null, c: ScoreConfig): number {
  if (!p || p.margin_pct === null || p.sample_size === 0) return 0.5
  return shrink(clamp01(p.margin_pct / c.fullMarginPct), p.sample_size, c.shrinkK)
}

function supplyOf(s: SetInput, c: ScoreConfig): number {
  if (s.listing_count === null) return 0.5
  return clamp01(1 - s.listing_count / c.crowdedListings)
}

function setGapOf(s: SetInput, velocity: number, c: ScoreConfig): number {
  if (!s.total_volumes || s.total_volumes <= 1 || s.missing_count <= 0) return 0
  const owned = clamp01(s.volumes_owned / s.total_volumes)
  if (s.missing_count <= c.finishSetMaxMissing && owned >= 0.5) {
    // 1 missing = 1.0, 2 = 0.8, 3 = 0.6, lifted when the set sells well.
    const closeness = 1 - (s.missing_count - 1) * 0.2
    return clamp01(closeness * (0.75 + 0.25 * velocity))
  }
  return round3(owned * 0.5)
}

function reasonsFor(s: SetInput, comp: Components): string[] {
  const reasons: string[] = []
  const latest = s.snapshots[s.snapshots.length - 1]
  const p = s.performance
  if (latest?.has_upcoming_anime) reasons.push('Anime announced')
  else if (latest?.anime_airing) reasons.push('Anime airing now')
  else if (comp.adaptation > 0) reasons.push('Anime season just ended')
  if (s.missing_count > 0 && comp.set_gap >= 0.6)
    reasons.push(
      `${s.missing_count} ${s.missing_count === 1 ? 'volume' : 'volumes'} from a full set`,
    )
  const g7 = popularityGrowth(s.snapshots, 7)
  if (g7 !== null && comp.momentum >= 0.7) reasons.push('Popularity rising fast on AniList')
  else if (g7 !== null && comp.momentum <= 0.3) reasons.push('Interest cooling on AniList')
  else if ((latest?.trending ?? 0) > 0 && comp.momentum >= 0.7) reasons.push('Trending on AniList')
  if (p && p.sold_last_30d > 0) reasons.push(`Sold ${p.sold_last_30d} in 30 days`)
  if (p && p.stale_count > 0)
    reasons.push(`${p.stale_count} ${p.stale_count === 1 ? 'copy' : 'copies'} stale`)
  if (p && p.margin_pct !== null && p.sample_size > 0)
    reasons.push(`${Math.round(p.margin_pct)}% margin`)
  if (!p || p.sample_size === 0) reasons.push('No sales yet, so the score uses trends only')
  if (s.snapshots.length === 0) reasons.push('No AniList data')
  else if (popularityGrowth(s.snapshots, 7) === null) reasons.push('Under a week of trend history')
  if (s.on_watchlist) reasons.push('On your watchlist')
  return reasons
}

/** Scores every set against the others (momentum is relative to the whole list). */
export function scoreAll(sets: SetInput[], config: ScoreConfig = SCORE_CONFIG): Score[] {
  const market = marketOf(sets)
  return sets.map((s) => {
    const velocity = velocityOf(s.performance, config)
    const components: Components = {
      momentum: round3(momentumOf(s, market)),
      adaptation: adaptationOf(s),
      velocity: round3(velocity),
      margin: round3(marginOf(s.performance, config)),
      supply: round3(supplyOf(s, config)),
      set_gap: round3(setGapOf(s, velocity, config)),
    }
    const w = config.weights
    const weighted =
      components.momentum * w.momentum +
      components.adaptation * w.adaptation +
      components.velocity * w.velocity +
      components.margin * w.margin +
      components.supply * w.supply +
      components.set_gap * w.set_gap
    const weightSum = Object.values(w).reduce((a, b) => a + b, 0)
    const total = Math.round((weighted / weightSum) * 100)

    let action: Action = 'hold'
    const stale = s.performance?.stale_count ?? 0
    if (
      s.missing_count >= 1 &&
      s.missing_count <= config.finishSetMaxMissing &&
      components.set_gap >= config.finishSetMinGap
    )
      action = 'finish_set'
    else if (stale >= config.avoidMinStale && components.momentum < config.avoidMaxMomentum)
      action = 'avoid'
    else if (total >= config.buyAt) action = 'buy'

    return {
      template_id: s.template_id,
      total,
      components,
      action,
      reasons: reasonsFor(s, components),
    }
  })
}
