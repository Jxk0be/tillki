import type { Database } from './database'

export type ItemStatus = Database['public']['Enums']['item_status']
export type ItemCategory = Database['public']['Enums']['item_category']
export type ItemCondition = Database['public']['Enums']['item_condition']
export type SalesPlatform = Database['public']['Enums']['sales_platform']

type ItemViewRow = Database['public']['Views']['v_items']['Row']
type TemplateViewRow = Database['public']['Views']['v_templates']['Row']

/**
 * A v_items row with the columns the database always fills marked non-null.
 * (Generated view types make every column nullable.)
 */
export interface InventoryItem {
  id: string
  sku: string
  name: string
  description: string | null
  effective_description: string | null
  category: ItemCategory
  kind: 'set' | 'one_off'
  template_id: string | null
  template_name: string | null
  total_volumes: number | null
  series: string | null
  volume_number: number | null
  isbn: string | null
  condition: ItemCondition | null
  quantity: number
  units_sold: number
  units_left: number
  cost_cents: number
  list_price_cents: number | null
  est_profit_cents: number | null
  status: ItemStatus
  listed_at: string | null
  purchased_at: string | null
  storage_location: string | null
  tags: string[]
  lot_names: string[]
  image_count: number
  cover_path: string | null
  cover_source: 'item' | 'template' | null
  acquisition_count: number
  days_in_stock: number
  created_at: string
  created_by: string | null
  archived_at: string | null
}

export function toInventoryItem(row: ItemViewRow): InventoryItem {
  return {
    id: row.id ?? '',
    sku: row.sku ?? '',
    name: row.name ?? '',
    description: row.description,
    effective_description: row.effective_description,
    category: row.category ?? 'other',
    kind: row.kind === 'set' ? 'set' : 'one_off',
    template_id: row.template_id,
    template_name: row.template_name,
    total_volumes: row.total_volumes,
    series: row.series,
    volume_number: row.volume_number,
    isbn: row.isbn,
    condition: row.condition,
    quantity: row.quantity ?? 0,
    units_sold: row.units_sold ?? 0,
    units_left: row.units_left ?? 0,
    cost_cents: row.cost_cents ?? 0,
    list_price_cents: row.list_price_cents,
    est_profit_cents: row.est_profit_cents,
    status: row.status ?? 'in_stock',
    listed_at: row.listed_at,
    purchased_at: row.purchased_at,
    storage_location: row.storage_location,
    tags: row.tags ?? [],
    lot_names: row.lot_names ?? [],
    image_count: row.image_count ?? 0,
    cover_path: row.cover_path,
    cover_source:
      row.cover_source === 'item' || row.cover_source === 'template' ? row.cover_source : null,
    acquisition_count: row.acquisition_count ?? 0,
    days_in_stock: row.days_in_stock ?? 0,
    created_at: row.created_at ?? '',
    created_by: row.created_by,
    archived_at: row.archived_at,
  }
}

/** A v_templates row ("set") with aggregate columns non-null. */
export interface InventorySet {
  id: string
  name: string
  description: string | null
  category: ItemCategory
  publisher: string | null
  total_volumes: number | null
  total_known: boolean
  is_ongoing: boolean
  cover_path: string | null
  volumes_owned: number
  units_in_stock: number
  extra_copies: number
  volumes_sold: number
  owned_ranges: string
  missing_ranges: string
  missing_count: number
  completion_percent: number | null
  cost_basis_cents: number
  list_value_cents: number
  est_profit_cents: number
  last_added_at: string | null
  created_at: string
}

export function toInventorySet(row: TemplateViewRow): InventorySet {
  return {
    id: row.id ?? '',
    name: row.name ?? '',
    description: row.description,
    category: row.category ?? 'manga',
    publisher: row.publisher,
    total_volumes: row.total_volumes,
    total_known: row.total_known ?? false,
    is_ongoing: row.is_ongoing ?? false,
    cover_path: row.cover_path,
    volumes_owned: row.volumes_owned ?? 0,
    units_in_stock: row.units_in_stock ?? 0,
    extra_copies: row.extra_copies ?? 0,
    volumes_sold: row.volumes_sold ?? 0,
    owned_ranges: row.owned_ranges ?? '',
    missing_ranges: row.missing_ranges ?? '',
    missing_count: row.missing_count ?? 0,
    completion_percent: row.completion_percent,
    cost_basis_cents: row.cost_basis_cents ?? 0,
    list_value_cents: row.list_value_cents ?? 0,
    est_profit_cents: row.est_profit_cents ?? 0,
    last_added_at: row.last_added_at,
    created_at: row.created_at ?? '',
  }
}

/** Quick actions offered for an item in menus and on its detail page. */
export type ItemAction = 'list' | 'unlist' | 'sell' | 'edit' | 'duplicate' | 'archive' | 'unarchive'
