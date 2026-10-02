import { supabase } from '@/lib/supabase'
import { notifyDataChanged } from './useDataChanged'

export interface LotRow {
  id: string
  name: string
  source: string | null
  purchased_at: string | null
  total_cost_cents: number
  notes: string | null
  item_count: number
  units_bought: number
  units_sold: number
  net_revenue_cents: number
  paid_back_percent: number | null
}

export interface LotAcquisition {
  id: string
  item_id: string
  item_name: string
  volume_number: number | null
  template_id: string | null
  quantity: number
  unit_cost_cents: number
  purchased_at: string
}

export interface SplitPreviewRow {
  item_id: string
  item_name: string
  quantity: number
  total_cents: number
  unit_cost_cents: number
}

export type LotSplitMode = 'even' | 'by_list_price'

type LotViewRow = {
  id: string | null
  name: string | null
  source: string | null
  purchased_at: string | null
  total_cost_cents: number | null
  notes: string | null
  item_count: number | null
  units_bought: number | null
  units_sold: number | null
  net_revenue_cents: number | null
  paid_back_percent: number | null
}

function toLot(r: LotViewRow): LotRow {
  return {
    id: r.id ?? '',
    name: r.name ?? '',
    source: r.source,
    purchased_at: r.purchased_at,
    total_cost_cents: r.total_cost_cents ?? 0,
    notes: r.notes,
    item_count: r.item_count ?? 0,
    units_bought: r.units_bought ?? 0,
    units_sold: Number(r.units_sold ?? 0),
    net_revenue_cents: r.net_revenue_cents ?? 0,
    paid_back_percent: r.paid_back_percent,
  }
}

export async function listLots(): Promise<LotRow[]> {
  const { data, error } = await supabase
    .from('v_lots')
    .select('*')
    .order('purchased_at', { ascending: false, nullsFirst: false })
    .order('name')
  if (error) throw error
  return (data ?? []).map(toLot)
}

export async function getLot(
  id: string,
): Promise<{ lot: LotRow; acquisitions: LotAcquisition[] } | null> {
  const [lot, acq] = await Promise.all([
    supabase.from('v_lots').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('item_acquisitions')
      .select(
        'id, item_id, quantity, unit_cost_cents, purchased_at, items(name, volume_number, template_id)',
      )
      .eq('lot_id', id)
      .order('purchased_at')
      .order('created_at'),
  ])
  if (lot.error) throw lot.error
  if (acq.error) throw acq.error
  if (!lot.data) return null
  return {
    lot: toLot(lot.data),
    acquisitions: (acq.data ?? [])
      .map((a) => ({
        id: a.id,
        item_id: a.item_id,
        item_name: a.items?.name ?? '',
        volume_number: a.items?.volume_number ?? null,
        template_id: a.items?.template_id ?? null,
        quantity: a.quantity,
        unit_cost_cents: a.unit_cost_cents,
        purchased_at: a.purchased_at,
      }))
      .sort((x, y) => x.item_name.localeCompare(y.item_name, undefined, { numeric: true })),
  }
}

export interface LotFields {
  name: string
  source: string | null
  purchased_at: string | null
  total_cost_cents: number
  notes: string | null
}

export async function createLotRecord(f: LotFields): Promise<string> {
  const { data, error } = await supabase.from('lots').insert(f).select('id').single()
  if (error) throw error
  notifyDataChanged()
  return data.id
}

export async function updateLot(id: string, f: LotFields) {
  const { error } = await supabase.from('lots').update(f).eq('id', id)
  if (error) throw error
  notifyDataChanged()
}

/** Preview (dryRun) or apply a split of the lot's total across its copies. */
export async function splitLotCost(
  id: string,
  mode: LotSplitMode,
  dryRun: boolean,
): Promise<SplitPreviewRow[]> {
  const { data, error } = await supabase.rpc('allocate_lot_cost', {
    p_lot_id: id,
    p_mode: mode,
    p_dry_run: dryRun,
  })
  if (error) throw error
  if (!dryRun) notifyDataChanged()
  return data ?? []
}
