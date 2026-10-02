import { ref } from 'vue'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { parseMoneyToCents } from '@/lib/money'
import { todayIso } from '@/lib/dates'
import { normalizeIsbn } from '@/lib/isbn'
import { itemCategories, itemConditions, itemStatuses } from '@/lib/labels'
import { deleteStoredPhotos, existingPhoto, uploadPhotos, type PhotoList } from './usePhotos'
import {
  toInventoryItem,
  type InventoryItem,
  type ItemCategory,
  type ItemCondition,
  type ItemStatus,
  type LotOption,
} from '@/types/inventory'

/** What the form edits. Text fields stay strings until validation. */
export interface ItemFormValues {
  name: string
  nameIsCustom: boolean
  category: ItemCategory | null
  series: string
  volumeNumber: string
  isbn: string
  condition: ItemCondition | null
  quantity: number
  cost: string
  /** In a lot, cost normally comes from the lot split; this lets you type it anyway. */
  overrideLotCost: boolean
  price: string
  lotId: string | null
  source: string
  purchasedAt: string
  description: string
  tags: string[]
  storageLocation: string
  status: ItemStatus
}

export function emptyValues(): ItemFormValues {
  return {
    name: '',
    nameIsCustom: false,
    category: null,
    series: '',
    volumeNumber: '',
    isbn: '',
    condition: null,
    quantity: 1,
    cost: '',
    overrideLotCost: false,
    price: '',
    lotId: null,
    source: '',
    purchasedAt: todayIso(),
    description: '',
    tags: [],
    storageLocation: '',
    status: 'in_stock',
  }
}

export type FieldErrors = Partial<Record<keyof ItemFormValues, string>>

export interface ValidOptions {
  /** Set volumes take their name from the set unless it's custom. */
  isSetVolume: boolean
  /** On edit with several acquisitions, cost isn't edited here. */
  costEditable: boolean
}

const money = (required: boolean, message: string) =>
  z.string().superRefine((value, ctx) => {
    if (value.trim() === '' && !required) return
    if (parseMoneyToCents(value) === null) ctx.addIssue({ code: 'custom', message })
  })

/** Validates the form. Returns field errors (empty when valid). */
export function validateItem(values: ItemFormValues, opts: ValidOptions): FieldErrors {
  const costRequired = opts.costEditable && (!values.lotId || values.overrideLotCost)
  const schema = z.object({
    name:
      opts.isSetVolume && !values.nameIsCustom
        ? z.string()
        : z.string().trim().min(1, 'Give it a name.').max(200, 'That name is too long.'),
    category: z.enum(itemCategories as [ItemCategory, ...ItemCategory[]], {
      error: 'Pick a category.',
    }),
    volumeNumber: z
      .string()
      .trim()
      .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) > 0), 'Use a whole number, like 3.'),
    isbn: z
      .string()
      .trim()
      .refine((v) => v === '' || normalizeIsbn(v) !== null, "That isn't a valid ISBN."),
    condition: z.enum(itemConditions as [ItemCondition, ...ItemCondition[]]).nullable(),
    quantity: z.number().int().min(1, 'At least 1.'),
    cost: money(
      costRequired,
      costRequired ? 'Enter what you paid each, like 4 or 4.50.' : 'Use an amount like 4.50.',
    ),
    price: money(false, 'Use an amount like 12 or 12.50.'),
    purchasedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date.'),
    status: z.enum(itemStatuses as [ItemStatus, ...ItemStatus[]]),
  })

  const result = schema.safeParse(values)
  if (result.success) return {}
  const errors: FieldErrors = {}
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof ItemFormValues
    errors[key] ??= issue.message
  }
  return errors
}

/** Order of fields on screen, for scrolling to the first error. */
export const fieldOrder: (keyof ItemFormValues)[] = [
  'name',
  'category',
  'volumeNumber',
  'isbn',
  'condition',
  'quantity',
  'cost',
  'price',
  'purchasedAt',
  'status',
]

export interface SetInfo {
  id: string
  name: string
  description: string | null
  coverPath: string | null
}

export interface AcquisitionSummary {
  id: string
  quantity: number
  unitCostCents: number
  lotId: string | null
  source: string | null
  purchasedAt: string
}

export interface SaveResult {
  ok: boolean
  itemId?: string
  message?: string
  failedPhotos: number
}

/**
 * Data for the one-off / volume form: lots, recent sources, loading an item
 * to edit or duplicate, and saving (item, acquisition and photos).
 */
export function useItemForm() {
  const lots = ref<LotOption[]>([])
  const recentSources = ref<string[]>([])
  const item = ref<InventoryItem | null>(null)
  const set = ref<SetInfo | null>(null)
  const acquisitions = ref<AcquisitionSummary[]>([])
  const originalPaths = ref<string[]>([])

  async function loadOptions() {
    const [lotRows, sourceRows] = await Promise.all([
      supabase
        .from('lots')
        .select('id, name')
        .order('purchased_at', { ascending: false, nullsFirst: false }),
      supabase
        .from('item_acquisitions')
        .select('purchase_source')
        .not('purchase_source', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100),
    ])
    lots.value = lotRows.data ?? []
    recentSources.value = [
      ...new Set(
        (sourceRows.data ?? [])
          .map((r) => r.purchase_source?.trim())
          .filter((s): s is string => !!s),
      ),
    ].slice(0, 10)
  }

  async function createLot(name: string, totalCents: number): Promise<LotOption | null> {
    const { data, error } = await supabase
      .from('lots')
      .insert({ name, total_cost_cents: totalCents, purchased_at: todayIso() })
      .select('id, name')
      .single()
    if (error || !data) return null
    lots.value = [data, ...lots.value]
    return data
  }

  /** Loads an item for editing (or as the starting point of a duplicate). */
  async function loadItem(id: string): Promise<ItemFormValues | null> {
    const [itemRes, acqRes, imgRes] = await Promise.all([
      supabase.from('v_items').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('item_acquisitions')
        .select('id, quantity, unit_cost_cents, lot_id, purchase_source, purchased_at')
        .eq('item_id', id)
        .order('purchased_at')
        .order('created_at'),
      supabase.from('item_images').select('storage_path').eq('item_id', id).order('position'),
    ])
    if (itemRes.error || !itemRes.data) return null
    const loaded = toInventoryItem(itemRes.data)
    item.value = loaded
    acquisitions.value = (acqRes.data ?? []).map((a) => ({
      id: a.id,
      quantity: a.quantity,
      unitCostCents: a.unit_cost_cents,
      lotId: a.lot_id,
      source: a.purchase_source,
      purchasedAt: a.purchased_at,
    }))
    originalPaths.value = (imgRes.data ?? []).map((r) => r.storage_path)

    set.value = null
    if (loaded.template_id) {
      const [tpl, cover] = await Promise.all([
        supabase
          .from('item_templates')
          .select('id, name, description')
          .eq('id', loaded.template_id)
          .maybeSingle(),
        supabase
          .from('template_images')
          .select('storage_path')
          .eq('template_id', loaded.template_id)
          .order('position')
          .limit(1)
          .maybeSingle(),
      ])
      if (tpl.data) {
        set.value = {
          id: tpl.data.id,
          name: tpl.data.name,
          description: tpl.data.description,
          coverPath: cover.data?.storage_path ?? null,
        }
      }
    }

    const first = acquisitions.value[0]
    return {
      name: loaded.name,
      nameIsCustom: itemRes.data.name_is_custom ?? false,
      category: loaded.category,
      series: loaded.series ?? '',
      volumeNumber: loaded.volume_number ? String(loaded.volume_number) : '',
      isbn: loaded.isbn ?? '',
      condition: loaded.condition,
      quantity: loaded.quantity,
      cost: acquisitions.value.length === 1 && first ? (first.unitCostCents / 100).toFixed(2) : '',
      overrideLotCost: false,
      price: loaded.list_price_cents === null ? '' : (loaded.list_price_cents / 100).toFixed(2),
      lotId: acquisitions.value.length === 1 ? (first?.lotId ?? null) : null,
      source: acquisitions.value.length === 1 ? (first?.source ?? '') : '',
      purchasedAt: first?.purchasedAt ?? todayIso(),
      description: loaded.description ?? '',
      tags: loaded.tags,
      storageLocation: loaded.storage_location ?? '',
      status: loaded.status,
    }
  }

  function existingPhotoEntries() {
    return originalPaths.value.map(existingPhoto)
  }

  /** Uploads new photos and rewrites item_images in the on-screen order. */
  async function syncPhotos(itemId: string, photos: PhotoList): Promise<number> {
    await uploadPhotos(photos.getEntries, `items/${itemId}`, photos.patch)
    const entries = photos.getEntries()
    const keptPaths = entries
      .filter((e) => e.state === 'uploaded' && e.path)
      .map((e) => e.path as string)
    const removed = originalPaths.value.filter((p) => !keptPaths.includes(p))

    // Rewrite the rows so positions are 0..n in order (simplest way to reorder).
    const { error: delError } = await supabase.from('item_images').delete().eq('item_id', itemId)
    if (delError) throw delError
    if (keptPaths.length) {
      const { error: insError } = await supabase
        .from('item_images')
        .insert(
          keptPaths.map((storage_path, position) => ({ item_id: itemId, storage_path, position })),
        )
      if (insError) throw insError
    }
    await deleteStoredPhotos(removed)
    originalPaths.value = keptPaths
    return entries.filter((e) => e.state === 'failed').length
  }

  function itemColumns(values: ItemFormValues, isSetVolume: boolean) {
    const volume = values.volumeNumber.trim() ? Number(values.volumeNumber) : null
    return {
      ...(isSetVolume
        ? {
            name_is_custom: values.nameIsCustom,
            ...(values.nameIsCustom ? { name: values.name.trim() } : {}),
          }
        : {
            name: values.name.trim(),
            series: values.series.trim() || null,
            volume_number: volume,
          }),
      description: values.description.trim() || null,
      category: values.category ?? 'other',
      isbn: values.isbn.trim() ? normalizeIsbn(values.isbn) : null,
      condition: values.condition,
      list_price_cents: values.price.trim() ? parseMoneyToCents(values.price) : null,
      storage_location: values.storageLocation.trim() || null,
      tags: values.tags,
      status: values.status,
    }
  }

  function costCents(values: ItemFormValues) {
    if (values.lotId && !values.overrideLotCost) return 0
    return parseMoneyToCents(values.cost) ?? 0
  }

  async function createItem(values: ItemFormValues, photos: PhotoList): Promise<SaveResult> {
    const { data, error } = await supabase.rpc('create_item', {
      p_item: itemColumns(values, false),
      p_acquisition: {
        quantity: values.quantity,
        unit_cost_cents: costCents(values),
        lot_id: values.lotId,
        purchase_source: values.source.trim() || null,
        purchased_at: values.purchasedAt,
      },
    })
    if (error || !data) return { ok: false, message: error?.message, failedPhotos: 0 }
    const itemId = (data as { id: string }).id
    originalPaths.value = []
    try {
      const failed = await syncPhotos(itemId, photos)
      return { ok: true, itemId, failedPhotos: failed }
    } catch (e) {
      return {
        ok: true,
        itemId,
        failedPhotos: photos.getEntries().length,
        message: e instanceof Error ? e.message : undefined,
      }
    }
  }

  async function updateItem(
    itemId: string,
    values: ItemFormValues,
    photos: PhotoList,
  ): Promise<SaveResult> {
    const isSetVolume = item.value?.template_id != null
    const { error } = await supabase
      .from('items')
      .update(itemColumns(values, isSetVolume))
      .eq('id', itemId)
    if (error) return { ok: false, message: error.message, failedPhotos: 0 }

    // With exactly one purchase, what we paid is edited here; with several it's read-only.
    const only = acquisitions.value.length === 1 ? acquisitions.value[0] : undefined
    if (only) {
      const { error: acqError } = await supabase
        .from('item_acquisitions')
        .update({
          unit_cost_cents: costCents(values),
          lot_id: values.lotId,
          purchase_source: values.source.trim() || null,
          purchased_at: values.purchasedAt,
        })
        .eq('id', only.id)
      if (acqError) return { ok: false, message: acqError.message, failedPhotos: 0 }
    }

    try {
      const failed = await syncPhotos(itemId, photos)
      return { ok: true, itemId, failedPhotos: failed }
    } catch (e) {
      return {
        ok: true,
        itemId,
        failedPhotos: 1,
        message: e instanceof Error ? e.message : undefined,
      }
    }
  }

  /** Adds copies to another item (a scanned ISBN we already have). */
  async function addCopiesTo(
    itemId: string,
    input: {
      quantity: number
      unitCostCents: number
      lotId: string | null
      source: string | null
      purchasedAt: string
    },
  ) {
    const { error } = await supabase.rpc('add_copies', {
      p_item_id: itemId,
      p_quantity: input.quantity,
      p_unit_cost_cents: input.unitCostCents,
      p_lot_id: input.lotId ?? undefined,
      p_purchase_source: input.source ?? undefined,
      p_purchased_at: input.purchasedAt,
    })
    return { ok: !error, message: error?.message }
  }

  return {
    addCopiesTo,
    lots,
    recentSources,
    item,
    set,
    acquisitions,
    loadOptions,
    createLot,
    loadItem,
    existingPhotoEntries,
    syncPhotos,
    createItem,
    updateItem,
  }
}
