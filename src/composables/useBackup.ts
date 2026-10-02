import { computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { toCsv, type CsvColumn } from '@/lib/csv'
import { todayIso } from '@/lib/dates'
import { useAppSettings } from './useAppSettings'
import type { Database } from '@/types/database'

type TableName = keyof Database['public']['Tables']

/** Every business table (the allowlist isn't readable from the app, by design). */
export const BACKUP_TABLES = [
  'items',
  'item_templates',
  'item_acquisitions',
  'item_images',
  'template_images',
  'lots',
  'sales',
  'expenses',
  'item_events',
  'inventory_snapshots',
  'app_settings',
  'chat_threads',
  'chat_messages',
  'ai_usage',
  'profiles',
] as const satisfies readonly TableName[]

const REMIND_AFTER_DAYS = 30

type Row = Record<string, unknown>

/** CSV with a column for every key seen in any row; objects and arrays as JSON text. */
export function rowsToCsv(rows: readonly Row[]): string {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  const columns: CsvColumn<Row>[] = keys.map((k) => ({
    header: k,
    value: (r) => {
      const v = r[k]
      if (v === null || v === undefined) return ''
      return typeof v === 'object' ? JSON.stringify(v) : (v as string | number | boolean)
    },
  }))
  return toCsv(rows, columns)
}

async function fetchTable(table: TableName): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...((data ?? []) as Row[]))
    if (!data || data.length < 1000) break
  }
  return rows
}

/** When the last full export happened, and whether it's time for another. */
export function useBackupStatus() {
  const settings = useAppSettings()
  const lastExportAt = computed(() => {
    const v = settings.values.value.last_export_at
    return typeof v === 'string' && v ? v : null
  })
  const daysSince = computed(() =>
    lastExportAt.value
      ? Math.floor((Date.now() - new Date(lastExportAt.value).getTime()) / 86_400_000)
      : null,
  )
  const due = computed(() => daysSince.value === null || daysSince.value > REMIND_AFTER_DAYS)
  return { lastExportAt, daysSince, due, ready: settings.ready }
}

/**
 * Downloads a zip with a CSV and a JSON file for every business table, including
 * photo and receipt storage paths, then records the time in app_settings.
 */
export async function exportEverything(onProgress?: (table: string) => void): Promise<number> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const stamp = todayIso()
  let total = 0
  for (const table of BACKUP_TABLES) {
    onProgress?.(table)
    const rows = await fetchTable(table)
    total += rows.length
    zip.file(`csv/${table}.csv`, '﻿' + rowsToCsv(rows))
    zip.file(`json/${table}.json`, JSON.stringify(rows, null, 2))
  }
  zip.file(
    'README.txt',
    [
      `Tillki export, ${stamp}.`,
      '',
      'One CSV (opens in Excel or Sheets) and one JSON file per table. Money columns are',
      'integer cents (divide by 100 for dollars). Photos and receipts are not inside this',
      'zip: item_images.storage_path and template_images.storage_path point into the',
      '"item-images" storage bucket and expenses.receipt_path into "receipts".',
    ].join('\r\n'),
  )
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `tillki-export-${stamp}.zip`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)

  await useAppSettings().save({ last_export_at: new Date().toISOString() })
  return total
}
