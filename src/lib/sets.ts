import { formatRanges } from './volumes'

export const DEFAULT_TITLE_PATTERN = '{name} Volume {n}'

/**
 * "{name} Volume {n}" -> "One Piece Volume 3". {nn} is the 2-digit
 * zero-padded number. Mirrors the database's render_volume_title().
 */
export function renderTitle(pattern: string, name: string, volume: number): string {
  return pattern
    .split('{name}')
    .join(name)
    .split('{nn}')
    .join(String(volume).padStart(2, '0'))
    .split('{n}')
    .join(String(volume))
}

/**
 * Splits a total across copies the way the database does: everyone gets the
 * floor, and the leftover cents go one each to the last copies. Always sums
 * exactly to the total.
 */
export function splitEvenly(totalCents: number, copies: number): number[] {
  if (copies <= 0) return []
  const base = Math.floor(totalCents / copies)
  const leftover = totalCents - base * copies
  return Array.from({ length: copies }, (_, i) => (i >= copies - leftover ? base + 1 : base))
}

export interface VolumeSelection {
  volume: number
  /** Copies being added for this volume (usually 1). */
  quantity: number
}

export interface AddVolumesSummary {
  /** Total books being added. */
  books: number
  newVolumes: number[]
  /** Volumes we already have a row for: their quantity goes up. */
  mergedVolumes: number[]
  /** Copies added on top of a first copy (merged volumes plus quantity 2+). */
  extraCopies: number
}

/** What a batch will do: new rows vs extra copies of volumes we already have. */
export function summarizeAddVolumes(
  selection: readonly VolumeSelection[],
  existing: ReadonlySet<number>,
): AddVolumesSummary {
  const newVolumes: number[] = []
  const mergedVolumes: number[] = []
  let books = 0
  let extraCopies = 0
  for (const { volume, quantity } of selection) {
    books += quantity
    if (existing.has(volume)) {
      mergedVolumes.push(volume)
      extraCopies += quantity
    } else {
      newVolumes.push(volume)
      extraCopies += quantity - 1
    }
  }
  return { books, newVolumes, mergedVolumes, extraCopies }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "22 new volumes, plus another copy of 3-5, 18-20" */
export function describeMerge(summary: AddVolumesSummary): string {
  const parts: string[] = []
  if (summary.newVolumes.length) parts.push(plural(summary.newVolumes.length, 'new volume'))
  if (summary.mergedVolumes.length) {
    const ranges = formatRanges(summary.mergedVolumes)
    parts.push(`${parts.length ? 'plus ' : ''}another copy of ${ranges}`)
  }
  return parts.join(', ')
}

export interface ShoppingListSet {
  name: string
  publisher: string | null
  language: string | null
  missing_ranges: string
  total_volumes: number | null
  is_ongoing: boolean
  owned_ranges: string
}

/** "One Piece (VIZ Media, English): need 1-2, 21-32" */
export function shoppingListLine(set: ShoppingListSet): string | null {
  const details = [set.publisher, set.language].filter(Boolean).join(', ')
  const label = details ? `${set.name} (${details})` : set.name
  const unknownTotal = set.total_volumes === null
  const tail =
    unknownTotal || set.is_ongoing
      ? ` (have ${set.owned_ranges || 'none'}; series may continue)`
      : ''
  if (set.missing_ranges) return `${label}: need ${set.missing_ranges}${tail}`
  if (unknownTotal || set.is_ongoing)
    return `${label}: no gaps, have ${set.owned_ranges}; check for newer volumes`
  return null
}

/** Every set with something to buy, one per line, for a store trip. */
export function shoppingList(sets: readonly ShoppingListSet[]): string {
  return sets
    .map(shoppingListLine)
    .filter((line): line is string => line !== null)
    .join('\n')
}
