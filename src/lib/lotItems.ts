import type { ItemCategory, ItemCondition } from '@/types/inventory'

/** One batch of copies of an item, and the lot it came in (if any). */
export interface CandidateAcquisition {
  lot_id: string | null
  lot_name: string | null
  quantity: number
}

/** An inventory item offered in the lot sheet's item picker. */
export interface LotCandidate {
  id: string
  sku: string
  name: string
  series: string | null
  category: ItemCategory
  condition: ItemCondition | null
  acquisitions: CandidateAcquisition[]
}

export type LotCandidateFilter = 'manga' | 'all' | 'selected'

export function copiesOf(c: LotCandidate): number {
  return c.acquisitions.reduce((s, a) => s + a.quantity, 0)
}

/** Ids of the items with at least one copy in this lot. */
export function itemsInLot(candidates: LotCandidate[], lotId: string | null): Set<string> {
  if (!lotId) return new Set()
  return new Set(
    candidates.filter((c) => c.acquisitions.some((a) => a.lot_id === lotId)).map((c) => c.id),
  )
}

/** Names of the other lots an item's copies currently belong to. */
export function otherLotNames(c: LotCandidate, lotId: string | null): string[] {
  const names = c.acquisitions
    .filter((a) => a.lot_id && a.lot_id !== lotId)
    .map((a) => a.lot_name ?? 'another lot')
  return [...new Set(names)]
}

/** Search, filter and sort the picker rows. Volumes sort numerically ("Vol 2" before "Vol 10"). */
export function filterLotCandidates(
  candidates: LotCandidate[],
  query: string,
  filter: LotCandidateFilter,
  selected: ReadonlySet<string>,
): LotCandidate[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return candidates
    .filter((c) => {
      if (filter === 'manga' && c.category !== 'manga') return false
      if (filter === 'selected' && !selected.has(c.id)) return false
      if (words.length === 0) return true
      const text = `${c.name} ${c.sku} ${c.series ?? ''}`.toLowerCase()
      return words.every((w) => text.includes(w))
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
}

/** Which items to move into the lot and which to take out of it. */
export function lotMembershipChanges(
  before: ReadonlySet<string>,
  after: ReadonlySet<string>,
): { add: string[]; remove: string[] } {
  return {
    add: [...after].filter((id) => !before.has(id)),
    remove: [...before].filter((id) => !after.has(id)),
  }
}
