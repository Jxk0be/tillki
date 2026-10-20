import { describe, expect, it } from 'vitest'
import { checkLot, splitAsking, unitResale, type LotSetContext } from '../lotCheck'

const fee = { percent: 10, fixed_cents: 0 }

function ctx(p: Partial<LotSetContext> & { template_id: string }): LotSetContext {
  return {
    name: p.template_id,
    total_volumes: null,
    owned: [],
    score: 50,
    action: 'hold',
    avg_sale_cents: null,
    sample_size: 0,
    ebay_median_cents: null,
    ...p,
  }
}

describe('unitResale', () => {
  it('prefers our own sales once there are enough, then eBay asking, then thin sales', () => {
    expect(
      unitResale(
        ctx({ template_id: 'a', avg_sale_cents: 900, sample_size: 3, ebay_median_cents: 700 }),
      ),
    ).toEqual({ cents: 900, basis: 'our sales' })
    expect(
      unitResale(
        ctx({ template_id: 'a', avg_sale_cents: 900, sample_size: 1, ebay_median_cents: 700 }),
      ),
    ).toEqual({ cents: 700, basis: 'eBay asking' })
    expect(unitResale(ctx({ template_id: 'a', avg_sale_cents: 900, sample_size: 1 }))).toEqual({
      cents: 900,
      basis: 'our sales',
    })
    expect(unitResale(ctx({ template_id: 'a' }))).toEqual({ cents: null, basis: null })
  })
})

describe('checkLot', () => {
  // 4 volumes at $10 resale each, 10% fees: resale $40, keep $36.
  const contexts = [
    ctx({
      template_id: 's',
      total_volumes: 5,
      owned: [1, 2],
      avg_sale_cents: 1000,
      sample_size: 5,
    }),
  ]
  const lines = [{ template_id: 's', volumes: [2, 3, 4, 5] }]

  it('works out profit, margin and the max price for a target margin (by hand)', () => {
    const r = checkLot(lines, contexts, 1200, 40, fee)
    expect(r.expected_resale_cents).toBe(4000)
    expect(r.expected_keep_cents).toBe(3600)
    expect(r.profit_cents).toBe(2400) // 36 - 12
    expect(r.margin_percent).toBe(60) // 24 / 40
    expect(r.max_price_cents).toBe(2000) // 36 - 0.4 * 40
    expect(r.verdict).toBe('good')
  })

  it('grades fair and pass against the target', () => {
    expect(checkLot(lines, contexts, 2400, 40, fee).verdict).toBe('fair') // 30%
    expect(checkLot(lines, contexts, 3200, 40, fee).verdict).toBe('pass') // 10%
  })

  it('finds duplicates, filled gaps and a completed set', () => {
    const [s] = checkLot(lines, contexts, 1200, 40, fee).sets
    expect(s!.duplicates).toEqual([2])
    expect(s!.fills_gaps).toEqual([3, 4, 5])
    expect(s!.completes_set).toBe(true)
  })

  it('merges lines for the same set', () => {
    const r = checkLot(
      [
        { template_id: 's', volumes: [3] },
        { template_id: 's', volumes: [3, 4] },
      ],
      contexts,
      0,
      40,
      fee,
    )
    expect(r.sets[0]!.volumes).toEqual([3, 4])
    expect(r.books).toBe(2)
  })

  it('says unknown when nothing can be priced', () => {
    const r = checkLot(
      [{ template_id: 'x', volumes: [1, 2] }],
      [ctx({ template_id: 'x' })],
      500,
      40,
      fee,
    )
    expect(r.verdict).toBe('unknown')
    expect(r.max_price_cents).toBeNull()
    expect(r.books).toBe(2)
  })

  it('prices only the books it can', () => {
    const r = checkLot(
      [
        { template_id: 's', volumes: [3] },
        { template_id: 'x', volumes: [1] },
      ],
      [...contexts, ctx({ template_id: 'x' })],
      300,
      40,
      fee,
    )
    expect(r.books).toBe(2)
    expect(r.priced_books).toBe(1)
    expect(r.expected_resale_cents).toBe(1000)
  })
})

describe('splitAsking', () => {
  it('splits by book count and adds up exactly', () => {
    expect(splitAsking(1000, [{ volumes: [1, 2] }, { volumes: [1] }])).toEqual([666, 334])
    expect(splitAsking(0, [{ volumes: [] }])).toEqual([0])
  })
})
