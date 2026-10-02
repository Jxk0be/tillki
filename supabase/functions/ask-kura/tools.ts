// The read-only tools Claude can call. Each one runs through the caller's own
// Supabase client, so RLS applies exactly as it does in the app.
import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  MAX_ROWS,
  groupExpenses,
  groupSales,
  inputSchema,
  isToolName,
  likePattern,
  parseToolInput,
  todayNY,
  toolDescriptions,
  toolSchemas,
  TIME_ZONE,
  type ExpenseLike,
  type SaleLike,
  type ToolInput,
  type ToolName,
} from './lib.ts'

export const tools: Anthropic.Tool[] = (Object.keys(toolSchemas) as ToolName[]).map((name) => ({
  name,
  description: toolDescriptions[name],
  input_schema: inputSchema(name),
}))

const ITEM_COLUMNS =
  'id, sku, name, template_name, volume_number, series, category, condition, status, quantity, units_sold, units_left, cost_cents, list_price_cents, est_profit_cents, days_in_stock, storage_location, purchased_at, created_at'

class ToolError extends Error {}

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new ToolError(result.error.message)
  return result.data as T
}

async function rpc(db: SupabaseClient, fn: string, args: Record<string, unknown> = {}) {
  return check<unknown[]>(await db.rpc(fn, args))
}

const sortColumns: Record<
  NonNullable<ToolInput<'search_items'>['sort']>,
  [column: string, ascending: boolean]
> = {
  newest: ['created_at', false],
  oldest: ['created_at', true],
  price_high: ['list_price_cents', false],
  price_low: ['list_price_cents', true],
  profit: ['est_profit_cents', false],
  days_in_stock: ['days_in_stock', false],
  volume: ['volume_number', true],
}

async function searchItems(db: SupabaseClient, i: ToolInput<'search_items'>) {
  const limit = Math.min(i.limit ?? 20, MAX_ROWS)
  let q = db.from('v_items').select(ITEM_COLUMNS, { count: 'exact' }).is('archived_at', null)
  const text = likePattern(i.query)
  if (text) q = q.or(['name', 'sku', 'isbn', 'series'].map((c) => `${c}.ilike.${text}`).join(','))
  if (i.category) q = q.eq('category', i.category)
  if (i.status) q = q.eq('status', i.status)
  const series = likePattern(i.series)
  if (series) q = q.ilike('series', series.replaceAll('*', '%'))
  const set = likePattern(i.set)
  if (set) q = q.ilike('template_name', set.replaceAll('*', '%'))
  if (i.kind === 'set') q = q.not('template_id', 'is', null)
  if (i.kind === 'one_off') q = q.is('template_id', null)
  if (i.volume_from !== undefined) q = q.gte('volume_number', i.volume_from)
  if (i.volume_to !== undefined) q = q.lte('volume_number', i.volume_to)
  if (i.min_price_cents !== undefined) q = q.gte('list_price_cents', i.min_price_cents)
  if (i.max_price_cents !== undefined) q = q.lte('list_price_cents', i.max_price_cents)
  if (i.min_days_in_stock !== undefined) q = q.gte('days_in_stock', i.min_days_in_stock)
  const [column, ascending] = sortColumns[i.sort ?? 'newest']
  q = q.order(column, { ascending, nullsFirst: false })
  if (i.set || i.kind === 'set') q = q.order('template_name').order('volume_number')
  const { data, error, count } = await q.limit(limit)
  if (error) throw new ToolError(error.message)
  return {
    total_matches: count ?? data?.length ?? 0,
    showing: data?.length ?? 0,
    items: data ?? [],
  }
}

async function salesBetween(db: SupabaseClient, start: string, end: string) {
  return (await rpc(db, 'sales_between', {
    p_start: start,
    p_end: end,
    p_tz: TIME_ZONE,
  })) as SaleLike[]
}

async function itemHistory(db: SupabaseClient, idOrSku: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSku)
  const lookup = db.from('v_items').select(`${ITEM_COLUMNS}, effective_description, lot_names`)
  const items = check<{ id: string }[]>(
    await (isUuid ? lookup.eq('id', idOrSku) : lookup.ilike('sku', idOrSku.trim())).limit(1),
  )
  const item = items[0]
  if (!item) return { found: false, message: `No item with id or SKU "${idOrSku}".` }
  const [acquisitions, sales, events] = await Promise.all([
    db
      .from('item_acquisitions')
      .select('quantity, unit_cost_cents, purchase_source, purchased_at, lots(name)')
      .eq('item_id', item.id)
      .order('purchased_at')
      .limit(MAX_ROWS),
    db
      .from('v_sales')
      .select(
        'sold_at, platform, quantity, sale_price_cents, shipping_charged_cents, shipping_cost_cents, platform_fee_cents, other_cost_cents, net_profit_cents, bundle_id, notes',
      )
      .eq('item_id', item.id)
      .order('sold_at')
      .limit(MAX_ROWS),
    db
      .from('item_events')
      .select('event_type, old_value, new_value, created_at')
      .eq('item_id', item.id)
      .order('created_at', { ascending: false })
      .limit(30),
  ])
  return {
    found: true,
    item,
    acquisitions: check(acquisitions),
    sales: check(sales),
    recent_events: check(events),
  }
}

async function run(db: SupabaseClient, name: ToolName, input: unknown): Promise<unknown> {
  switch (name) {
    case 'get_overview':
      return (await rpc(db, 'rpc_overview', { p_tz: TIME_ZONE }))[0] ?? null
    case 'search_items': {
      const i = input as ToolInput<'search_items'>
      return searchItems(db, i)
    }
    case 'get_sales_summary': {
      const i = input as ToolInput<'get_sales_summary'>
      const { groups, totals } = groupSales(await salesBetween(db, i.start, i.end), i.group_by)
      return {
        start: i.start,
        end: i.end,
        group_by: i.group_by,
        totals,
        groups: groups.slice(0, MAX_ROWS),
      }
    }
    case 'get_monthly_pnl': {
      const i = input as ToolInput<'get_monthly_pnl'>
      return rpc(db, 'rpc_monthly_pnl', { p_start: i.start, p_end: i.end, p_tz: TIME_ZONE })
    }
    case 'get_inventory_spend': {
      const i = input as ToolInput<'get_inventory_spend'>
      const months = (await rpc(db, 'rpc_monthly_spend', {
        p_start: i.start,
        p_end: i.end,
        p_tz: TIME_ZONE,
      })) as { purchased_cents: number; expenses_cents: number; revenue_cents: number }[]
      const sum = (k: 'purchased_cents' | 'expenses_cents' | 'revenue_cents') =>
        months.reduce((s, m) => s + Number(m[k]), 0)
      return {
        start: i.start,
        end: i.end,
        total_stock_bought_cents: sum('purchased_cents'),
        total_expenses_cents: sum('expenses_cents'),
        total_revenue_cents: sum('revenue_cents'),
        months,
      }
    }
    case 'get_set_breakdown': {
      const i = input as ToolInput<'get_set_breakdown'>
      return rpc(db, 'rpc_set_breakdown', {
        p_start: i.start ?? '2000-01-01',
        p_end: i.end ?? todayNY(),
        p_limit: i.limit ?? 10,
        p_tz: TIME_ZONE,
      })
    }
    case 'get_sets': {
      const i = input as ToolInput<'get_sets'>
      let q = db
        .from('v_templates')
        .select(
          'id, name, category, total_volumes, is_ongoing, volumes_owned, units_in_stock, extra_copies, volumes_sold, owned_ranges, missing_ranges, missing_count, completion_percent, cost_basis_cents, list_value_cents, est_profit_cents',
        )
        .is('archived_at', null)
        .order('name')
      const text = likePattern(i.query)
      if (text) q = q.ilike('name', text.replaceAll('*', '%'))
      if (i.only_incomplete) q = q.gt('missing_count', 0)
      const sets = check<unknown[]>(await q.limit(MAX_ROWS))
      return {
        note: 'missing_ranges counts up to total_volumes, or only gaps below the highest owned volume when the total is unknown.',
        sets,
      }
    }
    case 'get_aging': {
      const [buckets, oldest] = await Promise.all([
        rpc(db, 'rpc_aging_buckets'),
        db
          .from('v_items')
          .select('sku, name, status, units_left, cost_cents, list_price_cents, days_in_stock')
          .is('archived_at', null)
          .in('status', ['in_stock', 'listed'])
          .gt('units_left', 0)
          .order('days_in_stock', { ascending: false })
          .limit(10),
      ])
      return { buckets, oldest_items: check(oldest) }
    }
    case 'get_expenses': {
      const i = input as ToolInput<'get_expenses'>
      const rows = check<ExpenseLike[]>(
        await db
          .from('expenses')
          .select('incurred_at, category, amount_cents')
          .gte('incurred_at', i.start)
          .lte('incurred_at', i.end)
          .limit(5000),
      )
      return { start: i.start, end: i.end, ...groupExpenses(rows, i.group_by) }
    }
    case 'get_item_history': {
      const i = input as ToolInput<'get_item_history'>
      return itemHistory(db, i.item_id_or_sku)
    }
  }
}

/** Runs one tool call and returns what goes back to Claude (errors included, as text). */
export async function executeTool(
  db: SupabaseClient,
  name: string,
  input: unknown,
): Promise<{ content: string; isError: boolean }> {
  if (!isToolName(name)) return { content: `Unknown tool "${name}".`, isError: true }
  const parsed = parseToolInput(name, input)
  if (!parsed.ok) return { content: `Invalid input: ${parsed.error}`, isError: true }
  try {
    const result = await run(db, name, parsed.value)
    return { content: JSON.stringify(result), isError: false }
  } catch (e) {
    const message = e instanceof ToolError ? e.message : 'The query failed.'
    console.error(`tool ${name} failed`, e)
    return { content: `Tool error: ${message}`, isError: true }
  }
}
