import {
  exportPdfColumns,
  exportTotals,
  pdfSafe,
  type ExportLine,
  type StockExportOptions,
} from './stockExport'

/**
 * Draws the stock list as a PDF. jsPDF is loaded on demand so it stays out of
 * the main bundle.
 */
export async function buildStockPdf(
  lines: readonly ExportLine[],
  options: StockExportOptions,
  meta: { title: string; subtitle: string; date: string },
): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const columns = exportPdfColumns(options)
  const totals = exportTotals(lines)
  const doc = new jsPDF({
    orientation: columns.length > 7 ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'letter',
  })
  const margin = 40
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(pdfSafe(meta.title), margin, margin + 8)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(90)
  doc.text(pdfSafe(`${meta.subtitle} · ${meta.date}`), margin, margin + 26)

  const align = Object.fromEntries(columns.map((c, i) => [i, { halign: c.align }]))
  autoTable(doc, {
    startY: margin + 40,
    margin: { left: margin, right: margin, bottom: margin + 10 },
    theme: 'striped',
    head: [columns.map((c) => c.header)],
    body: lines.map((l) => columns.map((c) => pdfSafe(c.value(l)))),
    foot: lines.length > 1 ? [columns.map((c) => c.total(totals))] : undefined,
    showFoot: 'lastPage',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 4, overflow: 'linebreak' },
    bodyStyles: { textColor: 30 },
    headStyles: { fillColor: [33, 33, 33], textColor: 255 },
    footStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: 'bold' },
    columnStyles: { ...align, 0: { ...align[0], fontStyle: 'bold' } },
    didParseCell: (data) => {
      // Header and footer cells follow their column's alignment too.
      const column = columns[data.column.index]
      if (column && data.section !== 'body') data.cell.styles.halign = column.align
    },
    didDrawPage: () => {
      doc.setFontSize(8)
      doc.setTextColor(120)
      doc.text(
        `Page ${doc.getCurrentPageInfo().pageNumber}`,
        pageWidth - margin,
        pageHeight - margin / 2,
        { align: 'right' },
      )
    },
  })

  if (lines.length === 0) {
    doc.setFontSize(11)
    doc.setTextColor(90)
    doc.text('Nothing matches these filters.', margin, margin + 80)
  }
  return doc.output('blob')
}
