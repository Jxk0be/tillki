import { describe, expect, it } from 'vitest'
import {
  describeMerge,
  renderTitle,
  shoppingList,
  shoppingListLine,
  splitEvenly,
  summarizeAddVolumes,
} from '../sets'

describe('renderTitle', () => {
  it('fills in the name and volume number', () => {
    expect(renderTitle('{name} Volume {n}', 'One Piece', 3)).toBe('One Piece Volume 3')
    expect(renderTitle('{name} Vol. {nn}', 'One Piece', 3)).toBe('One Piece Vol. 03')
    expect(renderTitle('{name} #{n}', 'Akira', 12)).toBe('Akira #12')
  })

  it('pads only {nn}, and leaves 3-digit numbers alone', () => {
    expect(renderTitle('{n}/{nn}', 'x', 105)).toBe('105/105')
  })
})

describe('splitEvenly', () => {
  it('adds up exactly', () => {
    for (const [total, copies] of [
      [9000, 30],
      [1000, 3],
      [1001, 8],
      [5, 7],
      [0, 4],
    ] as const) {
      const parts = splitEvenly(total, copies)
      expect(parts).toHaveLength(copies)
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total)
      expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1)
    }
  })

  it('gives $3.00 each for $90 across 30 volumes', () => {
    expect(new Set(splitEvenly(9000, 30))).toEqual(new Set([300]))
  })

  it('puts the leftover cents on the last copies', () => {
    expect(splitEvenly(1000, 3)).toEqual([333, 333, 334])
  })
})

describe('summarizeAddVolumes', () => {
  const owned = new Set([3, 4, 5, 18, 19, 20])

  it('separates new volumes from extra copies', () => {
    const selection = Array.from({ length: 25 }, (_, i) => ({ volume: i + 1, quantity: 1 }))
    const summary = summarizeAddVolumes(selection, owned)
    expect(summary.books).toBe(25)
    expect(summary.newVolumes).toHaveLength(19)
    expect(summary.mergedVolumes).toEqual([3, 4, 5, 18, 19, 20])
    expect(summary.extraCopies).toBe(6)
    expect(describeMerge(summary)).toBe('19 new volumes, plus another copy of 3-5, 18-20')
  })

  it('counts a volume bought twice in the same haul', () => {
    const summary = summarizeAddVolumes(
      [
        { volume: 1, quantity: 2 },
        { volume: 3, quantity: 1 },
      ],
      owned,
    )
    expect(summary).toEqual({ books: 3, newVolumes: [1], mergedVolumes: [3], extraCopies: 2 })
  })

  it('describes merge-only and new-only batches', () => {
    expect(describeMerge(summarizeAddVolumes([{ volume: 3, quantity: 1 }], owned))).toBe(
      'another copy of 3',
    )
    expect(describeMerge(summarizeAddVolumes([{ volume: 1, quantity: 1 }], owned))).toBe(
      '1 new volume',
    )
  })
})

describe('shopping list', () => {
  const onePiece = {
    name: 'One Piece',
    publisher: 'VIZ Media',
    language: 'English',
    missing_ranges: '1-2, 21-32',
    total_volumes: 32,
    is_ongoing: false,
    owned_ranges: '3-20',
  }

  it('writes a readable line', () => {
    expect(shoppingListLine(onePiece)).toBe('One Piece (VIZ Media, English): need 1-2, 21-32')
  })

  it('mentions that an unknown or ongoing series may continue', () => {
    expect(
      shoppingListLine({
        ...onePiece,
        name: 'Chainsaw Man',
        total_volumes: null,
        is_ongoing: true,
        missing_ranges: '9',
        owned_ranges: '1-8, 10-12',
      }),
    ).toBe('Chainsaw Man (VIZ Media, English): need 9 (have 1-8, 10-12; series may continue)')
  })

  it('skips complete sets and joins the rest', () => {
    const complete = { ...onePiece, name: 'Death Note', total_volumes: 12, missing_ranges: '' }
    expect(shoppingListLine(complete)).toBeNull()
    expect(
      shoppingList([onePiece, complete, { ...onePiece, name: 'Naruto', publisher: null }]),
    ).toBe('One Piece (VIZ Media, English): need 1-2, 21-32\nNaruto (English): need 1-2, 21-32')
  })
})
