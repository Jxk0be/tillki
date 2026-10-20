// Pure helpers for anilist-sync (no Deno or network imports, so Vitest can test them).

export const ANILIST_URL = 'https://graphql.anilist.co'

/** Stay under 25 requests a minute: AniList documents 90 but sometimes drops to 30. */
export const REQUEST_SPACING_MS = 2500
/** Sets matched per run, so one run stays well inside the function's time limit. */
export const MAX_MATCHES_PER_RUN = 40
/** AniList's page size limit. */
export const SNAPSHOT_BATCH = 50
/** A match is saved automatically only at this similarity, and only if clearly ahead of the runner-up. */
export const AUTO_MATCH_SCORE = 0.9
export const AUTO_MATCH_LEAD = 0.1

// ----------------------------------------------------------------------------- GraphQL
const MEDIA_FIELDS = `
  id
  title { romaji english native }
  synonyms
  format
  status
  volumes
  trending
  popularity
  favourites
  meanScore
  siteUrl
  relations {
    edges {
      relationType
      node { id type status nextAiringEpisode { airingAt } }
    }
  }
`

export const SEARCH_QUERY = `
query ($search: String) {
  Page(perPage: 5) {
    media(search: $search, type: MANGA, sort: SEARCH_MATCH) { ${MEDIA_FIELDS} }
  }
}`

export const BATCH_QUERY = `
query ($ids: [Int]) {
  Page(perPage: ${SNAPSHOT_BATCH}) {
    media(id_in: $ids, type: MANGA) { ${MEDIA_FIELDS} }
  }
}`

export interface AniListMedia {
  id: number
  title: { romaji: string | null; english: string | null; native: string | null }
  synonyms: string[] | null
  format: string | null
  status: string | null
  volumes: number | null
  trending: number | null
  popularity: number | null
  favourites: number | null
  meanScore: number | null
  siteUrl: string | null
  relations: {
    edges: {
      relationType: string | null
      node: {
        id: number
        type: string | null
        status: string | null
        nextAiringEpisode: { airingAt: number } | null
      } | null
    }[]
  } | null
}

export interface PageResponse {
  data?: { Page?: { media?: (AniListMedia | null)[] | null } | null } | null
  errors?: { message: string; status?: number }[]
}

export function pageMedia(response: PageResponse): AniListMedia[] {
  return (response.data?.Page?.media ?? []).filter((m): m is AniListMedia => m !== null)
}

// ----------------------------------------------------------------------------- titles
/** Edition words that don't change which series it is ("Berserk Deluxe Edition" is Berserk). */
const EDITION_WORDS =
  /\b(deluxe|perfect|omnibus|collector'?s|complete|box\s*set|hardcover|paperback|edition|3\s*-?\s*in\s*-?\s*1|2\s*-?\s*in\s*-?\s*1|vizbig|fullmetal edition|manga)\b/g

/**
 * Lowercased title with volume numbers, edition words, brackets and punctuation
 * removed, so "One Punch Man Vol 3" and "One-Punch Man" compare equal.
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\((?:[^)]*)\)|\[(?:[^\]]*)\]/g, ' ')
    .replace(/\b(?:vol(?:ume)?|v|book|part)\.?\s*\d+(?:\s*-\s*\d+)?\b/g, ' ')
    .replace(EDITION_WORDS, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function bigrams(s: string): string[] {
  const t = s.replace(/ /g, '')
  const out: string[] = []
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2))
  return out
}

/** Dice similarity of character bigrams, 0..1, on normalized titles. */
export function titleSimilarity(a: string, b: string): number {
  const x = normalizeTitle(a)
  const y = normalizeTitle(b)
  if (!x || !y) return 0
  if (x === y) return 1
  // Abbreviations like "JJK" for "Jujutsu Kaisen".
  const initials = (s: string) =>
    s
      .split(' ')
      .map((w) => w[0])
      .join('')
  if (x.length >= 2 && !x.includes(' ') && initials(y) === x) return 0.95
  if (y.length >= 2 && !y.includes(' ') && initials(x) === y) return 0.95
  const bx = bigrams(x)
  const by = bigrams(y)
  if (bx.length === 0 || by.length === 0) return 0
  const counts = new Map<string, number>()
  for (const g of bx) counts.set(g, (counts.get(g) ?? 0) + 1)
  let shared = 0
  for (const g of by) {
    const n = counts.get(g) ?? 0
    if (n > 0) {
      shared++
      counts.set(g, n - 1)
    }
  }
  return (2 * shared) / (bx.length + by.length)
}

function namesOf(m: AniListMedia): string[] {
  return [m.title.english, m.title.romaji, ...(m.synonyms ?? [])].filter(
    (n): n is string => !!n && n.trim().length > 0,
  )
}

export interface Candidate {
  anilist_id: number
  title: string
  score: number
  format: string | null
  url: string | null
  popularity: number | null
}

/** Light novels and one-shots share titles with the manga we sell; never match them automatically. */
const NOT_OUR_FORMATS = new Set(['NOVEL', 'ONE_SHOT'])
/** Between two equally close manga entries, the far more popular one is the main series. */
export const POPULARITY_TIEBREAK = 3

/** Each search result's best similarity to the set name, best first. */
export function rankCandidates(setName: string, media: AniListMedia[]): Candidate[] {
  return media
    .map((m) => ({
      anilist_id: m.id,
      title: m.title.english ?? m.title.romaji ?? String(m.id),
      score: Math.max(0, ...namesOf(m).map((n) => titleSimilarity(setName, n))),
      format: m.format,
      url: m.siteUrl,
      popularity: m.popularity,
    }))
    .sort((a, b) => b.score - a.score || (b.popularity ?? 0) - (a.popularity ?? 0))
}

export type MatchResult =
  { kind: 'match'; anilist_id: number; score: number } | { kind: 'review'; candidates: Candidate[] }

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Picks a match only when it's clearly right: a close title that is either well
 * ahead of the next manga entry, or far more popular than an equally close one.
 * Otherwise returns the top 3 for review.
 */
export function pickMatch(setName: string, media: AniListMedia[]): MatchResult {
  const ranked = rankCandidates(setName, media)
  const manga = ranked.filter((c) => !NOT_OUR_FORMATS.has(c.format ?? ''))
  const [best, second] = manga
  if (best && best.score >= AUTO_MATCH_SCORE) {
    const clearLead = !second || best.score - second.score >= AUTO_MATCH_LEAD
    const muchMorePopular =
      !!second &&
      (best.popularity ?? 0) > 0 &&
      (best.popularity ?? 0) >= POPULARITY_TIEBREAK * (second.popularity ?? 0)
    if (clearLead || muchMorePopular)
      return { kind: 'match', anilist_id: best.anilist_id, score: round2(best.score) }
  }
  return {
    kind: 'review',
    candidates: (manga.length ? manga : ranked)
      .slice(0, 3)
      .map((c) => ({ ...c, score: round2(c.score) })),
  }
}

const EDITION_WORDS_CI = new RegExp(EDITION_WORDS.source, 'gi')

/**
 * What to search AniList for, in order: the readable set name without brackets,
 * edition words or volume numbers ("JoJo's Bizarre Adventure Part 4: Diamond Is
 * Unbreakable"), then the part before a colon ("JoJo's Bizarre Adventure") in case
 * the first finds nothing. Punctuation like apostrophes is kept; AniList's search
 * needs it.
 */
export function searchTexts(setName: string): string[] {
  const readable = setName
    .replace(/\((?:[^)]*)\)|\[(?:[^\]]*)\]/g, ' ')
    .replace(/\b(?:vol(?:ume)?|v|book)\.?\s*\d+(?:\s*-\s*\d+)?\b/gi, ' ')
    .replace(EDITION_WORDS_CI, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s:,–-]+$/, '')
    .trim()
  const first = readable || setName.trim()
  const beforeColon = first.split(':')[0]!.trim()
  return [...new Set([first, beforeColon].filter((t) => t.length >= 2))]
}

// ----------------------------------------------------------------------------- snapshots
export interface SnapshotRow {
  anilist_id: number
  captured_on: string
  trending: number | null
  popularity: number | null
  favourites: number | null
  mean_score: number | null
  status: string | null
  volumes: number | null
  has_upcoming_anime: boolean
  anime_airing: boolean
  next_episode_at: string | null
}

/** One day's snapshot row for a series, with its anime adaptations summarised. */
export function toSnapshot(m: AniListMedia, capturedOn: string): SnapshotRow {
  const anime = (m.relations?.edges ?? [])
    .map((e) => e.node)
    .filter((n): n is NonNullable<typeof n> => !!n && n.type === 'ANIME')
  const nextAiring = anime
    .map((n) => n.nextAiringEpisode?.airingAt)
    .filter((t): t is number => typeof t === 'number')
    .sort((a, b) => a - b)[0]
  return {
    anilist_id: m.id,
    captured_on: capturedOn,
    trending: m.trending,
    popularity: m.popularity,
    favourites: m.favourites,
    mean_score: m.meanScore,
    status: m.status,
    volumes: m.volumes,
    has_upcoming_anime: anime.some((n) => n.status === 'NOT_YET_RELEASED'),
    anime_airing: anime.some((n) => n.status === 'RELEASING'),
    next_episode_at: nextAiring ? new Date(nextAiring * 1000).toISOString() : null,
  }
}

/** Today's date in New York as YYYY-MM-DD, so a night's snapshot lands on one business day. */
export function newYorkDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/**
 * How long to wait before retrying a failed AniList request, or null to give up.
 * 429 honours Retry-After (default 60s); 5xx retries twice with backoff.
 */
export function retryDelayMs(
  status: number,
  retryAfter: string | null,
  attempt: number,
): number | null {
  if (status === 429) {
    if (attempt >= 3) return null
    const seconds = Number(retryAfter)
    return (Number.isFinite(seconds) && seconds > 0 ? seconds : 60) * 1000
  }
  if (status >= 500) return attempt < 2 ? 2000 * 2 ** attempt : null
  return null
}
