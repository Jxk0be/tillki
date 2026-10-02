import { describe, expect, it } from 'vitest'
import { toCsv } from '../csv'
import { formatDate, parseDbDate } from '../dates'

describe('toCsv', () => {
  const columns = [
    { header: 'Name', value: (r: { name: string; price: number | null }) => r.name },
    { header: 'Price', value: (r: { name: string; price: number | null }) => r.price },
  ]

  it('writes a header and rows', () => {
    expect(toCsv([{ name: 'Akira', price: 2800 }], columns)).toBe('Name,Price\r\nAkira,2800\r\n')
  })

  it('quotes commas, quotes and newlines', () => {
    const csv = toCsv([{ name: 'One Piece, Vol. "3"\nnote', price: null }], columns)
    expect(csv).toBe('Name,Price\r\n"One Piece, Vol. ""3""\nnote",\r\n')
  })

  it('defuses spreadsheet formulas in text', () => {
    expect(toCsv([{ name: '=HYPERLINK("x")', price: -5 }], columns)).toBe(
      'Name,Price\r\n"\'=HYPERLINK(""x"")",-5\r\n',
    )
  })
})

describe('dates', () => {
  it('treats date-only values as local calendar days', () => {
    const d = parseDbDate('2026-03-01')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 2, 1])
    expect(formatDate('2026-03-01')).toBe('Mar 1, 2026')
  })

  it('returns an empty string for missing or bad values', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate('not a date')).toBe('')
  })
})
