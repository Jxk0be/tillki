import { describe, expect, it } from 'vitest'
import {
  buildRadarRows,
  formatChange,
  isStale,
  matchState,
  parseAniListId,
  type RadarSet,
  type RadarSnapshot,
} from '../radar'

function set(p: Partial<RadarSet> & { id: string; name: string }): RadarSet {
  return {
    anilist_id: null,
    anilist_match: null,
    anilist_candidates: null,
    volumes_owned: 1,
    units_in_stock: 1,
    total_volumes: null,
    missing_count: 0,
    missing_ranges: '',
    ...p,
  }
}

function snap(
  anilist_id: number,
  captured_on: string,
  popularity: number,
  trending = 0,
): RadarSnapshot {
  return {
    anilist_id,
    captured_on,
    trending,
    popularity,
    favourites: 0,
    mean_score: null,
    status: 'RELEASING',
    has_upcoming_anime: false,
    anime_airing: false,
    next_episode_at: null,
  }
}

describe('matchState', () => {
  it('covers every state', () => {
    expect(matchState({ anilist_id: 1, anilist_match: 'auto', anilist_candidates: null })).toBe(
      'matched',
    )
    expect(matchState({ anilist_id: null, anilist_match: 'none', anilist_candidates: null })).toBe(
      'none',
    )
    expect(matchState({ anilist_id: null, anilist_match: null, anilist_candidates: [] })).toBe(
      'review',
    )
    expect(matchState({ anilist_id: null, anilist_match: null, anilist_candidates: null })).toBe(
      'pending',
    )
  })
})

describe('buildRadarRows', () => {
  const sets = [
    set({ id: 'a', name: 'Cold Series', anilist_id: 1 }),
    set({ id: 'b', name: 'Hot Series', anilist_id: 2 }),
    set({ id: 'c', name: 'Unmatched', anilist_candidates: [] }),
    set({ id: 'd', name: 'Not on AniList', anilist_match: 'none' }),
    set({ id: 'e', name: 'No data yet', anilist_id: 3 }),
    set({ id: 'f', name: 'Deluxe of Hot', anilist_id: 2 }),
  ]
  const snapshots = [
    snap(1, '2026-09-01', 100, 1),
    snap(1, '2026-10-12', 150, 1),
    snap(1, '2026-10-19', 160, 1),
    snap(2, '2026-10-19', 500, 40),
  ]
  const rows = buildRadarRows(sets, snapshots)

  it('ranks trending series first, then unmatched, then not on AniList', () => {
    expect(rows.map((r) => r.id)).toEqual(['f', 'b', 'a', 'e', 'c', 'd'])
  })

  it('works out popularity change over 7 and 30 days', () => {
    const cold = rows.find((r) => r.id === 'a')!
    expect(cold.popularity7d).toBe(10)
    expect(cold.popularity30d).toBe(60)
    expect(cold.historyDays).toBe(3)
  })

  it('has no change until there is enough history', () => {
    const hot = rows.find((r) => r.id === 'b')!
    expect(hot.latest?.popularity).toBe(500)
    expect(hot.popularity7d).toBeNull()
    expect(rows.find((r) => r.id === 'e')!.latest).toBeNull()
  })

  it('lets two sets share one AniList series', () => {
    expect(rows.find((r) => r.id === 'f')!.latest?.popularity).toBe(500)
  })
})

describe('scores', () => {
  it('ranks scored sets by score, using the newest score per set', () => {
    const rows = buildRadarRows(
      [
        set({ id: 'a', name: 'A', anilist_id: 1 }),
        set({ id: 'b', name: 'B' }),
        set({ id: 'c', name: 'C', anilist_id: 2 }),
      ],
      [snap(1, '2026-10-19', 100, 90)],
      [
        { template_id: 'b', scored_on: '2026-10-18', total: 10, action: 'hold', reasons: [] },
        { template_id: 'b', scored_on: '2026-10-19', total: 80, action: 'buy', reasons: ['x'] },
        { template_id: 'a', scored_on: '2026-10-19', total: 55, action: 'hold', reasons: [] },
      ],
    )
    expect(rows.map((r) => r.id)).toEqual(['b', 'a', 'c'])
    expect(rows[0]!.score?.action).toBe('buy')
    expect(rows[2]!.score).toBeNull()
  })
})

describe('parseAniListId', () => {
  it('reads links and bare ids', () => {
    expect(parseAniListId('https://anilist.co/manga/30002/Berserk/')).toBe(30002)
    expect(parseAniListId('anilist.co/manga/101517')).toBe(101517)
    expect(parseAniListId(' 42 ')).toBe(42)
  })

  it('rejects anime links and junk', () => {
    expect(parseAniListId('https://anilist.co/anime/21/One-Piece')).toBeNull()
    expect(parseAniListId('berserk')).toBeNull()
    expect(parseAniListId('0')).toBeNull()
  })
})

describe('formatting', () => {
  it('formats changes with signs', () => {
    expect(formatChange(1240)).toBe('+1,240')
    expect(formatChange(-35)).toBe('−35')
    expect(formatChange(0)).toBe('0')
  })

  it('flags runs older than 36 hours', () => {
    const now = new Date('2026-10-19T12:00:00Z')
    expect(isStale('2026-10-19T00:00:00Z', now)).toBe(false)
    expect(isStale('2026-10-17T12:00:00Z', now)).toBe(true)
    expect(isStale(null, now)).toBe(true)
  })
})
