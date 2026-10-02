import { describe, expect, it } from 'vitest'
import { centsToDollars, expensesByCategory, taxTotals, yearRange } from '../taxes'
import { droppedPrice } from '@/composables/useStale'

describe('tax summary', () => {
  it('adds up the year and subtracts expenses for net profit', () => {
    const month = {
      revenue_cents: 1500,
      shipping_charged_cents: 300,
      fees_cents: 150,
      shipping_paid_cents: 250,
      other_costs_cents: 0,
      cogs_cents: 500,
      sales_profit_cents: 600,
      expenses_cents: 400,
      units_sold: 1,
    }
    const t = taxTotals([month, { ...month, expenses_cents: 0 }])
    expect(t.gross_receipts_cents).toBe(3000)
    expect(t.cogs_cents).toBe(1000)
    expect(t.sales_profit_cents).toBe(1200)
    expect(t.expenses_cents).toBe(400)
    expect(t.net_profit_cents).toBe(800)
    expect(t.units_sold).toBe(2)
    // Gross receipts minus every cost equals sales profit.
    expect(
      t.gross_receipts_cents -
        t.fees_cents -
        t.shipping_paid_cents -
        t.other_sale_costs_cents -
        t.cogs_cents,
    ).toBe(t.sales_profit_cents)
  })

  it('groups expenses by category, biggest first', () => {
    expect(
      expensesByCategory([
        { category: 'supplies', amount_cents: 100 },
        { category: 'travel', amount_cents: 900 },
        { category: 'supplies', amount_cents: 250 },
      ]),
    ).toEqual([
      { category: 'travel', amount_cents: 900 },
      { category: 'supplies', amount_cents: 350 },
    ])
  })

  it('writes dollars with two decimals for CSV', () => {
    expect(centsToDollars(123456)).toBe('1234.56')
    expect(centsToDollars(5)).toBe('0.05')
    expect(centsToDollars(-50)).toBe('-0.50')
    expect(centsToDollars(null)).toBe('')
  })

  it('covers the whole calendar year', () => {
    expect(yearRange(2026)).toEqual({ start: '2026-01-01', end: '2026-12-31' })
  })
})

describe('stale price drops', () => {
  it('rounds down to whole cents', () => {
    expect(droppedPrice(1000, 10)).toBe(900)
    expect(droppedPrice(999, 20)).toBe(799)
    expect(droppedPrice(0, 20)).toBe(0)
  })
})
