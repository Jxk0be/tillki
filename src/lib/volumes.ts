import type { ItemStatus } from '@/types/inventory'

/** Longest single range someone can type, e.g. "1-500". Guards against typos like "1-5000". */
export const MAX_RANGE_SIZE = 500

export interface ParsedVolumes {
  volumes: number[]
  errors: string[]
}

/**
 * Parses what someone types into a volumes field, like "1-12, 14, 16-30".
 * Returns sorted unique volume numbers plus readable errors for anything that
 * couldn't be understood. Reversed ranges ("30-1") are accepted.
 */
export function parseVolumeInput(input: string): ParsedVolumes {
  const volumes = new Set<number>()
  const errors: string[] = []

  const normalized = input.replace(/\s*[-–—]\s*/g, '-').trim()
  if (normalized === '') return { volumes: [], errors: [] }

  for (const token of normalized.split(/[\s,;]+/).filter(Boolean)) {
    const single = /^(\d+)$/.exec(token)
    const range = /^(\d+)-(\d+)$/.exec(token)

    if (single) {
      const n = Number(single[1])
      if (n < 1) errors.push('Volume numbers start at 1.')
      else volumes.add(n)
      continue
    }

    if (range) {
      const a = Number(range[1])
      const b = Number(range[2])
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      if (lo < 1) {
        errors.push('Volume numbers start at 1.')
      } else if (hi - lo + 1 > MAX_RANGE_SIZE) {
        errors.push(`"${token}" is more than ${MAX_RANGE_SIZE} volumes. Check for a typo.`)
      } else {
        for (let n = lo; n <= hi; n++) volumes.add(n)
      }
      continue
    }

    errors.push(`"${token}" isn't a volume number or range.`)
  }

  return {
    volumes: [...volumes].sort((x, y) => x - y),
    errors: [...new Set(errors)],
  }
}

/**
 * Compact ranges for display: [1,2,21,22,...,32] -> "1-2, 21-32".
 * Mirrors the database's format_volume_ranges().
 */
export function formatRanges(volumes: readonly number[]): string {
  const sorted = [...new Set(volumes.filter((n) => Number.isInteger(n)))].sort((x, y) => x - y)
  const runs: string[] = []
  let start: number | undefined
  let prev: number | undefined

  for (const n of sorted) {
    if (start === undefined || prev === undefined) {
      start = n
    } else if (n !== prev + 1) {
      runs.push(start === prev ? `${start}` : `${start}-${prev}`)
      start = n
    }
    prev = n
  }
  if (start !== undefined && prev !== undefined) {
    runs.push(start === prev ? `${start}` : `${start}-${prev}`)
  }
  return runs.join(', ')
}

export type VolumeState = 'owned' | 'sold' | 'kept' | 'written_off' | 'missing'

/** One cell of a set's volume strip (same shape as template_volume_status, plus the item id). */
export interface VolumeStatusRow {
  volume_number: number
  state: VolumeState
  status: ItemStatus | null
  quantity: number
  units_left: number
  item_id: string | null
}

export interface SetVolumeRow {
  id: string
  volume_number: number
  status: ItemStatus
  quantity: number
  units_left: number
  units_sold: number
}

/**
 * Builds strip rows from a set's (non-archived) volume rows: every number from 1
 * to the total, or to the highest volume we've had when the total is unknown.
 * Mirrors the database's template_volume_status().
 */
export function buildVolumeStatus(
  rows: readonly SetVolumeRow[],
  totalVolumes: number | null,
): VolumeStatusRow[] {
  const byVolume = new Map(rows.map((r) => [r.volume_number, r]))
  const highest = rows.reduce((max, r) => Math.max(max, r.volume_number), 0)
  const last = totalVolumes ?? highest
  const out: VolumeStatusRow[] = []

  for (let n = 1; n <= last; n++) {
    const row = byVolume.get(n)
    if (!row) {
      out.push({
        volume_number: n,
        state: 'missing',
        status: null,
        quantity: 0,
        units_left: 0,
        item_id: null,
      })
      continue
    }
    let state: VolumeState = 'missing'
    if (row.units_left > 0) state = 'owned'
    else if (row.units_sold > 0) state = 'sold'
    else if (row.status === 'kept' || row.status === 'written_off') state = row.status

    out.push({
      volume_number: n,
      state,
      status: row.status,
      quantity: row.quantity,
      units_left: row.units_left,
      item_id: row.id,
    })
  }
  return out
}
