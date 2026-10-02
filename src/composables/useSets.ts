import { supabase } from '@/lib/supabase'
import { todayIso } from '@/lib/dates'
import { deleteStoredPhotos, uploadPhotos, type PhotoList } from './usePhotos'
import {
  toInventoryItem,
  toInventorySet,
  type InventoryItem,
  type InventorySet,
  type ItemCategory,
  type ItemCondition,
  type ItemStatus,
} from '@/types/inventory'

/** The editable columns of a set (item_templates). */
export interface SetFields {
  name: string
  title_pattern: string
  category: ItemCategory
  publisher: string | null
  language: string | null
  total_volumes: number | null
  is_ongoing: boolean
  description: string | null
  default_condition: ItemCondition | null
  default_cost_cents: number | null
  default_list_price_cents: number | null
  tags: string[]
  notes: string | null
}

export interface SetDetail extends InventorySet {
  title_pattern: string
  language: string | null
  default_condition: ItemCondition | null
  default_cost_cents: number | null
  default_list_price_cents: number | null
  tags: string[]
  notes: string | null
  archived_at: string | null
}

export interface ExistingVolume {
  id: string
  volume_number: number
  quantity: number
  units_left: number
  condition: ItemCondition | null
  list_price_cents: number | null
}

export interface AddVolumesParams {
  templateId: string
  volumes: number[]
  condition: ItemCondition | null
  costMode: 'per_volume' | 'split_total'
  costCents: number
  listPriceCents: number | null
  lotId: string | null
  purchaseSource: string | null
  purchasedAt: string
  status: ItemStatus
  storageLocation: string | null
  overrides: Record<string, Record<string, string | number>>
}

export interface AddedVolume {
  item_id: string
  volume_number: number
  action: 'created' | 'merged'
  new_quantity: number
}

/** All non-archived sets with their totals. */
export async function listSets(): Promise<InventorySet[]> {
  const { data, error } = await supabase
    .from('v_templates')
    .select('*')
    .is('archived_at', null)
    .order('name')
  if (error) throw error
  return (data ?? []).map(toInventorySet)
}

/** A set with its totals, settings and photo paths. */
export async function getSet(id: string): Promise<{ set: SetDetail; photoPaths: string[] } | null> {
  const [view, images] = await Promise.all([
    supabase.from('v_templates').select('*').eq('id', id).maybeSingle(),
    supabase.from('template_images').select('storage_path').eq('template_id', id).order('position'),
  ])
  if (view.error) throw view.error
  if (!view.data) return null
  const row = view.data
  return {
    set: {
      ...toInventorySet(row),
      title_pattern: row.title_pattern ?? '{name} Volume {n}',
      language: row.language,
      default_condition: row.default_condition,
      default_cost_cents: row.default_cost_cents,
      default_list_price_cents: row.default_list_price_cents,
      tags: row.tags ?? [],
      notes: row.notes,
      archived_at: row.archived_at,
    },
    photoPaths: (images.data ?? []).map((r) => r.storage_path),
  }
}

/** Every (non-archived) volume row of a set, by volume number. */
export async function getSetVolumes(id: string): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('v_items')
    .select('*')
    .eq('template_id', id)
    .is('archived_at', null)
    .order('volume_number')
  if (error) throw error
  return (data ?? []).map(toInventoryItem)
}

export async function getExistingVolumes(id: string): Promise<ExistingVolume[]> {
  const { data, error } = await supabase
    .from('v_items')
    .select('id, volume_number, quantity, units_left, condition, list_price_cents')
    .eq('template_id', id)
    .is('archived_at', null)
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id ?? '',
    volume_number: r.volume_number ?? 0,
    quantity: r.quantity ?? 0,
    units_left: r.units_left ?? 0,
    condition: r.condition,
    list_price_cents: r.list_price_cents,
  }))
}

/** Uploads new photos and rewrites template_images in the on-screen order. */
async function syncSetPhotos(
  templateId: string,
  photos: PhotoList,
  originalPaths: string[],
): Promise<number> {
  await uploadPhotos(photos.getEntries, `templates/${templateId}`, photos.patch)
  const entries = photos.getEntries()
  const kept = entries.filter((e) => e.state === 'uploaded' && e.path).map((e) => e.path as string)
  const { error: delError } = await supabase
    .from('template_images')
    .delete()
    .eq('template_id', templateId)
  if (delError) throw delError
  if (kept.length) {
    const { error } = await supabase
      .from('template_images')
      .insert(
        kept.map((storage_path, position) => ({ template_id: templateId, storage_path, position })),
      )
    if (error) throw error
  }
  await deleteStoredPhotos(originalPaths.filter((p) => !kept.includes(p)))
  return entries.filter((e) => e.state === 'failed').length
}

export interface SaveSetResult {
  ok: boolean
  id?: string
  failedPhotos: number
  message?: string
}

export async function createSet(fields: SetFields, photos: PhotoList): Promise<SaveSetResult> {
  const { data, error } = await supabase.from('item_templates').insert(fields).select('id').single()
  if (error || !data) {
    const duplicate = error?.code === '23505'
    return {
      ok: false,
      failedPhotos: 0,
      message: duplicate ? 'You already have a set with that name.' : error?.message,
    }
  }
  try {
    return { ok: true, id: data.id, failedPhotos: await syncSetPhotos(data.id, photos, []) }
  } catch {
    return { ok: true, id: data.id, failedPhotos: photos.getEntries().length }
  }
}

export async function updateSet(
  id: string,
  fields: SetFields,
  photos: PhotoList,
  originalPaths: string[],
): Promise<SaveSetResult> {
  const { error } = await supabase.from('item_templates').update(fields).eq('id', id)
  if (error) {
    const duplicate = error.code === '23505'
    return {
      ok: false,
      failedPhotos: 0,
      message: duplicate ? 'You already have a set with that name.' : error.message,
    }
  }
  try {
    return { ok: true, id, failedPhotos: await syncSetPhotos(id, photos, originalPaths) }
  } catch {
    return { ok: true, id, failedPhotos: 1 }
  }
}

export async function retrySetPhotos(id: string, photos: PhotoList, originalPaths: string[]) {
  return syncSetPhotos(id, photos, originalPaths)
}

export async function addVolumes(p: AddVolumesParams): Promise<AddedVolume[]> {
  const { data, error } = await supabase.rpc('add_template_volumes', {
    p_template_id: p.templateId,
    p_volumes: p.volumes,
    p_condition: p.condition ?? undefined,
    p_cost_mode: p.costMode,
    p_cost_cents: p.costCents,
    p_list_price_cents: p.listPriceCents ?? undefined,
    p_lot_id: p.lotId ?? undefined,
    p_purchase_source: p.purchaseSource ?? undefined,
    p_purchased_at: p.purchasedAt,
    p_status: p.status,
    p_storage_location: p.storageLocation ?? undefined,
    p_overrides: p.overrides,
  })
  if (error) throw error
  return (data ?? []).map((r) => ({
    item_id: r.item_id,
    volume_number: r.volume_number,
    action: r.action === 'merged' ? 'merged' : 'created',
    new_quantity: r.new_quantity,
  }))
}

export async function createLot(name: string, totalCents: number, purchasedAt = todayIso()) {
  const { data, error } = await supabase
    .from('lots')
    .insert({ name, total_cost_cents: totalCents, purchased_at: purchasedAt })
    .select('id, name')
    .single()
  if (error) throw error
  return data
}

export async function listLots() {
  const { data } = await supabase
    .from('lots')
    .select('id, name')
    .order('purchased_at', { ascending: false, nullsFirst: false })
  return data ?? []
}

export async function recentSources(): Promise<string[]> {
  const { data } = await supabase
    .from('item_acquisitions')
    .select('purchase_source')
    .not('purchase_source', 'is', null)
    .order('created_at', { ascending: false })
    .limit(100)
  return [
    ...new Set((data ?? []).map((r) => r.purchase_source?.trim()).filter((s): s is string => !!s)),
  ].slice(0, 10)
}

export async function setArchived(id: string, archived: boolean) {
  const { error } = await supabase
    .from('item_templates')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw error
}

/** Only possible when the set has no items at all (the database also refuses otherwise). */
export async function deleteSet(id: string, photoPaths: string[]) {
  const { error } = await supabase.from('item_templates').delete().eq('id', id)
  if (error) throw error
  await deleteStoredPhotos(photoPaths)
}

export async function countSetItems(id: string): Promise<number> {
  const { count } = await supabase
    .from('items')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', id)
  return count ?? 0
}

export async function setItemsStatus(ids: string[], status: ItemStatus) {
  const { error } = await supabase.from('items').update({ status }).in('id', ids)
  if (error) throw error
}

export async function setItemsPrice(ids: string[], listPriceCents: number | null) {
  const { error } = await supabase
    .from('items')
    .update({ list_price_cents: listPriceCents })
    .in('id', ids)
  if (error) throw error
}

export async function archiveItems(ids: string[], archived: boolean) {
  const { error } = await supabase
    .from('items')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .in('id', ids)
  if (error) throw error
}
