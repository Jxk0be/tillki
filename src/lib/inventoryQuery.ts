import type { LocationQuery, LocationQueryRaw } from 'vue-router'
import { itemCategories, itemConditions, itemStatuses } from './labels'
import type { ItemCategory, ItemCondition, ItemStatus } from '@/types/inventory'

export type InventoryView = 'items' | 'sets'
export type KindFilter = 'all' | 'set' | 'one_off'
export type SortDir = 'asc' | 'desc'

/** Columns the item list can sort by (also the desktop table's sortable columns). */
export const sortKeys = [
  'created_at',
  'sku',
  'name',
  'template_name',
  'category',
  'condition',
  'units_left',
  'status',
  'cost_cents',
  'list_price_cents',
  'est_profit_cents',
  'days_in_stock',
] as const
export type SortKey = (typeof sortKeys)[number]

/** Ways to order set groups in the Sets view. */
export const groupSorts = ['name', 'missing', 'completion', 'value', 'recent'] as const
export type GroupSort = (typeof groupSorts)[number]

export const groupSortLabels: Record<GroupSort, string> = {
  name: 'Name',
  missing: 'Most missing',
  completion: 'Completion',
  value: 'Value',
  recent: 'Recently added',
}

/** The quick sort choices offered on mobile. */
export const sortPresets: { label: string; sort: SortKey; dir: SortDir }[] = [
  { label: 'Newest', sort: 'created_at', dir: 'desc' },
  { label: 'Oldest', sort: 'created_at', dir: 'asc' },
  { label: 'Price: high to low', sort: 'list_price_cents', dir: 'desc' },
  { label: 'Price: low to high', sort: 'list_price_cents', dir: 'asc' },
  { label: 'Est. profit', sort: 'est_profit_cents', dir: 'desc' },
  { label: 'Days in stock', sort: 'days_in_stock', dir: 'desc' },
  { label: 'Set and volume', sort: 'template_name', dir: 'asc' },
]

export interface InventoryFilters {
  view: InventoryView
  q: string
  kind: KindFilter
  set: string | null
  category: ItemCategory | null
  status: ItemStatus[]
  condition: ItemCondition | null
  noPhotos: boolean
  archived: boolean
  sort: SortKey
  dir: SortDir
  groupSort: GroupSort
  /** Set to expand in Sets view (from a set chip in Items view). */
  expand: string | null
}

export const defaultFilters: Readonly<InventoryFilters> = {
  view: 'items',
  q: '',
  kind: 'all',
  set: null,
  category: null,
  status: [],
  condition: null,
  noPhotos: false,
  archived: false,
  sort: 'created_at',
  dir: 'desc',
  groupSort: 'name',
  expand: null,
}

function first(value: LocationQuery[string] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value
  return typeof v === 'string' && v !== '' ? v : null
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null
}

/** Reads filters from the URL query, ignoring anything unrecognised. */
export function parseInventoryQuery(query: LocationQuery): InventoryFilters {
  const statuses = (first(query.status) ?? '')
    .split(',')
    .map((s) => oneOf(s, itemStatuses))
    .filter((s): s is ItemStatus => s !== null)

  return {
    view: oneOf(first(query.view), ['items', 'sets'] as const) ?? defaultFilters.view,
    q: first(query.q) ?? '',
    kind: oneOf(first(query.kind), ['all', 'set', 'one_off'] as const) ?? defaultFilters.kind,
    set: first(query.set),
    category: oneOf(first(query.category), itemCategories),
    status: [...new Set(statuses)],
    condition: oneOf(first(query.condition), itemConditions),
    noPhotos: first(query.nophotos) === '1',
    archived: first(query.archived) === '1',
    sort: oneOf(first(query.sort), sortKeys) ?? defaultFilters.sort,
    dir: oneOf(first(query.dir), ['asc', 'desc'] as const) ?? defaultFilters.dir,
    groupSort: oneOf(first(query.gsort), groupSorts) ?? defaultFilters.groupSort,
    expand: first(query.expand),
  }
}

/** Writes filters to a URL query, leaving out defaults so links stay short. */
export function toInventoryQuery(f: InventoryFilters): LocationQueryRaw {
  const q: LocationQueryRaw = {}
  if (f.view !== defaultFilters.view) q.view = f.view
  if (f.q.trim()) q.q = f.q.trim()
  if (f.kind !== defaultFilters.kind) q.kind = f.kind
  if (f.set) q.set = f.set
  if (f.category) q.category = f.category
  if (f.status.length) q.status = f.status.join(',')
  if (f.condition) q.condition = f.condition
  if (f.noPhotos) q.nophotos = '1'
  if (f.archived) q.archived = '1'
  if (f.sort !== defaultFilters.sort || f.dir !== defaultFilters.dir) {
    q.sort = f.sort
    q.dir = f.dir
  }
  if (f.groupSort !== defaultFilters.groupSort) q.gsort = f.groupSort
  if (f.expand) q.expand = f.expand
  return q
}

/** Filters that narrow down which items match (beyond view, sort and kind). */
export function itemFiltersActive(f: InventoryFilters): boolean {
  return Boolean(
    f.q.trim() || f.category || f.status.length || f.condition || f.noPhotos || f.archived,
  )
}

/** How many of the extra filters (the ones in the Filters sheet) are on. */
export function extraFilterCount(f: InventoryFilters): number {
  return [f.kind !== 'all', f.set, f.category, f.condition, f.noPhotos, f.archived].filter(Boolean)
    .length
}

/** Search text that's safe to put inside a PostgREST or() filter. */
export function searchPattern(q: string): string | null {
  const cleaned = q
    .replace(/[,()*%\\:"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned ? `*${cleaned}*` : null
}
