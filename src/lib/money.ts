const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/** Format integer cents as USD, e.g. 123456 -> "$1,234.56". */
export function formatCents(cents: number): string {
  return usd.format(cents / 100)
}

const MONEY_PATTERN = /^(\d+)(?:\.(\d{0,2}))?$|^\.(\d{1,2})$/

/**
 * Parse what someone typed into a money field into integer cents.
 * Accepts "12", "12.5", "$12.50", "1,234.56", ".99". Returns null for empty,
 * non-numeric, negative, or more-than-two-decimal input so callers can show an error.
 * Works on the string directly so there are no floating point surprises.
 */
export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.trim().replace(/^\$/, '').replace(/,/g, '').trim()
  if (cleaned === '') return null

  const match = MONEY_PATTERN.exec(cleaned)
  if (!match) return null

  const dollars = match[1] ?? '0'
  const fraction = (match[2] ?? match[3] ?? '').padEnd(2, '0')
  const cents = Number(dollars) * 100 + Number(fraction)

  return Number.isSafeInteger(cents) ? cents : null
}
