import { ref, shallowRef, watch, type Ref } from 'vue'
import { supabase } from '@/lib/supabase'
import type { ActionResult } from '@/stores/inventory'
import type { Json } from '@/types/database'
import {
  toInventoryItem,
  type InventoryItem,
  type ItemStatus,
  type SalesPlatform,
} from '@/types/inventory'

export interface GalleryImage {
  path: string
  fromSet: boolean
}

export interface ItemEvent {
  id: string
  type: 'created' | 'status_changed' | 'price_changed' | 'cost_changed' | 'copies_added'
  oldValue: Json | null
  newValue: Json | null
  at: string
}

export interface ItemSale {
  id: string
  soldAt: string
  /** When the sale was recorded (orders it in History). */
  recordedAt: string
  platform: SalesPlatform
  quantity: number
  salePriceCents: number
  netProfitCents: number
  bundleId: string | null
}

export interface ItemAcquisition {
  id: string
  purchasedAt: string
  quantity: number
  unitCostCents: number
  lotId: string | null
  lotName: string | null
  source: string | null
}

export interface AddCopiesInput {
  quantity: number
  unitCostCents: number
  lotId: string | null
  source: string | null
  purchasedAt: string
}

/** Everything the item detail page shows, plus the changes it can make. */
export function useItemDetail(id: Ref<string>) {
  const item = ref<InventoryItem | null>(null)
  const images = ref<GalleryImage[]>([])
  const events = shallowRef<ItemEvent[]>([])
  const sales = ref<ItemSale[]>([])
  const acquisitions = ref<ItemAcquisition[]>([])
  const addedBy = ref<string | null>(null)
  const lots = ref<{ id: string; name: string }[]>([])
  const loading = ref(true)
  const notFound = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    const itemId = id.value
    loading.value = true
    error.value = null
    try {
      const { data: row, error: itemError } = await supabase
        .from('v_items')
        .select('*')
        .eq('id', itemId)
        .maybeSingle()
      if (itemId !== id.value) return
      if (itemError) throw itemError
      if (!row) {
        notFound.value = true
        item.value = null
        return
      }
      notFound.value = false
      const loaded = toInventoryItem(row)

      const [ownImages, setImages, eventRows, saleRows, acqRows, creator, lotRows] =
        await Promise.all([
          supabase
            .from('item_images')
            .select('storage_path')
            .eq('item_id', itemId)
            .order('position'),
          loaded.template_id
            ? supabase
                .from('template_images')
                .select('storage_path')
                .eq('template_id', loaded.template_id)
                .order('position')
            : Promise.resolve({ data: [] as { storage_path: string }[], error: null }),
          supabase
            .from('item_events')
            .select('id, event_type, old_value, new_value, created_at')
            .eq('item_id', itemId)
            .order('created_at', { ascending: false }),
          supabase
            .from('v_sales')
            .select(
              'id, sold_at, created_at, platform, quantity, sale_price_cents, net_profit_cents, bundle_id',
            )
            .eq('item_id', itemId)
            .order('sold_at', { ascending: false }),
          supabase
            .from('item_acquisitions')
            .select(
              'id, purchased_at, quantity, unit_cost_cents, purchase_source, lot_id, lots(name)',
            )
            .eq('item_id', itemId)
            .order('purchased_at')
            .order('created_at'),
          loaded.created_by
            ? supabase
                .from('profiles')
                .select('display_name')
                .eq('id', loaded.created_by)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          supabase
            .from('lots')
            .select('id, name')
            .order('purchased_at', { ascending: false, nullsFirst: false }),
        ])
      if (itemId !== id.value) return
      const firstError =
        ownImages.error ??
        setImages.error ??
        eventRows.error ??
        saleRows.error ??
        acqRows.error ??
        creator.error ??
        lotRows.error
      if (firstError) throw firstError

      item.value = loaded
      images.value = [
        ...(ownImages.data ?? []).map((r) => ({ path: r.storage_path, fromSet: false })),
        ...(setImages.data ?? []).map((r) => ({ path: r.storage_path, fromSet: true })),
      ]
      events.value = (eventRows.data ?? []).map((r) => ({
        id: r.id,
        type: r.event_type as ItemEvent['type'],
        oldValue: r.old_value,
        newValue: r.new_value,
        at: r.created_at,
      }))
      sales.value = (saleRows.data ?? []).map((r) => ({
        id: r.id ?? '',
        soldAt: r.sold_at ?? '',
        recordedAt: r.created_at ?? r.sold_at ?? '',
        platform: r.platform ?? 'other',
        quantity: r.quantity ?? 1,
        salePriceCents: r.sale_price_cents ?? 0,
        netProfitCents: r.net_profit_cents ?? 0,
        bundleId: r.bundle_id,
      }))
      acquisitions.value = (acqRows.data ?? []).map((r) => ({
        id: r.id,
        purchasedAt: r.purchased_at,
        quantity: r.quantity,
        unitCostCents: r.unit_cost_cents,
        lotId: r.lot_id,
        lotName: r.lots?.name ?? null,
        source: r.purchase_source,
      }))
      addedBy.value = creator.data?.display_name ?? null
      lots.value = lotRows.data ?? []
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Something went wrong.'
    } finally {
      if (itemId === id.value) loading.value = false
    }
  }

  /** Optimistic: shows the new status right away and reverts if saving fails. */
  async function setStatus(_ids: string[], status: ItemStatus): Promise<ActionResult> {
    if (!item.value) return { ok: false }
    const previous = item.value.status
    item.value.status = status
    const { error: err } = await supabase.from('items').update({ status }).eq('id', item.value.id)
    if (err) {
      item.value.status = previous
      return { ok: false, message: err.message }
    }
    void load()
    return { ok: true }
  }

  async function setArchived(_ids: string[], archived: boolean): Promise<ActionResult> {
    if (!item.value) return { ok: false }
    const archivedAt = archived ? new Date().toISOString() : null
    const { error: err } = await supabase
      .from('items')
      .update({ archived_at: archivedAt })
      .eq('id', item.value.id)
    if (err) return { ok: false, message: err.message }
    item.value.archived_at = archivedAt
    return { ok: true }
  }

  async function addCopies(input: AddCopiesInput): Promise<ActionResult> {
    if (!item.value) return { ok: false }
    const { error: err } = await supabase.rpc('add_copies', {
      p_item_id: item.value.id,
      p_quantity: input.quantity,
      p_unit_cost_cents: input.unitCostCents,
      p_lot_id: input.lotId ?? undefined,
      p_purchase_source: input.source ?? undefined,
      p_purchased_at: input.purchasedAt,
    })
    if (err) return { ok: false, message: err.message }
    await load()
    return { ok: true }
  }

  watch(id, () => void load(), { immediate: true })

  return {
    item,
    images,
    events,
    sales,
    acquisitions,
    addedBy,
    lots,
    loading,
    notFound,
    error,
    load,
    setStatus,
    setArchived,
    addCopies,
  }
}
