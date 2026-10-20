import { describe, expect, it } from 'vitest'
import {
  Digest,
  priceCeiling,
  sanitizeDigest,
  selectForDigest,
  type SeriesFacts,
} from '../../../supabase/functions/radar-digest/lib'

function facts(p: Partial<SeriesFacts> & { series_id: string }): SeriesFacts {
  return {
    name: p.series_id,
    score: 50,
    action: 'hold',
    components: {},
    reasons: [],
    missing_ranges: '',
    performance: null,
    prices: null,
    watchlist: null,
    ...p,
  }
}

describe('selectForDigest', () => {
  it('takes the top scores plus every finish, avoid and watchlist series', () => {
    const all = [
      facts({ series_id: 'top1', score: 90 }),
      facts({ series_id: 'top2', score: 80 }),
      facts({ series_id: 'low-finish', score: 10, action: 'finish_set' }),
      facts({ series_id: 'low-avoid', score: 5, action: 'avoid' }),
      facts({ series_id: 'low-watch', score: 3, watchlist: { max_buy_cents: 400, note: null } }),
      facts({ series_id: 'low-hold', score: 2 }),
    ]
    expect(selectForDigest(all, 2).map((s) => s.series_id)).toEqual([
      'top1',
      'top2',
      'low-finish',
      'low-avoid',
      'low-watch',
    ])
  })
})

describe('priceCeiling', () => {
  it('uses the highest of our average sale and the asking range', () => {
    expect(
      priceCeiling(
        facts({
          series_id: 'a',
          performance: {
            units_on_hand: 1,
            units_sold: 3,
            avg_cost_cents: 300,
            avg_sale_cents: 900,
            avg_net_cents: 700,
            margin_pct: 40,
            median_days_to_sell: 10,
            sold_last_30d: 1,
            stale_count: 0,
            sample_size: 3,
          },
          prices: {
            source: 'eBay asking',
            min_cents: 500,
            median_cents: 800,
            max_cents: 1200,
            listing_count: 9,
          },
        }),
      ),
    ).toBe(1200)
  })

  it('is null without any price data', () => {
    expect(priceCeiling(facts({ series_id: 'a' }))).toBeNull()
  })
})

describe('sanitizeDigest', () => {
  const input = [
    facts({
      series_id: 'priced',
      prices: {
        source: 'eBay asking',
        min_cents: 400,
        median_cents: 600,
        max_cents: 800,
        listing_count: 4,
      },
    }),
    facts({ series_id: 'unpriced' }),
  ]

  it('drops unknown series and clears prices the data does not support', () => {
    const d = Digest.parse({
      buy: [
        { series_id: 'priced', why: 'a', suggested_max_cents: 700 },
        { series_id: 'priced', why: 'too high', suggested_max_cents: 5000 },
        { series_id: 'unpriced', why: 'made up price', suggested_max_cents: 300 },
        { series_id: 'invented', why: 'not in input', suggested_max_cents: null },
      ],
      finish_sets: [],
      stop_buying: [],
      watch: [],
      notes: 'ok',
    })
    const clean = sanitizeDigest(d, input)
    expect(clean.buy).toEqual([
      { series_id: 'priced', why: 'a', suggested_max_cents: 700 },
      { series_id: 'priced', why: 'too high', suggested_max_cents: null },
      { series_id: 'unpriced', why: 'made up price', suggested_max_cents: null },
    ])
  })

  it('rejects replies in the wrong shape', () => {
    expect(Digest.safeParse({ buy: 'lots' }).success).toBe(false)
    expect(
      Digest.safeParse({
        buy: [{ series_id: 'x', why: '', suggested_max_cents: null }],
        finish_sets: [],
        stop_buying: [],
        watch: [],
        notes: '',
      }).success,
    ).toBe(false)
  })
})
