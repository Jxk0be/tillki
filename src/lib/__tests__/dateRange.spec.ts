import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysInRange,
  monthLabels,
  parseRangeQuery,
  percentChange,
  previousRange,
  resolveRange,
  toRangeQuery,
  type RangeSelection,
} from '../dateRange'

const sel = (
  preset: RangeSelection['preset'],
  from: string | null = null,
  to: string | null = null,
) => ({ preset, from, to }) as RangeSelection

describe('date ranges', () => {
  const today = '2026-10-01'

  it('adds days across months, years and DST', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02')
  })

  it('resolves presets', () => {
    expect(resolveRange(sel('30d'), today)).toEqual({ start: '2026-09-02', end: today })
    expect(daysInRange(resolveRange(sel('30d'), today))).toBe(30)
    expect(daysInRange(resolveRange(sel('90d'), today))).toBe(90)
    expect(resolveRange(sel('ytd'), today)).toEqual({ start: '2026-01-01', end: today })
    expect(resolveRange(sel('12m'), today)).toEqual({ start: '2025-11-01', end: today })
    expect(resolveRange(sel('all'), today).start).toBe('2000-01-01')
  })

  it('resolves custom ranges, swapping backwards ones', () => {
    expect(resolveRange(sel('custom', '2026-02-01', '2026-02-28'), today)).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
    })
    expect(resolveRange(sel('custom', '2026-03-01', '2026-02-01'), today)).toEqual({
      start: '2026-02-01',
      end: '2026-03-01',
    })
  })

  it('gives the previous equal period', () => {
    const s = sel('30d')
    expect(previousRange(s, resolveRange(s, today))).toEqual({
      start: '2026-08-03',
      end: '2026-09-01',
    })
    expect(previousRange(sel('all'), resolveRange(sel('all'), today))).toBeNull()
  })

  it('round-trips through the URL and ignores junk', () => {
    expect(parseRangeQuery({})).toEqual(sel('12m'))
    expect(toRangeQuery(sel('12m'))).toEqual({})
    const custom = sel('custom', '2026-01-05', '2026-02-10')
    expect(parseRangeQuery(toRangeQuery(custom) as Record<string, string>)).toEqual(custom)
    expect(parseRangeQuery({ range: 'forever' })).toEqual(sel('12m'))
    expect(parseRangeQuery({ range: 'custom', from: '2026-02-31' })).toEqual(sel('custom'))
    expect(parseRangeQuery({ range: '30d', from: '2026-01-01' })).toEqual(sel('30d'))
  })

  it('computes percent change', () => {
    expect(percentChange(150, 100)).toBe(50)
    expect(percentChange(50, 100)).toBe(-50)
    expect(percentChange(50, -100)).toBe(150)
    expect(percentChange(10, 0)).toBeNull()
    expect(percentChange(10, null)).toBeNull()
  })

  it('labels months, adding the year only when the range spans years', () => {
    expect(monthLabels(['2026-01-01', '2026-02-01'])).toEqual(['Jan', 'Feb'])
    expect(monthLabels(['2025-12-01', '2026-01-01'])).toEqual(['Dec 25', 'Jan 26'])
  })
})
