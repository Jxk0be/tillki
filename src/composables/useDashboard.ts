import { shallowRef, ref, watch, type Ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { addDays, daysInRange, type DateRange } from '@/lib/dateRange'
import { useDataVersion } from './useDataChanged'
import type { Database } from '@/types/database'

type Fns = Database['public']['Functions']
type Row<K extends keyof Fns> = Fns[K]['Returns'] extends (infer R)[] ? R : never

export type Overview = Row<'rpc_overview'>
export type SalesSummary = Row<'rpc_sales_summary'>
export type PnlMonth = Row<'rpc_monthly_pnl'>
export type SpendMonth = Row<'rpc_monthly_spend'>
export type PlatformRow = Row<'rpc_platform_breakdown'>
export type SetRow = Row<'rpc_set_breakdown'>
export type AgingBucket = Row<'rpc_aging_buckets'>
export type AddedRow = Row<'rpc_items_added'>
export type Snapshot = Database['public']['Tables']['inventory_snapshots']['Row']

export interface DashboardData {
  overview: Overview | null
  summary: SalesSummary | null
  previous: SalesSummary | null
  pnl: PnlMonth[]
  spend: SpendMonth[]
  platforms: PlatformRow[]
  sets: SetRow[]
  aging: AgingBucket[]
  added: AddedRow[]
  addedGrain: 'week' | 'month'
  snapshots: Snapshot[]
  /** The last snapshot on or before the day the range starts, for the stock tiles. */
  snapshotAtStart: Snapshot | null
}

/** The browser's time zone, so months line up with the Sales page. */
export const browserTimeZone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'

type RpcResult = { data: unknown; error: { message: string } | null }
// supabase.rpc's generics can't follow a generic function name, so call it loosely
// and type the result from the generated function types instead.
const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args: object,
) => PromiseLike<RpcResult>

async function call<K extends keyof Fns>(
  fn: K,
  args: Fns[K]['Args'] | Record<string, never>,
): Promise<Row<K>[]> {
  const { data, error } = await rpc(fn, args)
  if (error) throw new Error(error.message)
  return (data ?? []) as Row<K>[]
}

/** Loads every dashboard query for a range, reloading when the range or the data changes. */
export function useDashboard(range: Ref<DateRange>, previous: Ref<DateRange | null>) {
  const data = shallowRef<DashboardData | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)
  const version = useDataVersion()
  let request = 0

  async function load() {
    const id = ++request
    const { start, end } = range.value
    const prev = previous.value
    const tz = browserTimeZone()
    const span = { p_start: start, p_end: end, p_tz: tz }
    const addedGrain = daysInRange(range.value) > 366 ? 'month' : 'week'
    loading.value = true
    try {
      const [
        overview,
        summary,
        prevSummary,
        pnl,
        spend,
        platforms,
        sets,
        aging,
        added,
        snapshots,
        startSnap,
      ] = await Promise.all([
        call('rpc_overview', { p_tz: tz }),
        call('rpc_sales_summary', span),
        prev
          ? call('rpc_sales_summary', { p_start: prev.start, p_end: prev.end, p_tz: tz })
          : Promise.resolve([]),
        call('rpc_monthly_pnl', span),
        call('rpc_monthly_spend', span),
        call('rpc_platform_breakdown', span),
        call('rpc_set_breakdown', { ...span, p_limit: 10 }),
        call('rpc_aging_buckets', {}),
        call('rpc_items_added', { ...span, p_grain: addedGrain }),
        supabase
          .from('inventory_snapshots')
          .select('*')
          .gte('snapshot_date', start)
          .lte('snapshot_date', end)
          .order('snapshot_date'),
        supabase
          .from('inventory_snapshots')
          .select('*')
          .lte('snapshot_date', addDays(start, -1))
          .order('snapshot_date', { ascending: false })
          .limit(1),
      ])
      if (snapshots.error) throw new Error(snapshots.error.message)
      if (startSnap.error) throw new Error(startSnap.error.message)
      if (id !== request) return
      data.value = {
        overview: overview[0] ?? null,
        summary: summary[0] ?? null,
        previous: prevSummary[0] ?? null,
        pnl,
        spend,
        platforms,
        sets,
        aging,
        added,
        addedGrain,
        snapshots: snapshots.data ?? [],
        snapshotAtStart: startSnap.data?.[0] ?? null,
      }
      error.value = null
    } catch (e) {
      if (id === request) error.value = e instanceof Error ? e.message : 'Something went wrong.'
    } finally {
      if (id === request) loading.value = false
    }
  }

  watch([() => range.value.start, () => range.value.end, version], load, { immediate: true })

  return { data, loading, error, reload: load }
}
