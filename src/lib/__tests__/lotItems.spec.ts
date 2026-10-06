import { describe, expect, it } from 'vitest'
import {
  copiesOf,
  filterLotCandidates,
  itemsInLot,
  lotMembershipChanges,
  otherLotNames,
  type LotCandidate,
} from '../lotItems'

function candidate(p: Partial<LotCandidate> & { id: string; name: string }): LotCandidate {
  return {
    sku: `MG-${p.id}`,
    series: null,
    category: 'manga',
    condition: null,
    acquisitions: [],
    ...p,
  }
}

const rows: LotCandidate[] = [
  candidate({
    id: '1',
    name: 'Naruto Volume 10',
    series: 'Naruto',
    acquisitions: [{ lot_id: 'A', lot_name: 'Lot A', quantity: 1 }],
  }),
  candidate({
    id: '2',
    name: 'Naruto Volume 2',
    series: 'Naruto',
    acquisitions: [
      { lot_id: null, lot_name: null, quantity: 1 },
      { lot_id: 'B', lot_name: 'Lot B', quantity: 2 },
    ],
  }),
  candidate({ id: '3', name: 'Luffy figure', category: 'figure' }),
]

describe('itemsInLot', () => {
  it('finds items with any copy in the lot', () => {
    expect([...itemsInLot(rows, 'A')]).toEqual(['1'])
    expect([...itemsInLot(rows, 'B')]).toEqual(['2'])
  })

  it('is empty for a lot that does not exist yet', () => {
    expect(itemsInLot(rows, null).size).toBe(0)
  })
})

describe('otherLotNames and copiesOf', () => {
  it('lists the other lots, not this one', () => {
    expect(otherLotNames(rows[1]!, 'A')).toEqual(['Lot B'])
    expect(otherLotNames(rows[1]!, 'B')).toEqual([])
    expect(otherLotNames(rows[2]!, null)).toEqual([])
  })

  it('adds up copies across acquisitions', () => {
    expect(copiesOf(rows[1]!)).toBe(3)
    expect(copiesOf(rows[2]!)).toBe(0)
  })
})

describe('filterLotCandidates', () => {
  it('shows only manga by default filter and sorts volumes numerically', () => {
    expect(filterLotCandidates(rows, '', 'manga', new Set()).map((r) => r.id)).toEqual(['2', '1'])
  })

  it('shows everything with the all filter', () => {
    expect(filterLotCandidates(rows, '', 'all', new Set())).toHaveLength(3)
  })

  it('shows only selected rows with the selected filter', () => {
    expect(filterLotCandidates(rows, '', 'selected', new Set(['3'])).map((r) => r.id)).toEqual([
      '3',
    ])
  })

  it('matches every search word against name, sku and series', () => {
    expect(filterLotCandidates(rows, 'naruto 10', 'all', new Set()).map((r) => r.id)).toEqual(['1'])
    expect(filterLotCandidates(rows, 'mg-3', 'all', new Set()).map((r) => r.id)).toEqual(['3'])
  })
})

describe('lotMembershipChanges', () => {
  it('returns items to add and remove', () => {
    expect(lotMembershipChanges(new Set(['1', '2']), new Set(['2', '3']))).toEqual({
      add: ['3'],
      remove: ['1'],
    })
  })

  it('returns nothing when unchanged', () => {
    expect(lotMembershipChanges(new Set(['1']), new Set(['1']))).toEqual({ add: [], remove: [] })
  })
})
