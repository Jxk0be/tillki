export type CsvValue = string | number | boolean | null | undefined

export interface CsvColumn<T> {
  header: string
  value: (row: T) => CsvValue
}

function escapeCell(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  // Quote when needed; double any quotes inside. Guard against spreadsheet
  // formula injection for text that starts with = + - @.
  const safe = /^[=+\-@]/.test(text) && typeof value === 'string' ? `'${text}` : text
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** Builds CSV text (CRLF line endings, header row first). */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [columns.map((c) => escapeCell(c.header)).join(',')]
  for (const row of rows) lines.push(columns.map((c) => escapeCell(c.value(row))).join(','))
  return lines.join('\r\n') + '\r\n'
}

/** Saves CSV text as a file in the browser. */
export function downloadCsv(filename: string, csv: string) {
  // BOM so Excel opens UTF-8 (e.g. Japanese titles) correctly.
  downloadBlob(filename, new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }))
}

/** Saves any file (CSV, PDF...) in the browser. */
export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
