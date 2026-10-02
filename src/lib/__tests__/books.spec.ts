import { describe, expect, it } from 'vitest'
import { normalizeIsbn } from '../isbn'
import { parseVolumeFromTitle } from '../titles'
import { calculateMargin, estimateFeeCents, parseFeeRules } from '../fees'

describe('parseVolumeFromTitle', () => {
  it.each([
    ["One Piece, Vol. 3: Don't Get Fooled Again", 'One Piece', 3],
    ['One Piece, Vol. 3', 'One Piece', 3],
    ['Naruto, Volume 7', 'Naruto', 7],
    ['Naruto Volume 7', 'Naruto', 7],
    ['Fullmetal Alchemist Vol 12', 'Fullmetal Alchemist', 12],
    ['Chainsaw Man, 3', 'Chainsaw Man', 3],
    ['Chainsaw Man, Vol. 11', 'Chainsaw Man', 11],
    ['Death Note 5', 'Death Note', 5],
    ['Death Note #5', 'Death Note', 5],
    ['Shaman King (Vol. 20)', 'Shaman King', 20],
    ['Spy x Family, Vol. 1', 'Spy x Family', 1],
  ])('%s -> %s vol %i', (title, series, volume) => {
    expect(parseVolumeFromTitle(title)).toEqual({ series, volume })
  })

  it('returns no volume when the title has none', () => {
    expect(parseVolumeFromTitle('Your Name.')).toEqual({ series: 'Your Name.', volume: null })
    expect(parseVolumeFromTitle('Akira: The Complete Edition')).toEqual({
      series: 'Akira',
      volume: null,
    })
  })

  it("doesn't treat a year or a long number as a volume", () => {
    expect(parseVolumeFromTitle('Blade Runner 2049').volume).toBeNull()
  })
})

describe('normalizeIsbn', () => {
  it('accepts a valid ISBN-13 with hyphens', () => {
    expect(normalizeIsbn('978-1-56931-901-7')).toBe('9781569319017')
  })

  it('converts a valid ISBN-10', () => {
    expect(normalizeIsbn('1-56931-901-4')).toBe('9781569319017')
  })

  it('rejects bad check digits and non-book barcodes', () => {
    expect(normalizeIsbn('9781569319011')).toBeNull()
    expect(normalizeIsbn('0012345678905')).toBeNull()
    expect(normalizeIsbn('abc')).toBeNull()
  })
})

describe('fees and margin', () => {
  const ebay = { percent: 13.6, fixed_cents: 40 }

  it('estimates a percent plus fixed fee', () => {
    expect(estimateFeeCents(1000, ebay)).toBe(176)
    expect(estimateFeeCents(0, ebay)).toBe(0)
  })

  it('calculates keep, profit and margin', () => {
    expect(calculateMargin(1000, 450, ebay)).toEqual({
      feeCents: 176,
      keepCents: 824,
      profitCents: 374,
      marginPercent: 37,
    })
  })

  it('handles a loss and no price', () => {
    expect(calculateMargin(500, 600, { percent: 10, fixed_cents: 50 }).profitCents).toBe(-200)
    expect(calculateMargin(0, 300, ebay).marginPercent).toBeNull()
  })

  it('reads fee rules from app_settings', () => {
    expect(
      parseFeeRules({
        note: 'x',
        platforms: { ebay: { percent: 13.6, fixed_cents: 40 }, mercari: { percent: 10 } },
      }),
    ).toEqual({ ebay, mercari: { percent: 10, fixed_cents: 0 } })
    expect(parseFeeRules(null)).toEqual({})
  })
})
