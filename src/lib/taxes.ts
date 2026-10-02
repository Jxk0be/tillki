/** Pure helpers for the yearly tax summary (tested in __tests__/taxes.spec.ts). */

export interface PnlMonthLike {
  revenue_cents: number
  shipping_charged_cents: number
  fees_cents: number
  shipping_paid_cents: number
  other_costs_cents: number
  cogs_cents: number
  sales_profit_cents: number
  expenses_cents: number
  units_sold: number
}

export interface TaxTotals {
  /** Sale prices plus shipping charged. */
  gross_receipts_cents: number
  shipping_charged_cents: number
  fees_cents: number
  shipping_paid_cents: number
  other_sale_costs_cents: number
  cogs_cents: number
  /** Gross receipts minus fees, shipping, other sale costs and COGS (matches the dashboard). */
  sales_profit_cents: number
  expenses_cents: number
  net_profit_cents: number
  units_sold: number
}

export function taxTotals(months: readonly PnlMonthLike[]): TaxTotals {
  const sum = (k: keyof PnlMonthLike) => months.reduce((s, m) => s + Number(m[k]), 0)
  const sales = sum('sales_profit_cents')
  const expenses = sum('expenses_cents')
  return {
    gross_receipts_cents: sum('revenue_cents'),
    shipping_charged_cents: sum('shipping_charged_cents'),
    fees_cents: sum('fees_cents'),
    shipping_paid_cents: sum('shipping_paid_cents'),
    other_sale_costs_cents: sum('other_costs_cents'),
    cogs_cents: sum('cogs_cents'),
    sales_profit_cents: sales,
    expenses_cents: expenses,
    net_profit_cents: sales - expenses,
    units_sold: sum('units_sold'),
  }
}

/** Expenses totalled per category, biggest first. */
export function expensesByCategory<C extends string>(
  rows: readonly { category: C; amount_cents: number }[],
): { category: C; amount_cents: number }[] {
  const map = new Map<C, number>()
  for (const r of rows) map.set(r.category, (map.get(r.category) ?? 0) + r.amount_cents)
  return [...map.entries()]
    .map(([category, amount_cents]) => ({ category, amount_cents }))
    .sort((a, b) => b.amount_cents - a.amount_cents)
}

/** Cents as a plain dollar amount for CSV: 123456 -> "1234.56", -50 -> "-0.50". */
export function centsToDollars(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return ''
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.round(cents))
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** First and last day of a calendar year. */
export function yearRange(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year}-12-31` }
}
