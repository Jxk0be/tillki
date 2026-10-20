import { describe, expect, it } from 'vitest'
import {
  SCORE_CONFIG,
  percentileRank,
  popularityGrowth,
  scoreAll,
  shrink,
  type Performance,
  type SetInput,
  type SnapshotPoint,
} from '../../../supabase/functions/anilist-sync/score'

function snaps(
  points: [string, number, number][],
  flags: Partial<SnapshotPoint> = {},
): SnapshotPoint[] {
  return points.map(([captured_on, popularity, trending]) => ({
    captured_on,
    popularity,
    trending,
    has_upcoming_anime: false,
    anime_airing: false,
    ...flags,
  }))
}

function perf(p: Partial<Performance> = {}): Performance {
  return {
    units_sold: 0,
    units_on_hand: 1,
    margin_pct: null,
    median_days_to_sell: null,
    sold_last_30d: 0,
    stale_count: 0,
    sample_size: 0,
    ...p,
  }
}

function input(p: Partial<SetInput> & { template_id: string }): SetInput {
  return {
    name: p.template_id,
    snapshots: [],
    performance: null,
    total_volumes: null,
    volumes_owned: 1,
    missing_count: 0,
    listing_count: null,
    on_watchlist: false,
    ...p,
  }
}

const byId = (list: ReturnType<typeof scoreAll>, id: string) =>
  list.find((s) => s.template_id === id)!

describe('helpers', () => {
  it('measures popularity growth over a window', () => {
    const s = snaps([
      ['2026-10-01', 100, 0],
      ['2026-10-08', 110, 0],
      ['2026-10-09', 120, 0],
    ])
    expect(popularityGrowth(s, 7)).toBeCloseTo(0.2)
    expect(popularityGrowth(s, 30)).toBeNull()
  })

  it('ranks values between 0 and 1', () => {
    expect(percentileRank(5, [1, 5, 9])).toBe(0.5)
    expect(percentileRank(9, [1, 5, 9])).toBe(1)
    expect(percentileRank(1, [1, 5, 9])).toBe(0)
    expect(percentileRank(3, [3])).toBe(0.5)
  })

  it('shrinks thin sales data toward neutral', () => {
    expect(shrink(1, 0, 5)).toBe(0.5)
    expect(shrink(1, 5, 5)).toBe(0.75)
    expect(shrink(1, 95, 5)).toBeCloseTo(0.975)
  })
})

describe('scoreAll', () => {
  it('scores a set with no sales history and no AniList match as neutral hold', () => {
    const [s] = scoreAll([input({ template_id: 'blank' })])
    expect(s!.components).toEqual({
      momentum: 0.5,
      adaptation: 0,
      velocity: 0.5,
      margin: 0.5,
      supply: 0.5,
      set_gap: 0,
    })
    expect(s!.action).toBe('hold')
    expect(s!.reasons).toContain('No sales yet, so the score uses trends only')
    expect(s!.reasons).toContain('No AniList data')
  })

  it('stays neutral on price when there is no eBay data', () => {
    const [s] = scoreAll([input({ template_id: 'x' })])
    expect(s!.components.supply).toBe(0.5)
  })

  it('pushes a hot adaptation that sells well to buy', () => {
    const scores = scoreAll([
      input({
        template_id: 'hot',
        snapshots: snaps(
          [
            ['2026-10-01', 1000, 50],
            ['2026-10-09', 1500, 90],
          ],
          { has_upcoming_anime: true },
        ),
        performance: perf({
          units_sold: 20,
          sample_size: 20,
          sold_last_30d: 8,
          median_days_to_sell: 7,
          margin_pct: 55,
        }),
      }),
      input({
        template_id: 'cold',
        snapshots: snaps([
          ['2026-10-01', 1000, 0],
          ['2026-10-09', 1001, 0],
        ]),
      }),
    ])
    const hot = byId(scores, 'hot')
    expect(hot.components.adaptation).toBe(1)
    expect(hot.total).toBeGreaterThanOrEqual(SCORE_CONFIG.buyAt)
    expect(hot.action).toBe('buy')
    expect(hot.reasons).toEqual(
      expect.arrayContaining(['Anime announced', 'Sold 8 in 30 days', '55% margin']),
    )
    expect(byId(scores, 'cold').total).toBeLessThan(hot.total)
  })

  it('says avoid for a dead series with stale stock', () => {
    const scores = scoreAll([
      input({
        template_id: 'dead',
        snapshots: snaps([
          ['2026-10-01', 1000, 0],
          ['2026-10-09', 1000, 0],
        ]),
        performance: perf({
          stale_count: 4,
          units_on_hand: 6,
          sample_size: 2,
          units_sold: 2,
          median_days_to_sell: 120,
        }),
      }),
      input({
        template_id: 'alive',
        snapshots: snaps([
          ['2026-10-01', 1000, 30],
          ['2026-10-09', 1300, 40],
        ]),
      }),
    ])
    const dead = byId(scores, 'dead')
    expect(dead.action).toBe('avoid')
    expect(dead.reasons).toContain('4 copies stale')
  })

  it('says finish_set for a near-complete set', () => {
    const [s] = scoreAll([
      input({ template_id: 'nearly', total_volumes: 10, volumes_owned: 9, missing_count: 1 }),
    ])
    expect(s!.components.set_gap).toBeGreaterThanOrEqual(SCORE_CONFIG.finishSetMinGap)
    expect(s!.action).toBe('finish_set')
    expect(s!.reasons).toContain('1 volume from a full set')
  })

  it('does not call a barely started set nearly complete', () => {
    const [s] = scoreAll([
      input({ template_id: 'start', total_volumes: 20, volumes_owned: 2, missing_count: 18 }),
    ])
    expect(s!.action).not.toBe('finish_set')
    expect(s!.components.set_gap).toBe(0.05)
  })

  it('changes the ranking when a weight changes', () => {
    const sets = [
      input({
        template_id: 'trendy',
        snapshots: snaps([['2026-10-09', 1000, 90]]),
      }),
      input({
        template_id: 'seller',
        snapshots: snaps([['2026-10-09', 1000, 0]]),
        performance: perf({
          sample_size: 30,
          units_sold: 30,
          sold_last_30d: 10,
          median_days_to_sell: 5,
        }),
      }),
    ]
    const normal = scoreAll(sets)
    const salesHeavy = scoreAll(sets, {
      ...SCORE_CONFIG,
      weights: { ...SCORE_CONFIG.weights, momentum: 0.05, velocity: 0.6 },
    })
    expect(byId(normal, 'trendy').total).toBeGreaterThan(byId(normal, 'seller').total)
    expect(byId(salesHeavy, 'seller').total).toBeGreaterThan(byId(salesHeavy, 'trendy').total)
  })

  it('is deterministic', () => {
    const sets = [input({ template_id: 'a', snapshots: snaps([['2026-10-09', 10, 1]]) })]
    expect(scoreAll(sets)).toEqual(scoreAll(sets))
  })

  it('notes the watchlist', () => {
    const [s] = scoreAll([input({ template_id: 'w', on_watchlist: true })])
    expect(s!.reasons).toContain('On your watchlist')
  })
})
