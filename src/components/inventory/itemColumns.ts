import type { SortKey } from '@/lib/inventoryQuery'

export interface ItemColumn {
  label: string
  /** Sort key, when the column can be sorted. */
  sort?: SortKey
  align?: 'right'
}

/** Desktop table columns (after the checkbox), shared by the Items and Sets tables. */
export const itemColumns: ItemColumn[] = [
  { label: 'Photo' },
  { label: 'SKU', sort: 'sku' },
  { label: 'Name', sort: 'name' },
  { label: 'Set / Vol', sort: 'template_name' },
  { label: 'Category', sort: 'category' },
  { label: 'Condition', sort: 'condition' },
  { label: 'Qty left', sort: 'units_left', align: 'right' },
  { label: 'Status', sort: 'status' },
  { label: 'Avg cost', sort: 'cost_cents', align: 'right' },
  { label: 'Price', sort: 'list_price_cents', align: 'right' },
  { label: 'Est. profit', sort: 'est_profit_cents', align: 'right' },
  { label: 'Date entered', sort: 'created_at' },
  { label: 'Days in stock', sort: 'days_in_stock', align: 'right' },
]
