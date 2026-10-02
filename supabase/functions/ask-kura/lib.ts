// Pure helpers for ask-kura: tool input schemas, grouping and small formatting.
// No Deno or network imports here, so Vitest can test this file directly.
import { z } from 'zod'

export const TIME_ZONE = 'America/New_York'
export const MAX_ROWS = 50
export const MAX_ROUNDS = 6
export const HISTORY_LIMIT = 20
export const RATE_LIMIT_PER_HOUR = 60

/** Today as YYYY-MM-DD in New York. */
export function todayNY(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Text safe to put inside a PostgREST ilike/or() filter, or null if nothing is left. */
export function likePattern(text: string | undefined): string | null {
  const cleaned = (text ?? '')
    .replace(/[,()*%_\\:"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned ? `*${cleaned}*` : null
}

// ----------------------------------------------------------------------------- schemas
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date')
  .describe('Date as YYYY-MM-DD (New York time), inclusive')
const cents = z.number().int().min(0)

export const categories = ['manga', 'figure', 'merch', 'custom', 'other'] as const
export const statuses = [
  'draft',
  'in_stock',
  'listed',
  'reserved',
  'sold',
  'kept',
  'written_off',
] as const
export const itemSorts = [
  'newest',
  'oldest',
  'price_high',
  'price_low',
  'profit',
  'days_in_stock',
  'volume',
] as const

const range = { start: date, end: date }

export const toolSchemas = {
  get_overview: z.object({}),
  search_items: z.object({
    query: z.string().max(100).optional().describe('Words in the name, SKU, ISBN or series'),
    category: z.enum(categories).optional(),
    status: z
      .enum(statuses)
      .optional()
      .describe('in_stock and listed are for sale; sold means no copies left'),
    series: z.string().max(100).optional().describe('Series name for one-offs, e.g. "Naruto"'),
    set: z.string().max(100).optional().describe('Set (template) name, e.g. "One Piece"'),
    kind: z.enum(['set', 'one_off']).optional().describe('Set volumes or one-offs only'),
    volume_from: z.number().int().min(1).optional(),
    volume_to: z.number().int().min(1).optional(),
    min_price_cents: cents.optional().describe('Asking price at least this, in cents'),
    max_price_cents: cents.optional().describe('Asking price at most this, in cents'),
    min_days_in_stock: z.number().int().min(0).optional(),
    sort: z.enum(itemSorts).optional(),
    limit: z.number().int().min(1).max(MAX_ROWS).optional().describe('Default 20, max 50'),
  }),
  get_sales_summary: z.object({
    ...range,
    group_by: z.enum(['month', 'platform', 'series', 'category']),
  }),
  get_monthly_pnl: z.object(range),
  get_inventory_spend: z.object(range),
  get_set_breakdown: z.object({
    start: date.optional().describe('Defaults to all time'),
    end: date.optional().describe('Defaults to today'),
    limit: z.number().int().min(1).max(MAX_ROWS).optional().describe('Default 10'),
  }),
  get_sets: z.object({
    query: z.string().max(100).optional().describe('Part of the set name'),
    only_incomplete: z.boolean().optional().describe('Only sets with missing volumes'),
  }),
  get_aging: z.object({}),
  get_expenses: z.object({ ...range, group_by: z.enum(['month', 'category']) }),
  get_item_history: z.object({
    item_id_or_sku: z.string().min(1).max(64).describe('Item id (uuid) or SKU like MG-00042'),
  }),
} as const

export type ToolName = keyof typeof toolSchemas
export type ToolInput<N extends ToolName> = z.infer<(typeof toolSchemas)[N]>

export const toolDescriptions: Record<ToolName, string> = {
  get_overview:
    'Current totals for the whole business: item counts by status and category, sets, missing volumes, units in stock, cost basis, asking value, potential profit, all-time revenue, profit and expenses. A copy is already in the system prompt; call this only if you need it refreshed.',
  search_items:
    'Find specific items (one row per item; set volumes are separate rows) with filters. Returns SKU, name, set, volume, status, units left, average cost, asking price, estimated profit and days in stock. Use for questions about particular items, what is listed, what is priced above or below something, or what has sat longest.',
  get_sales_summary:
    'Sales totals in a date range grouped by month, platform, series or category: number of sales, units, revenue (price + shipping charged), fees, shipping paid and net profit (after item cost, before expenses).',
  get_monthly_pnl:
    'Profit and loss per month in a date range: revenue, shipping charged, fees, shipping paid, other costs, cost of goods sold, sales profit, expenses, net profit after expenses, units sold.',
  get_inventory_spend:
    'Money spent buying stock per month in a date range (sum of copies bought x unit cost, by purchase date), alongside expenses and revenue. Use for "how much did we spend on inventory".',
  get_set_breakdown:
    'Performance per set, with one-offs grouped by series and the rest as "Other one-offs": units in stock, units sold, revenue, net profit and average days to sell in the range, and owned/total volumes for sets. Sorted by net profit.',
  get_sets:
    'Sets (templates like "One Piece") with volumes owned, total volumes, owned_ranges and missing_ranges as compact ranges ("1-2, 21-32"), completion percent, cost basis and asking value. Use for "which volumes are we missing".',
  get_aging:
    'How long in-stock and listed items have been sitting: counts and cost in 0-30, 31-60, 61-90 and 90+ day buckets, plus the 10 oldest items.',
  get_expenses:
    'Business expenses (supplies, shipping, event fees, travel, software, other) in a date range, grouped by month or category, with totals.',
  get_item_history:
    'Everything about one item: details, each batch of copies bought (lot, quantity, cost, date), each sale, and its status/price change history.',
}

export const toolLabels: Record<ToolName, string> = {
  get_overview: 'Checking the overview',
  search_items: 'Searching inventory',
  get_sales_summary: 'Checking sales',
  get_monthly_pnl: 'Checking monthly profit',
  get_inventory_spend: 'Checking stock spending',
  get_set_breakdown: 'Comparing sets',
  get_sets: 'Checking sets',
  get_aging: 'Checking aging stock',
  get_expenses: 'Checking expenses',
  get_item_history: 'Looking up the item',
}

export function isToolName(name: string): name is ToolName {
  return Object.prototype.hasOwnProperty.call(toolSchemas, name)
}

/** JSON Schema for a tool's input, in the shape the Messages API expects. */
export function inputSchema(name: ToolName): { type: 'object'; [key: string]: unknown } {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(toolSchemas[name]) as Record<
    string,
    unknown
  >
  return { ...schema, type: 'object' }
}

/** Validates tool input; returns a readable error for the model when it's wrong. */
export function parseToolInput<N extends ToolName>(
  name: N,
  input: unknown,
): { ok: true; value: ToolInput<N> } | { ok: false; error: string } {
  const result = toolSchemas[name].safeParse(input ?? {})
  if (result.success) return { ok: true, value: result.data as ToolInput<N> }
  return {
    ok: false,
    error: result.error.issues
      .map((i) => `${i.path.join('.') || 'input'}: ${i.message}`)
      .join('; '),
  }
}

// ----------------------------------------------------------------------------- grouping
export interface SaleLike {
  sold_on: string
  platform: string
  series: string | null
  template_name: string | null
  category: string
  quantity: number
  revenue_cents: number
  platform_fee_cents: number
  shipping_cost_cents: number
  net_profit_cents: number
}

export interface SalesGroup {
  key: string
  sale_count: number
  units: number
  revenue_cents: number
  fees_cents: number
  shipping_paid_cents: number
  net_profit_cents: number
}

function saleKey(s: SaleLike, by: 'month' | 'platform' | 'series' | 'category'): string {
  switch (by) {
    case 'month':
      return s.sold_on.slice(0, 7)
    case 'platform':
      return s.platform
    case 'series':
      return s.template_name ?? s.series ?? 'No series'
    case 'category':
      return s.category
  }
}

/** Sales grouped and totalled; months in order, everything else biggest revenue first. */
export function groupSales(
  rows: readonly SaleLike[],
  by: 'month' | 'platform' | 'series' | 'category',
): { groups: SalesGroup[]; totals: Omit<SalesGroup, 'key'> } {
  const zero = () => ({
    sale_count: 0,
    units: 0,
    revenue_cents: 0,
    fees_cents: 0,
    shipping_paid_cents: 0,
    net_profit_cents: 0,
  })
  const map = new Map<string, SalesGroup>()
  const totals = zero()
  for (const s of rows) {
    const key = saleKey(s, by)
    const g = map.get(key) ?? { key, ...zero() }
    for (const target of [g, totals]) {
      target.sale_count += 1
      target.units += s.quantity
      target.revenue_cents += Number(s.revenue_cents)
      target.fees_cents += s.platform_fee_cents
      target.shipping_paid_cents += s.shipping_cost_cents
      target.net_profit_cents += Number(s.net_profit_cents)
    }
    map.set(key, g)
  }
  const groups = [...map.values()].sort((a, b) =>
    by === 'month' ? a.key.localeCompare(b.key) : b.revenue_cents - a.revenue_cents,
  )
  return { groups, totals }
}

export interface ExpenseLike {
  incurred_at: string
  category: string
  amount_cents: number
}

export function groupExpenses(
  rows: readonly ExpenseLike[],
  by: 'month' | 'category',
): { groups: { key: string; count: number; amount_cents: number }[]; total_cents: number } {
  const map = new Map<string, { key: string; count: number; amount_cents: number }>()
  let total = 0
  for (const e of rows) {
    const key = by === 'month' ? e.incurred_at.slice(0, 7) : e.category
    const g = map.get(key) ?? { key, count: 0, amount_cents: 0 }
    g.count += 1
    g.amount_cents += e.amount_cents
    total += e.amount_cents
    map.set(key, g)
  }
  const groups = [...map.values()].sort((a, b) =>
    by === 'month' ? a.key.localeCompare(b.key) : b.amount_cents - a.amount_cents,
  )
  return { groups, total_cents: total }
}

// ----------------------------------------------------------------------------- history
export interface StoredMessage {
  role: string
  content: string
}

/**
 * Turns saved messages into a valid Messages API history: oldest first, starts
 * with the user, roles alternate (same-role neighbours are merged), no blanks.
 */
export function toHistory(
  messages: readonly StoredMessage[],
): { role: 'user' | 'assistant'; content: string }[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = []
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'assistant' : m.role === 'user' ? 'user' : null
    const content = m.content.trim()
    if (!role || !content) continue
    if (out.length === 0 && role === 'assistant') continue
    const last = out[out.length - 1]
    if (last && last.role === role) last.content += `\n\n${content}`
    else out.push({ role, content })
  }
  return out
}

/** A short, clean thread title from the model's reply. */
export function cleanTitle(text: string, fallback: string): string {
  const title = text
    .replace(/["'`*#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 6)
    .join(' ')
    .replace(/[.!?:;,]+$/, '')
  return title || fallback.slice(0, 40)
}
