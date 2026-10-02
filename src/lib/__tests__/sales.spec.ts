import { describe, expect, it } from 'vitest'
import {
  bundleShares,
  bundleTitle,
  keptCents,
  monthKey,
  saleProfitCents,
  splitByWeights,
  totalsFor,
} from '../sales'

const money = {
  salePriceCents: 1000,
  shippingChargedCents: 400,
  shippingCostCents: 450,
  platformFeeCents: 230,
  otherCostCents: 20,
}

describe('sale money', () => {
  it('keeps price + shipping charged minus fees, shipping and other costs', () => {
    expect(keptCents(money)).toBe(700)
  })

  it('subtracts the cost of every copy sold', () => {
    expect(saleProfitCents(money, 300, 1)).toBe(400)
    expect(saleProfitCents(money, 300, 2)).toBe(100)
  })
})

describe('splitByWeights (mirrors split_cents)', () => {
  it('matches the database for even and uneven splits', () => {
    expect(splitByWeights(1000, [1, 1, 1])).toEqual([333, 333, 334])
    expect(splitByWeights(1000, [0, 1, 0])).toEqual([0, 1000, 0])
    expect(splitByWeights(1001, [2, 1])).toEqual([667, 334])
  })

  it('always adds up exactly', () => {
    for (const [total, weights] of [
      [3600, [1, 1, 1, 1]],
      [1001, [800, 800, 1200]],
      [7, [3, 3, 3]],
      [999_99, [1, 2, 3, 4, 5, 6, 7]],
    ] as const) {
      expect(splitByWeights(total, weights).reduce((a, b) => a + b, 0)).toBe(total)
    }
  })

  it('gives nothing when there is nothing to split across', () => {
    expect(splitByWeights(500, [0, 0])).toEqual([0, 0])
  })
})

describe('bundleShares', () => {
  const twelve = Array.from({ length: 12 }, (_, i) => ({
    id: `v${i + 1}`,
    name: `One Piece Volume ${i + 1}`,
    quantity: 1,
    listPriceCents: 800,
    unitCostCents: 300,
  }))

  it('splits a 12-volume bundle exactly', () => {
    const shares = bundleShares(
      twelve,
      {
        salePriceCents: 5000,
        shippingChargedCents: 700,
        shippingCostCents: 650,
        platformFeeCents: 815,
      },
      'even',
    )
    const sum = (k: 'salePriceCents' | 'platformFeeCents' | 'shippingCostCents') =>
      shares.reduce((a, s) => a + s[k], 0)
    expect(sum('salePriceCents')).toBe(5000)
    expect(sum('platformFeeCents')).toBe(815)
    expect(sum('shippingCostCents')).toBe(650)
    expect(shares[0]?.salePriceCents).toBe(416)
    expect(shares[11]?.salePriceCents).toBe(424)
  })

  it('splits by asking price', () => {
    const shares = bundleShares(
      [
        { id: 'a', name: 'A', quantity: 1, listPriceCents: 1500, unitCostCents: 500 },
        { id: 'b', name: 'B', quantity: 1, listPriceCents: 500, unitCostCents: 100 },
      ],
      { salePriceCents: 1800, shippingChargedCents: 0, shippingCostCents: 0, platformFeeCents: 0 },
      'by_list_price',
    )
    expect(shares.map((s) => s.salePriceCents)).toEqual([1350, 450])
    expect(shares.map((s) => s.profitCents)).toEqual([850, 350])
  })
})

describe('bundleTitle', () => {
  it('names a run of one set', () => {
    const rows = [1, 2, 3, 5].map((n) => ({
      template_name: 'One Piece',
      volume_number: n,
      item_name: `One Piece Volume ${n}`,
    }))
    expect(bundleTitle(rows)).toBe('One Piece Volume 1-3, 5 (bundle)')
  })

  it('falls back to a count for a mix', () => {
    expect(
      bundleTitle([
        { template_name: 'One Piece', volume_number: 1, item_name: 'x' },
        { template_name: null, volume_number: null, item_name: 'Figure' },
      ]),
    ).toBe('2 items (bundle)')
  })
})

describe('totals', () => {
  it('sums a month', () => {
    const s = {
      sold_at: '2026-03-14T23:30:00Z',
      quantity: 1,
      sale_price_cents: 1000,
      shipping_charged_cents: 400,
      shipping_cost_cents: 450,
      platform_fee_cents: 230,
      net_profit_cents: 400,
    }
    expect(totalsFor([s, { ...s, quantity: 2, net_profit_cents: -50 }])).toEqual({
      revenueCents: 2800,
      feesCents: 460,
      shippingCents: 900,
      netProfitCents: 350,
      units: 3,
    })
  })

  it('keys months in local time', () => {
    expect(monthKey(new Date(2026, 2, 31, 23, 0).toISOString())).toBe('2026-03')
  })
})
