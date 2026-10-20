// Pure helpers for radar-discover (no Deno or network imports, so Vitest can test them).
import { z } from 'zod'

export const PER_PAGE = 50

export const RequestBody = z.object({
  sort: z.enum(['trending', 'popular', 'new']).default('trending'),
  include_manhwa: z.boolean().default(false),
  page: z.number().int().min(1).max(10).default(1),
})
export type DiscoverRequest = z.infer<typeof RequestBody>

const SORTS: Record<DiscoverRequest['sort'], string> = {
  trending: 'TRENDING_DESC',
  popular: 'POPULARITY_DESC',
  new: 'START_DATE_DESC',
}

/** AniList's trending manga, without adult titles. "new" is recent series sorted by trending. */
export function discoverQuery(req: DiscoverRequest): {
  query: string
  variables: Record<string, unknown>
} {
  const country = req.include_manhwa ? '' : ', countryOfOrigin: "JP"'
  // Written into the query, not passed as a variable: GraphQL rejects declared
  // variables that a query doesn't use, and only "new" uses the date.
  const recent =
    req.sort === 'new'
      ? `, startDate_greater: ${twoYearsAgo()}, status_in: [RELEASING, NOT_YET_RELEASED]`
      : ''
  const sort = req.sort === 'new' ? 'TRENDING_DESC' : SORTS[req.sort]
  return {
    query: `
query ($page: Int) {
  Page(page: $page, perPage: ${PER_PAGE}) {
    pageInfo { hasNextPage }
    media(type: MANGA, isAdult: false, format_in: [MANGA, ONE_SHOT], sort: [${sort}]${country}${recent}) {
      id
      title { romaji english }
      coverImage { medium }
      format
      status
      volumes
      countryOfOrigin
      trending
      popularity
      meanScore
      genres
      startDate { year }
      siteUrl
      relations { edges { node { type status } } }
    }
  }
}`,
    variables: { page: req.page },
  }
}

function twoYearsAgo(now = new Date()): number {
  return (now.getUTCFullYear() - 2) * 10000 + 101
}

export interface DiscoverMedia {
  id: number
  title: { romaji: string | null; english: string | null }
  coverImage: { medium: string | null } | null
  format: string | null
  status: string | null
  volumes: number | null
  countryOfOrigin: string | null
  trending: number | null
  popularity: number | null
  meanScore: number | null
  genres: string[] | null
  startDate: { year: number | null } | null
  siteUrl: string | null
  relations: { edges: { node: { type: string | null; status: string | null } | null }[] } | null
}

export interface DiscoverItem {
  anilist_id: number
  title: string
  /** The romaji title when it differs from the English one. */
  alt_title: string | null
  cover_url: string | null
  status: string | null
  volumes: number | null
  country: string | null
  trending: number
  popularity: number
  mean_score: number | null
  genres: string[]
  start_year: number | null
  url: string
  anime_upcoming: boolean
  anime_airing: boolean
  /** Our set for this series, if we already have one. */
  template_id: string | null
}

/** Only AniList's own image host, so the page never loads images from elsewhere. */
function safeCover(url: string | null | undefined): string | null {
  return url && url.startsWith('https://s4.anilist.co/') ? url : null
}

export function toItem(m: DiscoverMedia, owned: ReadonlyMap<number, string>): DiscoverItem {
  const anime = (m.relations?.edges ?? [])
    .map((e) => e.node)
    .filter((n): n is NonNullable<typeof n> => !!n && n.type === 'ANIME')
  const english = m.title.english?.trim() || null
  const romaji = m.title.romaji?.trim() || null
  return {
    anilist_id: m.id,
    title: english ?? romaji ?? `AniList ${m.id}`,
    alt_title: english && romaji && romaji !== english ? romaji : null,
    cover_url: safeCover(m.coverImage?.medium),
    status: m.status,
    volumes: m.volumes,
    country: m.countryOfOrigin,
    trending: m.trending ?? 0,
    popularity: m.popularity ?? 0,
    mean_score: m.meanScore,
    genres: (m.genres ?? []).slice(0, 4),
    start_year: m.startDate?.year ?? null,
    url: m.siteUrl ?? `https://anilist.co/manga/${m.id}`,
    anime_upcoming: anime.some((n) => n.status === 'NOT_YET_RELEASED'),
    anime_airing: anime.some((n) => n.status === 'RELEASING'),
    template_id: owned.get(m.id) ?? null,
  }
}
