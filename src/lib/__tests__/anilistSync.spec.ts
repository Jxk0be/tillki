import { describe, expect, it } from 'vitest'
import {
  chunk,
  newYorkDate,
  normalizeTitle,
  pickMatch,
  retryDelayMs,
  searchTexts,
  titleSimilarity,
  toSnapshot,
  type AniListMedia,
} from '../../../supabase/functions/anilist-sync/lib'

function media(
  p: Partial<AniListMedia> & { id: number; english?: string; romaji?: string },
): AniListMedia {
  return {
    title: { english: p.english ?? null, romaji: p.romaji ?? null, native: null },
    synonyms: [],
    format: 'MANGA',
    status: 'FINISHED',
    volumes: null,
    trending: 0,
    popularity: 0,
    favourites: 0,
    meanScore: null,
    siteUrl: `https://anilist.co/manga/${p.id}`,
    relations: null,
    ...p,
  }
}

describe('normalizeTitle', () => {
  it('drops volume numbers, editions, brackets and punctuation', () => {
    expect(normalizeTitle('One Punch Man Vol 3')).toBe('one punch man')
    expect(normalizeTitle('One-Punch Man')).toBe('one punch man')
    expect(normalizeTitle('Berserk Deluxe Edition')).toBe('berserk')
    expect(normalizeTitle('Shaman King Omnibus')).toBe('shaman king')
    expect(normalizeTitle('Neon Genesis Evangelion 3-in-1 Edition')).toBe('neon genesis evangelion')
    expect(normalizeTitle('Alive (Hajime Taguchi)')).toBe('alive')
    expect(normalizeTitle('Monster: The Perfect Edition')).toBe('monster the')
  })

  it('treats a JoJo part the same with or without the part number', () => {
    expect(normalizeTitle("JoJo's Bizarre Adventure Part 4: Diamond Is Unbreakable")).toBe(
      normalizeTitle("JoJo's Bizarre Adventure: Part 4--Diamond is Unbreakable"),
    )
  })
})

describe('titleSimilarity', () => {
  it('is 1 for the same title written differently', () => {
    expect(titleSimilarity('One Punch Man Vol 3', 'One-Punch Man')).toBe(1)
  })

  it('understands initials', () => {
    expect(titleSimilarity('OPM', 'One Punch Man')).toBeGreaterThanOrEqual(0.9)
    expect(titleSimilarity('MHA', 'My Hero Academia')).toBeGreaterThanOrEqual(0.9)
  })

  it('is low for different series', () => {
    expect(titleSimilarity('Naruto', 'Boruto: Naruto Next Generations')).toBeLessThan(0.6)
    expect(titleSimilarity('Tokyo Ghoul', 'Tokyo Ghoul:re')).toBeLessThan(0.95)
  })
})

describe('pickMatch', () => {
  it('matches a clear winner', () => {
    const result = pickMatch('Berserk Deluxe Edition', [
      media({ id: 30002, english: 'Berserk', romaji: 'Berserk' }),
      media({ id: 1, english: 'Berserk: The Prototype' }),
    ])
    expect(result).toEqual({ kind: 'match', anilist_id: 30002, score: 1 })
  })

  it('matches on a synonym', () => {
    const result = pickMatch('JJK', [
      media({ id: 101517, romaji: 'Jujutsu Kaisen', synonyms: ['JJK'] }),
      media({ id: 2, english: 'Jujutsu Kaisen 0' }),
    ])
    expect(result.kind).toBe('match')
  })

  it('ignores a light novel or one-shot with the same title', () => {
    expect(
      pickMatch('Ao Haru Ride', [
        media({ id: 1, english: 'Ao Haru Ride', format: 'MANGA' }),
        media({ id: 2, english: 'Blue Spring Ride', synonyms: ['Ao Haru Ride'], format: 'NOVEL' }),
      ]),
    ).toMatchObject({ kind: 'match', anilist_id: 1 })
    expect(
      pickMatch('Tokyo Ghoul', [
        media({ id: 3, english: 'Tokyo Ghoul', format: 'ONE_SHOT', popularity: 900 }),
        media({ id: 4, english: 'Tokyo Ghoul', format: 'MANGA', popularity: 100 }),
      ]),
    ).toMatchObject({ kind: 'match', anilist_id: 4 })
  })

  it('picks the far more popular of two equal manga entries', () => {
    expect(
      pickMatch('One Punch Man', [
        media({ id: 5, english: 'One Punch Man', popularity: 1000 }),
        media({ id: 6, english: 'One-Punch Man', popularity: 90_000 }),
      ]),
    ).toMatchObject({ kind: 'match', anilist_id: 6 })
  })

  it('asks for review when two results are close', () => {
    const result = pickMatch('Tokyo Ghoul', [
      media({ id: 1, english: 'Tokyo Ghoul', popularity: 100 }),
      media({ id: 2, english: 'Tokyo Ghoul', popularity: 150 }),
    ])
    expect(result.kind).toBe('review')
  })

  it('asks for review when nothing is close, keeping the top 3', () => {
    const result = pickMatch('Rising Stars of Manga: United Kingdom and Ireland', [
      media({ id: 1, english: 'Rising Impact' }),
      media({ id: 2, english: 'Stars' }),
      media({ id: 3, english: 'Ireland' }),
      media({ id: 4, english: 'Kingdom' }),
    ])
    expect(result).toMatchObject({ kind: 'review', candidates: [{}, {}, {}] })
  })

  it('asks for review when there are no results', () => {
    expect(pickMatch('Pilgrim Jager', [])).toEqual({ kind: 'review', candidates: [] })
  })
})

describe('toSnapshot', () => {
  it('summarises anime adaptations', () => {
    const row = toSnapshot(
      media({
        id: 5,
        popularity: 1000,
        relations: {
          edges: [
            {
              relationType: 'ADAPTATION',
              node: { id: 10, type: 'ANIME', status: 'FINISHED', nextAiringEpisode: null },
            },
            {
              relationType: 'ADAPTATION',
              node: {
                id: 11,
                type: 'ANIME',
                status: 'RELEASING',
                nextAiringEpisode: { airingAt: 1_800_000_000 },
              },
            },
            {
              relationType: 'SEQUEL',
              node: { id: 12, type: 'ANIME', status: 'NOT_YET_RELEASED', nextAiringEpisode: null },
            },
            {
              relationType: 'SIDE_STORY',
              node: { id: 13, type: 'MANGA', status: 'RELEASING', nextAiringEpisode: null },
            },
          ],
        },
      }),
      '2026-10-19',
    )
    expect(row).toMatchObject({
      anilist_id: 5,
      captured_on: '2026-10-19',
      popularity: 1000,
      has_upcoming_anime: true,
      anime_airing: true,
      next_episode_at: new Date(1_800_000_000 * 1000).toISOString(),
    })
  })

  it('has no anime flags without relations', () => {
    expect(toSnapshot(media({ id: 6 }), '2026-10-19')).toMatchObject({
      has_upcoming_anime: false,
      anime_airing: false,
      next_episode_at: null,
    })
  })
})

describe('searchTexts', () => {
  it('keeps apostrophes and part numbers, then tries the part before a colon', () => {
    expect(searchTexts("JoJo's Bizarre Adventure Part 4: Diamond Is Unbreakable")).toEqual([
      "JoJo's Bizarre Adventure Part 4: Diamond Is Unbreakable",
      "JoJo's Bizarre Adventure Part 4",
    ])
    expect(searchTexts("Devil's Line")).toEqual(["Devil's Line"])
  })

  it('drops brackets, editions and volume numbers', () => {
    expect(searchTexts('Alive (Hajime Taguchi)')).toEqual(['Alive'])
    expect(searchTexts('Berserk Deluxe Edition')).toEqual(['Berserk'])
    expect(searchTexts('Neon Genesis Evangelion 3-in-1 Edition')).toEqual([
      'Neon Genesis Evangelion',
    ])
    expect(searchTexts('Monster: The Perfect Edition')).toEqual(['Monster: The', 'Monster'])
    expect(searchTexts('One Punch Man Vol 3')).toEqual(['One Punch Man'])
  })
})

describe('helpers', () => {
  it('uses the New York date', () => {
    expect(newYorkDate(new Date('2026-10-20T03:00:00Z'))).toBe('2026-10-19')
  })

  it('chunks lists', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('retries 429 with Retry-After and 5xx twice', () => {
    expect(retryDelayMs(429, '30', 0)).toBe(30_000)
    expect(retryDelayMs(429, null, 0)).toBe(60_000)
    expect(retryDelayMs(429, null, 3)).toBeNull()
    expect(retryDelayMs(502, null, 0)).toBe(2000)
    expect(retryDelayMs(502, null, 1)).toBe(4000)
    expect(retryDelayMs(502, null, 2)).toBeNull()
    expect(retryDelayMs(400, null, 0)).toBeNull()
  })
})
