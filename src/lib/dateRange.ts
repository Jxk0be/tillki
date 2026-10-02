import type { LocationQuery, LocationQueryRaw } from 'vue-router'

/** Dashboard date ranges. All dates are local calendar days as "YYYY-MM-DD", inclusive. */
export const rangePresets = ['30d', '90d', 'ytd', '12m', 'all', 'custom'] as const
export type RangePreset = (typeof rangePresets)[number]

export const rangePresetLabels: Record<RangePreset, string> = {
  '30d': '30 days',
  '90d': '90 days',
  ytd: 'This year',
  '12m': 'Last 12 months',
  all: 'All time',
  custom: 'Custom',
}

export const DEFAULT_PRESET: RangePreset = '12m'
/** Earlier than any data; the report functions skip empty months before the first activity. */
export const ALL_TIME_START = '2000-01-01'

export interface DateRange {
  start: string
  end: string
}

export interface RangeSelection {
  preset: RangePreset
  /** Only used by 'custom'. */
  from: string | null
  to: string | null
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

function toUtc(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Adds (or subtracts) whole days to a "YYYY-MM-DD" date. */
export function addDays(iso: string, days: number): string {
  const d = toUtc(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return fromUtc(d)
}

/** Days from start to end, counting both ends. */
export function daysInRange(r: DateRange): number {
  return Math.round((toUtc(r.end).getTime() - toUtc(r.start).getTime()) / 86_400_000) + 1
}

function isValidIso(value: string | null): value is string {
  return value !== null && ISO.test(value) && fromUtc(toUtc(value)) === value
}

/** The dates a selection covers, relative to `today`. */
export function resolveRange(sel: RangeSelection, today: string): DateRange {
  switch (sel.preset) {
    case '30d':
      return { start: addDays(today, -29), end: today }
    case '90d':
      return { start: addDays(today, -89), end: today }
    case 'ytd':
      return { start: `${today.slice(0, 4)}-01-01`, end: today }
    case '12m': {
      // This month plus the 11 before it, so the monthly charts show 12 bars.
      const d = toUtc(`${today.slice(0, 7)}-01`)
      d.setUTCMonth(d.getUTCMonth() - 11)
      return { start: fromUtc(d), end: today }
    }
    case 'all':
      return { start: ALL_TIME_START, end: today }
    case 'custom': {
      const from = isValidIso(sel.from) ? sel.from : addDays(today, -29)
      const to = isValidIso(sel.to) ? sel.to : today
      return from <= to ? { start: from, end: to } : { start: to, end: from }
    }
  }
}

/** The same number of days just before the range, for "vs previous period". None for All time. */
export function previousRange(sel: RangeSelection, range: DateRange): DateRange | null {
  if (sel.preset === 'all') return null
  const n = daysInRange(range)
  return { start: addDays(range.start, -n), end: addDays(range.start, -1) }
}

function first(value: LocationQuery[string] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value
  return typeof v === 'string' && v !== '' ? v : null
}

export function parseRangeQuery(query: LocationQuery): RangeSelection {
  const raw = first(query.range)
  const preset = (rangePresets as readonly string[]).includes(raw ?? '')
    ? (raw as RangePreset)
    : DEFAULT_PRESET
  const from = first(query.from)
  const to = first(query.to)
  return {
    preset,
    from: preset === 'custom' && isValidIso(from) ? from : null,
    to: preset === 'custom' && isValidIso(to) ? to : null,
  }
}

export function toRangeQuery(sel: RangeSelection): LocationQueryRaw {
  if (sel.preset === DEFAULT_PRESET) return {}
  const q: LocationQueryRaw = { range: sel.preset }
  if (sel.preset === 'custom') {
    if (sel.from) q.from = sel.from
    if (sel.to) q.to = sel.to
  }
  return q
}

/** Change from previous to current as a whole percent; null when there's nothing to compare. */
export function percentChange(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || previous === 0) return null
  return Math.round(((current - previous) / Math.abs(previous)) * 100)
}

const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })
const monthYearFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
})
const dayFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** "Mar" when every month is in one year, otherwise "Mar 26". */
export function monthLabels(months: readonly string[]): string[] {
  const years = new Set(months.map((m) => m.slice(0, 4)))
  const fmt = years.size > 1 ? monthYearFmt : monthFmt
  return months.map((m) => fmt.format(toUtc(m)))
}

/** "Mar 4" */
export function shortDay(iso: string): string {
  return dayFmt.format(toUtc(iso))
}

/** "Mar 4, 2026 - Sep 30, 2026" style description of a range. */
export function describeRange(sel: RangeSelection, r: DateRange): string {
  if (sel.preset === 'all') return 'all time'
  if (sel.preset !== 'custom') return rangePresetLabels[sel.preset].toLowerCase()
  return `${r.start} to ${r.end}`
}
