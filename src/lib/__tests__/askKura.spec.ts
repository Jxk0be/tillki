import { describe, expect, it } from 'vitest'
import {
  cleanTitle,
  groupExpenses,
  groupSales,
  inputSchema,
  isToolName,
  likePattern,
  parseToolInput,
  todayNY,
  toHistory,
  type SaleLike,
} from '../../../supabase/functions/ask-kura/lib'

const sale = (over: Partial<SaleLike>): SaleLike => ({
  sold_on: '2026-03-02',
  platform: 'ebay',
  series: null,
  template_name: null,
  category: 'manga',
  quantity: 1,
  revenue_cents: 1000,
  platform_fee_cents: 100,
  shipping_cost_cents: 0,
  net_profit_cents: 500,
  ...over,
})

describe('ask-kura tool inputs', () => {
  it('validates dates, enums and caps', () => {
    expect(
      parseToolInput('get_sales_summary', {
        start: '2026-01-01',
        end: '2026-12-31',
        group_by: 'month',
      }).ok,
    ).toBe(true)
    const bad = parseToolInput('get_sales_summary', {
      start: 'January',
      end: '2026-12-31',
      group_by: 'week',
    })
    expect(bad).toMatchObject({
      ok: false,
      error: expect.stringMatching(/start: Use a YYYY-MM-DD date/),
    })
    expect(parseToolInput('search_items', { limit: 500 }).ok).toBe(false)
    expect(parseToolInput('search_items', {}).ok).toBe(true)
    expect(parseToolInput('get_overview', undefined).ok).toBe(true)
  })

  it('builds object JSON schemas for the Messages API', () => {
    const schema = inputSchema('get_sets')
    expect(schema.type).toBe('object')
    expect(schema).not.toHaveProperty('$schema')
    expect(Object.keys(schema.properties as object)).toEqual(['query', 'only_incomplete'])
  })

  it('knows its tool names', () => {
    expect(isToolName('get_sets')).toBe(true)
    expect(isToolName('drop_table')).toBe(false)
    expect(isToolName('toString')).toBe(false)
  })

  it('makes search text safe for PostgREST filters', () => {
    expect(likePattern('One Piece, (vol 3)')).toBe('*One Piece vol 3*')
    expect(likePattern('100%_off')).toBe('*100 off*')
    expect(likePattern('  ')).toBeNull()
    expect(likePattern(undefined)).toBeNull()
  })
})

describe('ask-kura grouping', () => {
  const rows = [
    sale({
      sold_on: '2026-02-10',
      platform: 'mercari',
      revenue_cents: 2000,
      net_profit_cents: 800,
    }),
    sale({ template_name: 'One Piece', series: 'One Piece', quantity: 2 }),
    sale({ sold_on: '2026-01-05', series: 'Naruto', category: 'figure' }),
  ]

  it('groups sales by month in order with totals', () => {
    const { groups, totals } = groupSales(rows, 'month')
    expect(groups.map((g) => g.key)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(totals).toEqual({
      sale_count: 3,
      units: 4,
      revenue_cents: 4000,
      fees_cents: 300,
      shipping_paid_cents: 0,
      net_profit_cents: 1800,
    })
  })

  it('groups by platform and series, biggest revenue first', () => {
    expect(groupSales(rows, 'platform').groups.map((g) => [g.key, g.revenue_cents])).toEqual([
      ['mercari', 2000],
      ['ebay', 2000],
    ])
    expect(
      groupSales(rows, 'series')
        .groups.map((g) => g.key)
        .sort(),
    ).toEqual(['Naruto', 'No series', 'One Piece'])
  })

  it('groups expenses', () => {
    const r = groupExpenses(
      [
        { incurred_at: '2026-02-01', category: 'supplies', amount_cents: 500 },
        { incurred_at: '2026-02-20', category: 'shipping', amount_cents: 900 },
        { incurred_at: '2026-01-03', category: 'supplies', amount_cents: 100 },
      ],
      'category',
    )
    expect(r.total_cents).toBe(1500)
    expect(r.groups).toEqual([
      { key: 'shipping', count: 1, amount_cents: 900 },
      { key: 'supplies', count: 2, amount_cents: 600 },
    ])
  })
})

describe('ask-kura history and titles', () => {
  it('starts with the user, alternates, and drops blanks', () => {
    expect(
      toHistory([
        { role: 'assistant', content: 'orphan' },
        { role: 'user', content: 'a' },
        { role: 'user', content: 'b' },
        { role: 'assistant', content: '  ' },
        { role: 'assistant', content: 'c' },
        { role: 'system', content: 'x' },
      ]),
    ).toEqual([
      { role: 'user', content: 'a\n\nb' },
      { role: 'assistant', content: 'c' },
    ])
  })

  it('cleans titles to at most six words', () => {
    expect(cleanTitle('"Missing One Piece volumes."', 'q')).toBe('Missing One Piece volumes')
    expect(cleanTitle('one two three four five six seven', 'q')).toBe('one two three four five six')
    expect(cleanTitle('  ', 'What did we sell in March?')).toBe('What did we sell in March?')
  })

  it("gives today's date in New York", () => {
    // 02:00 UTC on Oct 2 is still Oct 1 in New York.
    expect(todayNY(new Date('2026-10-02T02:00:00Z'))).toBe('2026-10-01')
  })
})
