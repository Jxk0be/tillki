import { describe, expect, it } from 'vitest'
import {
  RequestBody as DraftRequest,
  clampTitle,
  factsText,
  finishDraft,
} from '../../../supabase/functions/draft-listing/lib'
import {
  enforceConfidence,
  formulaMaxPriceCents,
  splitOffered,
  summarizeHistory,
  type SaleRow,
} from '../../../supabase/functions/deal-check/lib'

const ID = '7d1c0a5e-8b2f-4c3d-9e6f-1a2b3c4d5e6f'

describe('draft-listing helpers', () => {
  it('keeps eBay titles at 80 characters, cutting at a word', () => {
    const long =
      'One Piece Vol 1-12 Manga Lot English Viz Media Paperback Shonen Jump Graphic Novels Very Good'
    const t = clampTitle(long, 80)
    expect(t.length).toBeLessThanOrEqual(80)
    expect(long.startsWith(t)).toBe(true)
    expect(t.endsWith(' ')).toBe(false)
    expect(clampTitle('  Short   title ', 80)).toBe('Short title')
  })

  it('cleans the draft: title limit, unique tags, trimmed flaws', () => {
    const d = finishDraft(
      {
        title: 'x '.repeat(60),
        description: ' Nice copy. ',
        condition_notes: ' ',
        suggested_tags: ['manga', ' manga', '', 'one piece'],
        flaws_seen: [' spine crease ', ''],
      },
      'ebay',
    )
    expect(d.title.length).toBeLessThanOrEqual(80)
    expect(d.suggested_tags).toEqual(['manga', 'one piece'])
    expect(d.flaws_seen).toEqual(['spine crease'])
    expect(d.description).toBe('Nice copy.')
  })

  it('takes one item or a bundle, not both', () => {
    expect(DraftRequest.safeParse({ item_id: ID, platform: 'ebay' }).success).toBe(true)
    expect(DraftRequest.safeParse({ item_ids: [ID], platform: 'mercari' }).success).toBe(true)
    expect(DraftRequest.safeParse({ item_id: ID, item_ids: [ID], platform: 'ebay' }).success).toBe(
      false,
    )
    expect(DraftRequest.safeParse({ platform: 'ebay' }).success).toBe(false)
    expect(DraftRequest.safeParse({ item_id: ID, platform: 'etsy' }).success).toBe(false)
  })

  it('tells Claude when photos are only examples of the set', () => {
    const facts = {
      kind: 'set_volume' as const,
      title: 'One Piece Volume 3',
      set_name: 'One Piece',
      volumes: '3',
      series: 'One Piece',
      category: 'manga',
      condition: 'good',
      isbn: null,
      sku: 'MG-00003',
      description: null,
      tags: [],
      copies_available: 1,
      asking_price: '$8.00',
    }
    expect(factsText(facts, { count: 2, examples: true })).toMatch(/EXAMPLE photos of the set/)
    expect(factsText(facts, { count: 2, examples: false })).toMatch(/this exact copy/)
    expect(factsText(facts, { count: 0, examples: false })).toMatch(/no photos/)
  })
})

describe('deal-check helpers', () => {
  const sale = (over: Partial<SaleRow> = {}): SaleRow => ({
    quantity: 1,
    revenue_cents: 1000,
    platform_fee_cents: 130,
    shipping_cost_cents: 70,
    other_cost_cents: 0,
    net_profit_cents: 500,
    days_to_sell: 20,
    ...over,
  })

  it('summarizes our history per unit', () => {
    const h = summarizeHistory(
      [sale(), sale({ quantity: 3, revenue_cents: 2400, days_to_sell: 40 })],
      4,
    )
    expect(h.sale_count).toBe(2)
    expect(h.units_sold).toBe(4)
    expect(h.avg_sale_price_per_unit_cents).toBe(850)
    // kept: (1000-200) + (2400-200) = 3000 over 4 units
    expect(h.avg_kept_per_unit_cents).toBe(750)
    expect(h.avg_days_to_sell).toBe(35)
    expect(h.sell_through).toBe(0.5)
  })

  it('has no averages without sales', () => {
    const h = summarizeHistory([], 3)
    expect(h.avg_kept_per_unit_cents).toBeNull()
    expect(h.sell_through).toBe(0)
    expect(formulaMaxPriceCents(h, 12, 40)).toBeNull()
  })

  it('works out the max price for the target margin', () => {
    const h = summarizeHistory([sale()], 0) // keeps $8.00 a unit
    expect(formulaMaxPriceCents(h, 12, 40)).toBe(5760) // 800 x 12 x 0.6
    expect(formulaMaxPriceCents(h, 12, 0)).toBe(9600)
  })

  it('splits offered volumes into gaps, duplicates and ones past the end', () => {
    expect(splitOffered([1, 2, 3, 4, 34, 3], [3, 4, 5], 32)).toEqual({
      fills_gaps: [1, 2],
      duplicates: [3, 4],
      beyond_total: [34],
    })
    expect(splitOffered([40], [], null)).toEqual({
      fills_gaps: [40],
      duplicates: [],
      beyond_total: [],
    })
  })

  it('forces low confidence under 3 sales', () => {
    const v = {
      verdict: 'buy' as const,
      max_price_cents: 100,
      reasoning: 'ok',
      confidence: 'high' as const,
    }
    expect(enforceConfidence(v, 2).confidence).toBe('low')
    expect(enforceConfidence(v, 3).confidence).toBe('high')
  })
})
