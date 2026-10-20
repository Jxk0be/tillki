import { describe, expect, it } from 'vitest'
import {
  RequestBody,
  discoverQuery,
  toItem,
  type DiscoverMedia,
} from '../../../supabase/functions/radar-discover/lib'

function media(p: Partial<DiscoverMedia> & { id: number }): DiscoverMedia {
  return {
    title: { english: null, romaji: null },
    coverImage: null,
    format: 'MANGA',
    status: 'RELEASING',
    volumes: null,
    countryOfOrigin: 'JP',
    trending: 10,
    popularity: 1000,
    meanScore: 80,
    genres: [],
    startDate: { year: 2024 },
    siteUrl: null,
    relations: null,
    ...p,
  }
}

describe('RequestBody', () => {
  it('defaults to page 1 of trending Japanese manga', () => {
    expect(RequestBody.parse({})).toEqual({ sort: 'trending', include_manhwa: false, page: 1 })
  })

  it('rejects unknown sorts and silly pages', () => {
    expect(RequestBody.safeParse({ sort: 'random' }).success).toBe(false)
    expect(RequestBody.safeParse({ page: 99 }).success).toBe(false)
  })
})

describe('discoverQuery', () => {
  it('excludes adult titles and limits to Japan unless manhwa is included', () => {
    const jp = discoverQuery(RequestBody.parse({})).query
    expect(jp).toContain('isAdult: false')
    expect(jp).toContain('countryOfOrigin: "JP"')
    expect(jp).toContain('TRENDING_DESC')
    expect(discoverQuery(RequestBody.parse({ include_manhwa: true })).query).not.toContain(
      'countryOfOrigin: "JP"',
    )
  })

  it('declares only variables the query uses (AniList rejects unused ones with a 400)', () => {
    for (const sort of ['trending', 'popular', 'new'] as const) {
      const { query, variables } = discoverQuery(RequestBody.parse({ sort }))
      for (const name of Object.keys(variables)) {
        const uses = query.split(`$${name}`).length - 1
        expect(uses, `$${name} in ${sort}`).toBeGreaterThanOrEqual(2) // declared and used
      }
      const declared = [...query.matchAll(/\$(\w+):/g)].map((m) => m[1])
      expect(declared.sort()).toEqual(Object.keys(variables).sort())
    }
  })

  it('limits "new" to recent, running series', () => {
    const q = discoverQuery(RequestBody.parse({ sort: 'new' })).query
    expect(q).toContain('startDate_greater')
    expect(q).toContain('RELEASING')
  })
})

describe('toItem', () => {
  it('prefers the English title and keeps the romaji as the alternate', () => {
    const item = toItem(
      media({ id: 1, title: { english: 'Frieren', romaji: 'Sousou no Frieren' } }),
      new Map(),
    )
    expect(item.title).toBe('Frieren')
    expect(item.alt_title).toBe('Sousou no Frieren')
    expect(item.url).toBe('https://anilist.co/manga/1')
  })

  it('marks anime and which series we already have', () => {
    const item = toItem(
      media({
        id: 2,
        relations: {
          edges: [
            { node: { type: 'ANIME', status: 'NOT_YET_RELEASED' } },
            { node: { type: 'MANGA', status: 'RELEASING' } },
          ],
        },
      }),
      new Map([[2, 'set-uuid']]),
    )
    expect(item.anime_upcoming).toBe(true)
    expect(item.anime_airing).toBe(false)
    expect(item.template_id).toBe('set-uuid')
  })

  it('only allows AniList cover images', () => {
    expect(
      toItem(
        media({ id: 3, coverImage: { medium: 'https://s4.anilist.co/file/x.jpg' } }),
        new Map(),
      ).cover_url,
    ).toBe('https://s4.anilist.co/file/x.jpg')
    expect(
      toItem(media({ id: 4, coverImage: { medium: 'https://evil.example/x.jpg' } }), new Map())
        .cover_url,
    ).toBeNull()
  })
})
