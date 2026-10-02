import { supabase } from '@/lib/supabase'
import { browserTimeZone } from './useDashboard'
import { expenseCategoryLabels, type ExpenseCategory } from './useExpenses'
import {
  centsToDollars,
  expensesByCategory,
  taxTotals,
  yearRange,
  type TaxTotals,
} from '@/lib/taxes'
import type { CsvColumn } from '@/lib/csv'

export interface InventoryValue {
  date: string
  cost_basis_cents: number
  /** True when no snapshot existed and the value was worked out from today's stock. */
  computed: boolean
}

export interface TaxYear {
  year: number
  totals: TaxTotals
  expenses: { category: ExpenseCategory; label: string; amount_cents: number }[]
  starting: InventoryValue | null
  ending: InventoryValue | null
}

async function snapshotOnOrBefore(date: string): Promise<InventoryValue | null> {
  const { data } = await supabase
    .from('inventory_snapshots')
    .select('snapshot_date, cost_basis_cents')
    .lte('snapshot_date', date)
    .order('snapshot_date', { ascending: false })
    .limit(1)
  const row = data?.[0]
  return row
    ? { date: row.snapshot_date, cost_basis_cents: Number(row.cost_basis_cents), computed: false }
    : null
}

/** Everything the /tools/taxes summary shows for one calendar year. */
export async function loadTaxYear(year: number, today: string): Promise<TaxYear> {
  const { start, end } = yearRange(year)
  const [pnl, expenses, overview] = await Promise.all([
    supabase.rpc('rpc_monthly_pnl', { p_start: start, p_end: end, p_tz: browserTimeZone() }),
    supabase
      .from('expenses')
      .select('category, amount_cents')
      .gte('incurred_at', start)
      .lte('incurred_at', end),
    supabase.rpc('rpc_overview', { p_tz: browserTimeZone() }),
  ])
  if (pnl.error) throw new Error(pnl.error.message)
  if (expenses.error) throw new Error(expenses.error.message)

  // Starting inventory: the last snapshot before Jan 1. Ending: the last one by Dec 31
  // (or today, for the current year), falling back to today's stock when there's none.
  const prevEnd = `${year - 1}-12-31`
  const yearEnd = end < today ? end : today
  const [starting, lastByYearEnd] = await Promise.all([
    snapshotOnOrBefore(prevEnd),
    snapshotOnOrBefore(yearEnd),
  ])
  let ending = lastByYearEnd
  if (ending && ending.date < start) ending = null
  const nowCost = overview.data?.[0]?.cost_basis_cents
  if (!ending && end >= today && nowCost !== undefined)
    ending = { date: today, cost_basis_cents: Number(nowCost), computed: true }

  return {
    year,
    totals: taxTotals(pnl.data ?? []),
    expenses: expensesByCategory(expenses.data ?? []).map((e) => ({
      ...e,
      label: expenseCategoryLabels[e.category],
    })),
    starting,
    ending,
  }
}

// ---------------------------------------------------------------- CSV exports for a year
async function fetchAll<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return rows
}

const money = (c: number | null | undefined) => centsToDollars(c)

/** The year's start and the next year's start as instants in this browser's time zone. */
function localYearBounds(year: number): { from: string; until: string } {
  return {
    from: new Date(year, 0, 1).toISOString(),
    until: new Date(year + 1, 0, 1).toISOString(),
  }
}

export interface YearExport {
  filename: string
  rows: Record<string, unknown>[]
  columns: CsvColumn<Record<string, unknown>>[]
}

type Row = Record<string, unknown>

/** A timestamp as YYYY-MM-DD in this browser's time zone. */
function localDate(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const col = (header: string, value: (r: Row) => unknown): CsvColumn<Row> => ({
  header,
  value: (r) => {
    const v = value(r)
    return v === null || v === undefined ? '' : (v as string | number | boolean)
  },
})
const cents = (k: string) => (r: Row) => money(r[k] as number | null)
const text = (k: string) => (r: Row) => r[k] as string | null

/** Items entered or first bought in the year. */
export async function exportItems(year: number): Promise<YearExport> {
  const { start, end } = yearRange(year)
  const { from, until } = localYearBounds(year)
  const rows = await fetchAll<Row>((a, b) =>
    supabase
      .from('v_items')
      .select('*')
      .or(
        `and(created_at.gte."${from}",created_at.lt."${until}"),and(purchased_at.gte.${start},purchased_at.lte.${end})`,
      )
      .order('created_at')
      .range(a, b),
  )
  return {
    filename: `tillki-items-${year}.csv`,
    rows,
    columns: [
      col('SKU', text('sku')),
      col('Name', text('name')),
      col('Set', text('template_name')),
      col('Volume', (r) => r.volume_number as number | null),
      col('Series', text('series')),
      col('Category', text('category')),
      col('Condition', text('condition')),
      col('Status', text('status')),
      col('Quantity', (r) => r.quantity as number),
      col('Units sold', (r) => r.units_sold as number),
      col('Units left', (r) => r.units_left as number),
      col('Avg cost', cents('cost_cents')),
      col('Asking price', cents('list_price_cents')),
      col('Purchased', text('purchased_at')),
      col('Entered', (r) => localDate(r.created_at as string)),
      col('ISBN', text('isbn')),
      col('Storage', text('storage_location')),
    ],
  }
}

/** Sales in the year, with net profit. */
export async function exportSales(year: number): Promise<YearExport> {
  const { from, until } = localYearBounds(year)
  const rows = await fetchAll<Row>((a, b) =>
    supabase
      .from('v_sales')
      .select('*')
      .gte('sold_at', from)
      .lt('sold_at', until)
      .order('sold_at')
      .range(a, b),
  )
  return {
    filename: `tillki-sales-${year}.csv`,
    rows,
    columns: [
      col('Sold', (r) => localDate(r.sold_at as string)),
      col('Item', text('item_name')),
      col('Set', text('template_name')),
      col('Category', text('category')),
      col('Platform', text('platform')),
      col('Quantity', (r) => r.quantity as number),
      col('Sale price', cents('sale_price_cents')),
      col('Shipping charged', cents('shipping_charged_cents')),
      col('Platform fee', cents('platform_fee_cents')),
      col('Shipping paid', cents('shipping_cost_cents')),
      col('Other costs', cents('other_cost_cents')),
      col('Cost of goods', (r) => money((r.unit_cost_cents as number) * (r.quantity as number))),
      col('Net profit', cents('net_profit_cents')),
      col('Bundle', text('bundle_id')),
      col('Notes', text('notes')),
    ],
  }
}

export async function exportExpenses(year: number): Promise<YearExport> {
  const { start, end } = yearRange(year)
  const rows = await fetchAll<Row>((a, b) =>
    supabase
      .from('expenses')
      .select('*')
      .gte('incurred_at', start)
      .lte('incurred_at', end)
      .order('incurred_at')
      .range(a, b),
  )
  return {
    filename: `tillki-expenses-${year}.csv`,
    rows,
    columns: [
      col('Date', text('incurred_at')),
      col('Category', (r) => expenseCategoryLabels[r.category as ExpenseCategory]),
      col('Amount', cents('amount_cents')),
      col('Vendor', text('vendor')),
      col('Note', text('note')),
      col('Has receipt', (r) => (r.receipt_path ? 'yes' : 'no')),
    ],
  }
}

export async function exportLots(year: number): Promise<YearExport> {
  const { start, end } = yearRange(year)
  const rows = await fetchAll<Row>((a, b) =>
    supabase
      .from('v_lots')
      .select('*')
      .gte('purchased_at', start)
      .lte('purchased_at', end)
      .order('purchased_at')
      .range(a, b),
  )
  return {
    filename: `tillki-lots-${year}.csv`,
    rows,
    columns: [
      col('Bought', text('purchased_at')),
      col('Lot', text('name')),
      col('Source', text('source')),
      col('Total cost', cents('total_cost_cents')),
      col('Items', (r) => r.item_count as number),
      col('Units bought', (r) => r.units_bought as number),
      col('Units sold', (r) => r.units_sold as number),
      col('Net revenue so far', cents('net_revenue_cents')),
      col('Paid back %', (r) => r.paid_back_percent as number | null),
      col('Notes', text('notes')),
    ],
  }
}
