import { describe, expect, it } from 'vitest'
import { toCsv } from '../csv'
import {
  buildExportLines,
  defaultExportOptions,
  describeExport,
  exportCsvColumns,
  exportFilename,
  exportPdfColumns,
  exportTotals,
  exportUnits,
  formatPriceRange,
  pdfSafe,
  type ExportItem,
  type StockExportOptions,
} from '../stockExport'

function item(overrides: Partial<ExportItem>): ExportItem {
  return {
    id: 'id',
    sku: 'SKU',
    name: 'Thing',
    template_id: null,
    template_name: null,
    volume_number: null,
    category: 'manga',
    condition: 'good',
    status: 'in_stock',
    quantity: 1,
    units_left: 1,
    units_sold: 0,
    cost_cents: 300,
    list_price_cents: 800,
    isbn: null,
    storage_location: null,
    ...overrides,
  }
}

function vol(n: number, overrides: Partial<ExportItem> = {}): ExportItem {
  return item({
    id: `op-${n}`,
    sku: `OP-${n}`,
    name: `One Piece Volume ${n}`,
    template_id: 'op',
    template_name: 'One Piece',
    volume_number: n,
    ...overrides,
  })
}

const options = (o: Partial<StockExportOptions> = {}): StockExportOptions => ({
  ...defaultExportOptions,
  ...o,
})

describe('exportUnits', () => {
  it('counts copies on hand, or copies sold for sold items', () => {
    expect(exportUnits(item({ quantity: 3, units_left: 2, units_sold: 1 }))).toBe(2)
    expect(exportUnits(item({ status: 'sold', quantity: 2, units_left: 0, units_sold: 2 }))).toBe(2)
  })
})

describe('buildExportLines', () => {
  const items = [
    vol(3, { list_price_cents: 900 }),
    item({ id: 'akira', name: 'Akira Figure', category: 'figure', condition: 'new' }),
    vol(1),
    vol(2, { units_left: 2, quantity: 2, condition: 'like_new' }),
    vol(5, { list_price_cents: null }),
    item({ id: 'zz', name: 'Zelda Pin', category: 'merch', list_price_cents: 500 }),
  ]

  it('folds a set into one line with volume ranges, sorted with one-offs', () => {
    const lines = buildExportLines(items, true)
    expect(lines.map((l) => l.title)).toEqual(['Akira Figure', 'One Piece', 'Zelda Pin'])
    const op = lines[1]!
    expect(op.volumes).toBe('Vol. 1-3, 5')
    expect(op.units).toBe(5)
    expect(op.condition).toBe('Like new, Good')
    expect(op.priceMinCents).toBe(800)
    expect(op.priceMaxCents).toBe(900)
    // 800 + 2x800 + 900 + 0 (unpriced)
    expect(op.askingTotalCents).toBe(3300)
    expect(op.costTotalCents).toBe(1500)
    expect(op.sku).toBe('')
  })

  it('keeps one line per volume when not grouping', () => {
    const lines = buildExportLines(items, false)
    expect(lines.map((l) => l.title)).toEqual([
      'Akira Figure',
      'One Piece Volume 1',
      'One Piece Volume 2',
      'One Piece Volume 3',
      'One Piece Volume 5',
      'Zelda Pin',
    ])
    expect(lines[1]!.volumes).toBe('Vol. 1')
    expect(lines[1]!.sku).toBe('OP-1')
    expect(lines[0]!.volumes).toBe('')
  })

  it('lists every status present in a grouped set', () => {
    const [line] = buildExportLines([vol(1, { status: 'listed' }), vol(2)], true)
    expect(line!.status).toBe('In stock, Listed')
  })

  it('handles an empty export', () => {
    expect(buildExportLines([], true)).toEqual([])
    expect(exportTotals([])).toEqual({ lines: 0, units: 0, askingTotalCents: 0, costTotalCents: 0 })
  })
})

describe('formatPriceRange', () => {
  it('shows one price, a range, or nothing', () => {
    expect(formatPriceRange({ priceMinCents: 800, priceMaxCents: 800 })).toBe('$8.00')
    expect(formatPriceRange({ priceMinCents: 500, priceMaxCents: 1250 })).toBe('$5.00 - $12.50')
    expect(formatPriceRange({ priceMinCents: null, priceMaxCents: null })).toBe('')
  })
})

describe('exportCsvColumns', () => {
  const lines = buildExportLines([vol(1), vol(2)], true)

  it('leaves costs out by default', () => {
    const csv = toCsv(lines, exportCsvColumns(options()))
    expect(csv.split('\r\n')[0]).toBe(
      'Item,Volumes,Category,Condition,Status,Quantity,Lowest price,Highest price,Asking total',
    )
    expect(csv.split('\r\n')[1]).toBe('One Piece,Vol. 1-2,Manga,Good,In stock,2,8.00,8.00,16.00')
  })

  it('adds costs, SKU and ISBN when asked and not grouping', () => {
    const headers = exportCsvColumns(options({ includeCosts: true, groupSets: false })).map(
      (c) => c.header,
    )
    expect(headers).toContain('Cost total')
    expect(headers).toContain('Est. profit')
    expect(headers).toContain('SKU')
    expect(headers).toContain('Price')
    expect(headers).not.toContain('Lowest price')
  })

  it('drops prices when asked', () => {
    const headers = exportCsvColumns(options({ includePrices: false })).map((c) => c.header)
    expect(headers).not.toContain('Asking total')
  })
})

describe('exportPdfColumns', () => {
  it('hides status with one status and category when filtered to one', () => {
    const headers = exportPdfColumns(options({ statuses: ['sold'], category: 'manga' })).map(
      (c) => c.header,
    )
    expect(headers).toEqual(['Item', 'Volumes', 'Condition', 'Qty', 'Price each', 'Total'])
  })

  it('totals quantity and value in the footer', () => {
    const lines = buildExportLines([vol(1), vol(2)], true)
    const totals = exportTotals(lines)
    const cols = exportPdfColumns(options({ includeCosts: true }))
    expect(cols.map((c) => c.total(totals))).toEqual([
      'Total',
      '',
      '',
      '',
      '',
      '2',
      '',
      '$16.00',
      '$6.00',
      '$10.00',
    ])
  })
})

describe('describeExport', () => {
  it('names the preset and filters', () => {
    expect(describeExport(options())).toBe('Available now')
    expect(describeExport(options({ statuses: ['sold', 'in_stock'], category: 'figure' }))).toBe(
      'In stock, Sold · Figure',
    )
    expect(describeExport(options({ kind: 'set' }))).toBe('Available now · Sets only')
  })
})

describe('exportFilename', () => {
  it('uses the date and format', () => {
    expect(exportFilename('pdf', '2026-10-02')).toBe('stock-list-2026-10-02.pdf')
  })
})

describe('pdfSafe', () => {
  it('keeps Latin-1 and swaps fancy punctuation', () => {
    expect(pdfSafe('Pokémon “Café” – Vol. 1…')).toBe('Pokémon "Café" - Vol. 1...')
  })

  it('replaces characters the PDF font cannot draw', () => {
    expect(pdfSafe('ワンピース 1')).toBe('????? 1')
    expect(pdfSafe('ＡＢＣ')).toBe('ABC')
  })
})
