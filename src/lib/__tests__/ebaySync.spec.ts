import { describe, expect, it } from 'vitest'
import {
  priceRange,
  searchQuery,
  summarize,
  titleMatches,
  totalCents,
} from '../../../supabase/functions/ebay-sync/lib'

describe('searchQuery', () => {
  it('adds manga, and lot for sets', () => {
    expect(searchQuery('Alive (Hajime Taguchi)', 'single')).toBe('Alive manga')
    expect(searchQuery('Witch Hat Atelier', 'set')).toBe('Witch Hat Atelier manga lot')
  })
})

describe('titleMatches', () => {
  it('accepts a single English volume', () => {
    expect(
      titleMatches(
        'Witch Hat Atelier Vol. 3 Manga English Kodansha',
        'Witch Hat Atelier',
        'single',
      ),
    ).toBe(true)
  })

  it('keeps lots out of singles and singles out of lots', () => {
    expect(titleMatches('Witch Hat Atelier Manga Lot Vol 1-8', 'Witch Hat Atelier', 'single')).toBe(
      false,
    )
    expect(titleMatches('Witch Hat Atelier Manga Lot Vol 1-8', 'Witch Hat Atelier', 'set')).toBe(
      true,
    )
    expect(titleMatches('Witch Hat Atelier Vol 2', 'Witch Hat Atelier', 'set')).toBe(false)
  })

  it('rejects other series, languages and merch', () => {
    expect(titleMatches('Tokyo Ghoul:re Vol 3 manga', 'Berserk', 'single')).toBe(false)
    expect(
      titleMatches('Witch Hat Atelier Vol 1 Japanese edition', 'Witch Hat Atelier', 'single'),
    ).toBe(false)
    expect(titleMatches('Witch Hat Atelier poster', 'Witch Hat Atelier', 'single')).toBe(false)
    expect(titleMatches('Chainsaw Man Funko Pop Denji', 'Chainsaw Man', 'single')).toBe(false)
  })

  it('ignores edition words from the set name', () => {
    expect(titleMatches('Berserk Vol 8 Dark Horse manga', 'Berserk Deluxe Edition', 'single')).toBe(
      true,
    )
  })
})

describe('prices', () => {
  it('adds the cheapest shipping and skips non-USD', () => {
    expect(
      totalCents({
        price: { value: '9.99', currency: 'USD' },
        shippingOptions: [
          { shippingCost: { value: '5.00', currency: 'USD' } },
          { shippingCost: { value: '3.50', currency: 'USD' } },
        ],
      }),
    ).toBe(1349)
    expect(totalCents({ price: { value: '10', currency: 'GBP' } })).toBeNull()
    expect(totalCents({ lastSoldPrice: { value: '7.25', currency: 'USD' } })).toBe(725)
  })

  it('summarizes min, median and max', () => {
    expect(summarize([500, 900, 700])).toEqual({
      min_cents: 500,
      median_cents: 700,
      max_cents: 900,
      listing_count: 3,
    })
    expect(summarize([400, 600])).toMatchObject({ median_cents: 500 })
    expect(summarize([])).toBeNull()
  })

  it('prices only matching listings', () => {
    const range = priceRange(
      [
        { title: 'Dandadan Vol 1 manga', price: { value: '8.00', currency: 'USD' } },
        { title: 'Dandadan Vol 2 manga', price: { value: '10.00', currency: 'USD' } },
        { title: 'Dandadan manga lot 1-10', price: { value: '80.00', currency: 'USD' } },
        { title: 'Dandadan keychain', price: { value: '3.00', currency: 'USD' } },
      ],
      'Dandadan',
      'single',
    )
    expect(range).toEqual({ min_cents: 800, median_cents: 900, max_cents: 1000, listing_count: 2 })
  })
})
