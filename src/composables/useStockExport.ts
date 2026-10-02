import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { downloadBlob, downloadCsv, toCsv } from '@/lib/csv'
import { formatDate, todayIso } from '@/lib/dates'
import {
  buildExportLines,
  describeExport,
  exportColumns,
  exportCsvColumns,
  exportFilename,
  type ExportItem,
  type StockExportOptions,
} from '@/lib/stockExport'

/** PostgREST returns at most 1000 rows per request; bigger reads are fetched in chunks. */
const CHUNK = 1000

/** Non-archived items matching the export options. */
function exportQuery<Columns extends string>(
  columns: Columns,
  options: StockExportOptions,
  head = false,
) {
  let query = supabase
    .from('v_items')
    .select(columns, head ? { count: 'exact', head: true } : undefined)
    .is('archived_at', null)
    .in('status', options.statuses)
  if (options.kind === 'set') query = query.not('template_id', 'is', null)
  if (options.kind === 'one_off') query = query.is('template_id', null)
  if (options.category) query = query.eq('category', options.category)
  return query
}

/** Builds the stock list as a CSV or PDF and downloads it. */
export function useStockExport() {
  const exporting = ref(false)

  /** How many items the options match (null if the count failed). */
  async function count(options: StockExportOptions): Promise<number | null> {
    if (options.statuses.length === 0) return 0
    const { count: n, error } = await exportQuery('id', options, true)
    return error ? null : (n ?? 0)
  }

  async function fetchItems(options: StockExportOptions): Promise<ExportItem[]> {
    const rows: ExportItem[] = []
    for (let from = 0; ; from += CHUNK) {
      const { data, error } = await exportQuery(exportColumns, options)
        .order('id')
        .range(from, from + CHUNK - 1)
      if (error) throw error
      for (const r of data ?? []) {
        rows.push({
          id: r.id ?? '',
          sku: r.sku ?? '',
          name: r.name ?? '',
          template_id: r.template_id,
          template_name: r.template_name,
          volume_number: r.volume_number,
          category: r.category ?? 'other',
          condition: r.condition,
          status: r.status ?? 'in_stock',
          quantity: r.quantity ?? 0,
          units_left: r.units_left ?? 0,
          units_sold: r.units_sold ?? 0,
          cost_cents: r.cost_cents ?? 0,
          list_price_cents: r.list_price_cents,
          isbn: r.isbn,
          storage_location: r.storage_location,
        })
      }
      if (!data || data.length < CHUNK) break
    }
    return rows
  }

  /** Returns the number of lines exported. Throws if loading fails. */
  async function exportStock(options: StockExportOptions): Promise<number> {
    exporting.value = true
    try {
      const lines = buildExportLines(await fetchItems(options), options.groupSets)
      const today = todayIso()
      const filename = exportFilename(options.format, today)
      if (options.format === 'csv') {
        downloadCsv(filename, toCsv(lines, exportCsvColumns(options)))
      } else {
        const { buildStockPdf } = await import('@/lib/stockPdf')
        const blob = await buildStockPdf(lines, options, {
          title: 'Stock list',
          subtitle: describeExport(options),
          date: formatDate(today),
        })
        downloadBlob(filename, blob)
      }
      return lines.length
    } finally {
      exporting.value = false
    }
  }

  return { exporting, count, exportStock }
}
