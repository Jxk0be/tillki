import type { CsvColumn } from './csv'
import { categoryLabels, conditionLabels, itemStatuses, statusLabels } from './labels'
import { formatCents } from './money'
import { formatRanges } from './volumes'
import type { KindFilter } from './inventoryQuery'
import type { ItemCategory, ItemCondition, ItemStatus } from '@/types/inventory'

export type ExportFormat = 'csv' | 'pdf'

export interface StockExportOptions {
  format: ExportFormat
  /** Which statuses to include. Empty means nothing matches. */
  statuses: ItemStatus[]
  kind: KindFilter
  category: ItemCategory | null
  /** One line per set listing its volumes as ranges, instead of one line per volume. */
  groupSets: boolean
  includePrices: boolean
  /** Our cost and estimated profit. Off by default since exports usually go to buyers. */
  includeCosts: boolean
}

/** What's on the shelf: the statuses a buyer can actually get. */
export const availableStatuses: readonly ItemStatus[] = ['in_stock', 'listed', 'reserved']

export const defaultExportOptions: Readonly<StockExportOptions> = {
  format: 'pdf',
  statuses: [...availableStatuses],
  kind: 'all',
  category: null,
  groupSets: true,
  includePrices: true,
  includeCosts: false,
}

/** The v_items columns an export needs. */
export const exportColumns =
  'id, sku, name, template_id, template_name, volume_number, category, condition, status, quantity, units_left, units_sold, cost_cents, list_price_cents, isbn, storage_location'

export interface ExportItem {
  id: string
  sku: string
  name: string
  template_id: string | null
  template_name: string | null
  volume_number: number | null
  category: ItemCategory
  condition: ItemCondition | null
  status: ItemStatus
  quantity: number
  units_left: number
  units_sold: number
  cost_cents: number
  list_price_cents: number | null
  isbn: string | null
  storage_location: string | null
}

/** Copies this line stands for: sold copies for sold items, otherwise copies on hand. */
export function exportUnits(item: ExportItem): number {
  return item.status === 'sold' ? item.units_sold : item.units_left
}

/** One row of the export: a single item, or a whole set when grouping. */
export interface ExportLine {
  title: string
  /** "Vol. 1-3, 5" for a grouped set, "Vol. 4" for a volume, "" for a one-off. */
  volumes: string
  category: string
  condition: string
  status: string
  units: number
  /** Lowest and highest asking price per copy; null when nothing is priced. */
  priceMinCents: number | null
  priceMaxCents: number | null
  /** Sum of copies x asking price (unpriced copies count as 0). */
  askingTotalCents: number
  /** Sum of copies x average cost. */
  costTotalCents: number
  sku: string
  isbn: string
  storage: string
}

function sortKey(item: ExportItem): string {
  return (item.template_name ?? item.name).toLocaleLowerCase()
}

/** Sets and one-offs alphabetically, volumes in number order. */
export function sortExportItems(items: readonly ExportItem[]): ExportItem[] {
  return [...items].sort(
    (a, b) =>
      sortKey(a).localeCompare(sortKey(b)) ||
      (a.volume_number ?? 0) - (b.volume_number ?? 0) ||
      a.name.localeCompare(b.name),
  )
}

/** "Good" when every copy agrees, "Good, Like new" otherwise (in the labels' order). */
function joinLabels<T extends string>(
  values: readonly (T | null)[],
  order: readonly T[],
  labels: Record<T, string>,
): string {
  const present = new Set(values.filter((v): v is T => v !== null))
  return order
    .filter((v) => present.has(v))
    .map((v) => labels[v])
    .join(', ')
}

const conditionOrder = Object.keys(conditionLabels) as ItemCondition[]
const categoryOrder = Object.keys(categoryLabels) as ItemCategory[]

function lineFor(items: readonly ExportItem[], title: string, volumes: string): ExportLine {
  const prices = items.map((i) => i.list_price_cents).filter((p): p is number => p !== null)
  const units = items.reduce((sum, i) => sum + exportUnits(i), 0)
  return {
    title,
    volumes,
    category: joinLabels(
      items.map((i) => i.category),
      categoryOrder,
      categoryLabels,
    ),
    condition: joinLabels(
      items.map((i) => i.condition),
      conditionOrder,
      conditionLabels,
    ),
    status: joinLabels(
      items.map((i) => i.status),
      itemStatuses,
      statusLabels,
    ),
    units,
    priceMinCents: prices.length ? Math.min(...prices) : null,
    priceMaxCents: prices.length ? Math.max(...prices) : null,
    askingTotalCents: items.reduce((s, i) => s + exportUnits(i) * (i.list_price_cents ?? 0), 0),
    costTotalCents: items.reduce((s, i) => s + exportUnits(i) * i.cost_cents, 0),
    sku: items.length === 1 ? (items[0]?.sku ?? '') : '',
    isbn: items.length === 1 ? (items[0]?.isbn ?? '') : '',
    storage: [...new Set(items.map((i) => i.storage_location).filter(Boolean))].join(', '),
  }
}

/** Turns items into export lines, optionally folding each set's volumes into one line. */
export function buildExportLines(items: readonly ExportItem[], groupSets: boolean): ExportLine[] {
  const sorted = sortExportItems(items)
  if (!groupSets) {
    return sorted.map((i) =>
      lineFor([i], i.name, i.volume_number === null ? '' : `Vol. ${i.volume_number}`),
    )
  }

  const lines: ExportLine[] = []
  const bySet = new Map<string, ExportItem[]>()
  for (const item of sorted) {
    if (item.template_id === null) continue
    const group = bySet.get(item.template_id)
    if (group) group.push(item)
    else bySet.set(item.template_id, [item])
  }
  const emitted = new Set<string>()
  // Walk the sorted list so sets and one-offs stay interleaved alphabetically.
  for (const item of sorted) {
    if (item.template_id === null) {
      lines.push(lineFor([item], item.name, ''))
      continue
    }
    if (emitted.has(item.template_id)) continue
    emitted.add(item.template_id)
    const group = bySet.get(item.template_id) ?? [item]
    const numbers = group.map((i) => i.volume_number).filter((n): n is number => n !== null)
    lines.push(
      lineFor(
        group,
        item.template_name ?? item.name,
        numbers.length ? `Vol. ${formatRanges(numbers)}` : '',
      ),
    )
  }
  return lines
}

export interface ExportTotals {
  lines: number
  units: number
  askingTotalCents: number
  costTotalCents: number
}

export function exportTotals(lines: readonly ExportLine[]): ExportTotals {
  return {
    lines: lines.length,
    units: lines.reduce((s, l) => s + l.units, 0),
    askingTotalCents: lines.reduce((s, l) => s + l.askingTotalCents, 0),
    costTotalCents: lines.reduce((s, l) => s + l.costTotalCents, 0),
  }
}

/** "$8.00", "$5.00 - $8.00", or "" when unpriced. */
export function formatPriceRange(line: Pick<ExportLine, 'priceMinCents' | 'priceMaxCents'>) {
  if (line.priceMinCents === null || line.priceMaxCents === null) return ''
  if (line.priceMinCents === line.priceMaxCents) return formatCents(line.priceMinCents)
  return `${formatCents(line.priceMinCents)} - ${formatCents(line.priceMaxCents)}`
}

/** Plain decimal dollars for spreadsheets: 1250 -> "12.50". */
function dollars(cents: number | null): string {
  return cents === null ? '' : (cents / 100).toFixed(2)
}

/** CSV columns for the chosen options (spreadsheet-friendly plain numbers). */
export function exportCsvColumns(options: StockExportOptions): CsvColumn<ExportLine>[] {
  const columns: CsvColumn<ExportLine>[] = [
    { header: 'Item', value: (l) => l.title },
    { header: 'Volumes', value: (l) => l.volumes },
    { header: 'Category', value: (l) => l.category },
    { header: 'Condition', value: (l) => l.condition },
    { header: 'Status', value: (l) => l.status },
    { header: 'Quantity', value: (l) => l.units },
  ]
  if (options.includePrices) {
    if (options.groupSets) {
      columns.push(
        { header: 'Lowest price', value: (l) => dollars(l.priceMinCents) },
        { header: 'Highest price', value: (l) => dollars(l.priceMaxCents) },
      )
    } else {
      columns.push({ header: 'Price', value: (l) => dollars(l.priceMinCents) })
    }
    columns.push({ header: 'Asking total', value: (l) => dollars(l.askingTotalCents) })
  }
  if (options.includeCosts) {
    columns.push(
      { header: 'Cost total', value: (l) => dollars(l.costTotalCents) },
      { header: 'Est. profit', value: (l) => dollars(l.askingTotalCents - l.costTotalCents) },
    )
  }
  if (!options.groupSets) {
    columns.push({ header: 'SKU', value: (l) => l.sku }, { header: 'ISBN', value: (l) => l.isbn })
  }
  if (options.includeCosts) columns.push({ header: 'Storage', value: (l) => l.storage })
  return columns
}

export interface PdfColumn {
  header: string
  align: 'left' | 'right'
  value: (line: ExportLine) => string
  /** Footer cell (totals row); "" when the column has no total. */
  total: (totals: ExportTotals) => string
}

/**
 * Columns for the PDF table. Status only shows when more than one status is
 * exported, and category only when the export isn't limited to one.
 */
export function exportPdfColumns(options: StockExportOptions): PdfColumn[] {
  const none = () => ''
  const columns: PdfColumn[] = [
    { header: 'Item', align: 'left', value: (l) => l.title, total: () => 'Total' },
    { header: 'Volumes', align: 'left', value: (l) => l.volumes, total: none },
  ]
  if (!options.category)
    columns.push({ header: 'Category', align: 'left', value: (l) => l.category, total: none })
  columns.push({ header: 'Condition', align: 'left', value: (l) => l.condition, total: none })
  if (options.statuses.length > 1)
    columns.push({ header: 'Status', align: 'left', value: (l) => l.status, total: none })
  columns.push({
    header: 'Qty',
    align: 'right',
    value: (l) => String(l.units),
    total: (t) => String(t.units),
  })
  if (options.includePrices) {
    columns.push(
      { header: 'Price each', align: 'right', value: formatPriceRange, total: none },
      {
        header: 'Total',
        align: 'right',
        value: (l) => (l.askingTotalCents ? formatCents(l.askingTotalCents) : ''),
        total: (t) => formatCents(t.askingTotalCents),
      },
    )
  }
  if (options.includeCosts) {
    columns.push(
      {
        header: 'Cost',
        align: 'right',
        value: (l) => formatCents(l.costTotalCents),
        total: (t) => formatCents(t.costTotalCents),
      },
      {
        header: 'Est. profit',
        align: 'right',
        value: (l) => formatCents(l.askingTotalCents - l.costTotalCents),
        total: (t) => formatCents(t.askingTotalCents - t.costTotalCents),
      },
    )
  }
  return columns
}

/** Short description of what the export covers, for the PDF subtitle. */
export function describeExport(options: StockExportOptions): string {
  const parts: string[] = []
  const statuses = itemStatuses.filter((s) => options.statuses.includes(s))
  const isAvailable =
    statuses.length === availableStatuses.length &&
    availableStatuses.every((s) => statuses.includes(s))
  parts.push(isAvailable ? 'Available now' : statuses.map((s) => statusLabels[s]).join(', '))
  if (options.category) parts.push(categoryLabels[options.category])
  if (options.kind === 'set') parts.push('Sets only')
  if (options.kind === 'one_off') parts.push('One-offs only')
  return parts.join(' · ')
}

export function exportFilename(format: ExportFormat, isoDate: string): string {
  return `stock-list-${isoDate}.${format}`
}

const PDF_REPLACEMENTS: [RegExp, string][] = [
  [/[‘’‚′]/g, "'"],
  [/[“”„″]/g, '"'],
  [/[‐‑‒–—―−]/g, '-'],
  [/…/g, '...'],
]

/**
 * The PDF uses the built-in Helvetica font, which only covers Latin-1. Swap common
 * punctuation for plain equivalents and anything else it can't draw for "?".
 */
export function pdfSafe(text: string): string {
  let out = text.normalize('NFKC')
  for (const [pattern, replacement] of PDF_REPLACEMENTS) out = out.replace(pattern, replacement)
  return out.replace(/[^\n\x20-\x7e\xa0-\xff]/g, '?')
}
