import { describe, expect, it } from 'vitest'
import { buildVolumeStatus, formatRanges, parseVolumeInput, type SetVolumeRow } from '../volumes'

describe('parseVolumeInput', () => {
  it('parses ranges and singles into sorted unique numbers', () => {
    expect(parseVolumeInput('1-12, 14, 16-18')).toEqual({
      volumes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 17, 18],
      errors: [],
    })
  })

  it('returns nothing for empty input', () => {
    expect(parseVolumeInput('')).toEqual({ volumes: [], errors: [] })
    expect(parseVolumeInput('   ')).toEqual({ volumes: [], errors: [] })
  })

  it('accepts reversed ranges', () => {
    expect(parseVolumeInput('5-1').volumes).toEqual([1, 2, 3, 4, 5])
  })

  it('removes duplicates and overlaps', () => {
    expect(parseVolumeInput('3, 3, 1-4, 2').volumes).toEqual([1, 2, 3, 4])
  })

  it('tolerates spaces and dashes around ranges', () => {
    expect(parseVolumeInput('1 - 3; 7 – 8').volumes).toEqual([1, 2, 3, 7, 8])
  })

  it('rejects 0', () => {
    const result = parseVolumeInput('0, 2')
    expect(result.volumes).toEqual([2])
    expect(result.errors).toEqual(['Volume numbers start at 1.'])
  })

  it('rejects junk text but keeps the valid parts', () => {
    const result = parseVolumeInput('1, abc, 3-x, 4')
    expect(result.volumes).toEqual([1, 4])
    expect(result.errors).toEqual([
      '"abc" isn\'t a volume number or range.',
      '"3-x" isn\'t a volume number or range.',
    ])
  })

  it('rejects ranges over 500 volumes', () => {
    const result = parseVolumeInput('1-501')
    expect(result.volumes).toEqual([])
    expect(result.errors[0]).toMatch(/more than 500/)
    expect(parseVolumeInput('1-500').volumes).toHaveLength(500)
  })
})

describe('formatRanges', () => {
  it('collapses runs', () => {
    const owned = [1, 2, ...Array.from({ length: 12 }, (_, i) => 21 + i)]
    expect(formatRanges(owned)).toBe('1-2, 21-32')
  })

  it('handles empty, single, unsorted and duplicate input', () => {
    expect(formatRanges([])).toBe('')
    expect(formatRanges([7])).toBe('7')
    expect(formatRanges([5, 1, 1, 3, 2])).toBe('1-3, 5')
  })

  it('round-trips with parseVolumeInput', () => {
    expect(formatRanges(parseVolumeInput('16-30, 1-12, 14').volumes)).toBe('1-12, 14, 16-30')
  })
})

describe('buildVolumeStatus', () => {
  const row = (volume_number: number, extra: Partial<SetVolumeRow> = {}): SetVolumeRow => ({
    id: `item-${volume_number}`,
    volume_number,
    status: 'in_stock',
    quantity: 1,
    units_left: 1,
    units_sold: 0,
    ...extra,
  })

  it('fills every volume up to the known total', () => {
    const strip = buildVolumeStatus(
      [row(2), row(3, { units_left: 0, units_sold: 1, status: 'sold' })],
      5,
    )
    expect(strip.map((r) => `${r.volume_number}:${r.state}`)).toEqual([
      '1:missing',
      '2:owned',
      '3:sold',
      '4:missing',
      '5:missing',
    ])
    expect(strip[1]?.item_id).toBe('item-2')
    expect(strip[0]?.item_id).toBeNull()
  })

  it('stops at the highest volume when the total is unknown', () => {
    const strip = buildVolumeStatus([row(1), row(4)], null)
    expect(strip.map((r) => r.state)).toEqual(['owned', 'missing', 'missing', 'owned'])
  })

  it('marks kept and written-off volumes', () => {
    const strip = buildVolumeStatus([row(1, { units_left: 0, status: 'kept' })], 1)
    expect(strip[0]?.state).toBe('kept')
  })
})
