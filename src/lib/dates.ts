const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})
const dateTimeFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/**
 * Parses a DB value: a date-only "YYYY-MM-DD" is a calendar day in local time
 * (not UTC midnight, which would show as the previous day in the US).
 */
export function parseDbDate(value: string): Date {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
  return new Date(value)
}

/** "Mar 14, 2026" */
export function formatDate(value: string | null | undefined): string {
  if (!value) return ''
  const date = parseDbDate(value)
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date)
}

/** "Mar 14, 2026, 7:30 PM" */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : dateTimeFormat.format(date)
}

/** Today as "YYYY-MM-DD" in local time, for date inputs. */
export function todayIso(): string {
  const now = new Date()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}
