import { supabase } from '@/lib/supabase'
import type { BundleSplitMode } from '@/lib/sales'
import { notifyDataChanged } from './useDataChanged'
import type { Database } from '@/types/database'
import type { ItemCategory, SalesPlatform } from '@/types/inventory'

export interface SaleInput {
  itemId: string
  quantity: number
  platform: SalesPlatform
  salePriceCents: number
  shippingChargedCents: number
  shippingCostCents: number
  platformFeeCents: number
  otherCostCents: number
  soldAt: string
  notes: string | null
}

/** A v_sales row with the always-filled columns non-null. */
export interface SaleRow {
  id: string
  item_id: string
  bundle_id: string | null
  quantity: number
  sold_at: string
  platform: SalesPlatform
  sale_price_cents: number
  shipping_charged_cents: number
  shipping_cost_cents: number
  platform_fee_cents: number
  other_cost_cents: number
  notes: string | null
  item_name: string
  category: ItemCategory
  template_id: string | null
  template_name: string | null
  volume_number: number | null
  unit_cost_cents: number
  net_profit_cents: number
}

export interface SalesFilter {
  platform: SalesPlatform | null
  from: string | null
  to: string | null
}

export async function recordSale(s: SaleInput): Promise<string> {
  const { data, error } = await supabase
    .from('sales')
    .insert({
      item_id: s.itemId,
      quantity: s.quantity,
      platform: s.platform,
      sale_price_cents: s.salePriceCents,
      shipping_charged_cents: s.shippingChargedCents,
      shipping_cost_cents: s.shippingCostCents,
      platform_fee_cents: s.platformFeeCents,
      other_cost_cents: s.otherCostCents,
      sold_at: s.soldAt,
      notes: s.notes,
    })
    .select('id')
    .single()
  if (error) throw error
  notifyDataChanged()
  return data.id
}

export interface BundleInput {
  items: { item_id: string; quantity: number }[]
  platform: SalesPlatform
  totalPriceCents: number
  shippingChargedCents: number
  shippingCostCents: number
  platformFeeCents: number
  soldAt: string
  mode: BundleSplitMode
  notes: string | null
}

export async function recordBundleSale(b: BundleInput): Promise<string> {
  const { data, error } = await supabase.rpc('record_bundle_sale', {
    p_items: b.items,
    p_platform: b.platform,
    p_total_price_cents: b.totalPriceCents,
    p_shipping_charged_cents: b.shippingChargedCents,
    p_shipping_cost_cents: b.shippingCostCents,
    p_platform_fee_cents: b.platformFeeCents,
    p_sold_at: b.soldAt,
    p_alloc_mode: b.mode,
    p_notes: b.notes ?? undefined,
  })
  if (error) throw error
  notifyDataChanged()
  return data
}

/** Deleting a sale puts its copies back (the database resets the item's status). */
export async function deleteSale(id: string) {
  const { error } = await supabase.from('sales').delete().eq('id', id)
  if (error) throw error
  notifyDataChanged()
}

export async function deleteBundle(bundleId: string) {
  const { error } = await supabase.from('sales').delete().eq('bundle_id', bundleId)
  if (error) throw error
  notifyDataChanged()
}

export async function updateSale(id: string, s: Omit<SaleInput, 'itemId'>) {
  const { error } = await supabase
    .from('sales')
    .update({
      quantity: s.quantity,
      platform: s.platform,
      sale_price_cents: s.salePriceCents,
      shipping_charged_cents: s.shippingChargedCents,
      shipping_cost_cents: s.shippingCostCents,
      platform_fee_cents: s.platformFeeCents,
      other_cost_cents: s.otherCostCents,
      sold_at: s.soldAt,
      notes: s.notes,
    })
    .eq('id', id)
  if (error) throw error
  notifyDataChanged()
}

type SaleViewRow = Database['public']['Views']['v_sales']['Row']

function toSaleRow(r: SaleViewRow): SaleRow {
  return {
    id: r.id ?? '',
    item_id: r.item_id ?? '',
    bundle_id: r.bundle_id,
    quantity: r.quantity ?? 1,
    sold_at: r.sold_at ?? '',
    platform: r.platform ?? 'other',
    sale_price_cents: r.sale_price_cents ?? 0,
    shipping_charged_cents: r.shipping_charged_cents ?? 0,
    shipping_cost_cents: r.shipping_cost_cents ?? 0,
    platform_fee_cents: r.platform_fee_cents ?? 0,
    other_cost_cents: r.other_cost_cents ?? 0,
    notes: r.notes,
    item_name: r.item_name ?? '',
    category: r.category ?? 'other',
    template_id: r.template_id,
    template_name: r.template_name,
    volume_number: r.volume_number,
    unit_cost_cents: r.unit_cost_cents ?? 0,
    net_profit_cents: r.net_profit_cents ?? 0,
  }
}

/** One sale with its item details. */
export async function getSale(id: string): Promise<SaleRow | null> {
  const { data, error } = await supabase.from('v_sales').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? toSaleRow(data) : null
}

/** Sales for the filters, newest first (up to 2000, fetched in chunks). */
export async function listSales(f: SalesFilter): Promise<SaleRow[]> {
  const rows: SaleRow[] = []
  for (let from = 0; from < 2000; from += 1000) {
    let query = supabase.from('v_sales').select('*')
    if (f.platform) query = query.eq('platform', f.platform)
    if (f.from) query = query.gte('sold_at', new Date(`${f.from}T00:00:00`).toISOString())
    if (f.to)
      query = query.lt(
        'sold_at',
        new Date(new Date(`${f.to}T00:00:00`).getTime() + 86_400_000).toISOString(),
      )
    const { data, error } = await query
      .order('sold_at', { ascending: false })
      .order('id')
      .range(from, from + 999)
    if (error) throw error
    rows.push(...(data ?? []).map(toSaleRow))
    if (!data || data.length < 1000) break
  }
  return rows
}
