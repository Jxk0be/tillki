import { computed, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { notifyDataChanged } from './useDataChanged'
import type { ItemStatus } from '@/types/inventory'

export const BUNDLE_TAG = 'bundle'

export interface StaleItem {
  id: string
  sku: string | null
  name: string
  status: ItemStatus
  units_left: number
  cost_cents: number
  list_price_cents: number | null
  days_in_stock: number
  listed_at: string | null
  tags: string[]
  cover_path: string | null
  cover_source: 'item' | 'template' | null
}

/** Items in stock or listed for more than `days` days, oldest first. */
export async function listStale(days: number): Promise<StaleItem[]> {
  const { data, error } = await supabase
    .from('v_items')
    .select(
      'id, sku, name, status, units_left, cost_cents, list_price_cents, days_in_stock, listed_at, tags, cover_path, cover_source',
    )
    .is('archived_at', null)
    .in('status', ['in_stock', 'listed'])
    .gt('units_left', 0)
    .gt('days_in_stock', days)
    .order('days_in_stock', { ascending: false })
    .limit(500)
  if (error) throw new Error(error.message)
  return (data ?? []) as StaleItem[]
}

/** A price lowered by a percent, rounded down to whole cents. */
export function droppedPrice(cents: number, percent: number): number {
  return Math.max(0, Math.floor((cents * (100 - percent)) / 100))
}

/** Lowers each item's asking price by a percent (the database logs each change). */
export async function dropPrices(items: StaleItem[], percent: number) {
  const priced = items.filter((i) => i.list_price_cents !== null)
  const results = await Promise.all(
    priced.map((i) =>
      supabase
        .from('items')
        .update({ list_price_cents: droppedPrice(i.list_price_cents as number, percent) })
        .eq('id', i.id),
    ),
  )
  if (results.some((r) => r.error)) throw new Error("Some prices didn't update.")
  notifyDataChanged()
  return priced.length
}

/** Tags items "bundle" so they're easy to find and sell together. */
export async function tagForBundle(items: StaleItem[]) {
  const todo = items.filter((i) => !i.tags.includes(BUNDLE_TAG))
  const results = await Promise.all(
    todo.map((i) =>
      supabase
        .from('items')
        .update({ tags: [...i.tags, BUNDLE_TAG] })
        .eq('id', i.id),
    ),
  )
  if (results.some((r) => r.error)) throw new Error("Some items didn't get the tag.")
  notifyDataChanged()
}

export async function setStatus(ids: string[], status: ItemStatus) {
  const { error } = await supabase.from('items').update({ status }).in('id', ids)
  if (error) throw new Error(error.message)
  notifyDataChanged()
}

// ---------------------------------------------------------------- the Dashboard tab badge
const DISMISS_KEY = 'kura-stale-dismissed'
const count = ref(0)
const dismissedAt = ref(readDismissed())

function readDismissed(): number {
  try {
    return Number(localStorage.getItem(DISMISS_KEY)) || 0
  } catch {
    return 0
  }
}

/**
 * How many items are stale, for a badge on the Dashboard tab. Dismissing hides
 * it until more items go stale than when it was dismissed.
 */
export function useStaleBadge() {
  async function refresh(days: number) {
    const { count: n } = await supabase
      .from('v_items')
      .select('id', { count: 'exact', head: true })
      .is('archived_at', null)
      .in('status', ['in_stock', 'listed'])
      .gt('units_left', 0)
      .gt('days_in_stock', days)
    count.value = n ?? 0
    if (count.value < dismissedAt.value) dismissedAt.value = count.value
  }
  function dismiss() {
    dismissedAt.value = count.value
    try {
      localStorage.setItem(DISMISS_KEY, String(count.value))
    } catch {
      // fine; it stays hidden for this visit
    }
  }
  const visible = computed(() => count.value > 0 && count.value > dismissedAt.value)
  return { count, visible, refresh, dismiss }
}
