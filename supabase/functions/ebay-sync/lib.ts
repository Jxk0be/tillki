// Pure helpers for ebay-sync (no Deno or network imports, so Vitest can test them).
import { normalizeTitle } from '../anilist-sync/lib.ts'

export const TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token'
export const BROWSE_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search'
export const SOLD_URL = 'https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search'
export const BROWSE_SCOPE = 'https://api.ebay.com/oauth/api_scope'
export const SOLD_SCOPE = 'https://api.ebay.com/oauth/api_scope/buy.marketplace.insights'
/** Sets priced per night: the watchlist plus this many top scores. */
export const TOP_SETS = 50
export const RESULTS_PER_SEARCH = 100

export type Scope = 'single' | 'set'

/** What we search eBay for: the readable set name plus "manga" (and "lot" for sets). */
export function searchQuery(setName: string, scope: Scope): string {
  const base = setName
    .replace(/\((?:[^)]*)\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return scope === 'set' ? `${base} manga lot` : `${base} manga`
}

/** Listings that aren't an English print of the book itself. */
const NOT_THE_BOOK =
  /\b(japanese|chinese|korean|french|german|spanish|italian|portuguese|box only|empty box|dust jacket only|poster|figure|figurine|dvd|blu-?ray|funko|keychain|cards?|sticker|shirt|plush|cosplay|art ?book|novel|light novel|digital|ebook|pdf)\b/i
/** Signs a listing is more than one volume. */
const MULTI =
  /\b(lot|set|bundle|collection|complete|box ?set|bulk)\b|\b\d{1,3}\s*-\s*\d{1,3}\b|\bvol(?:ume)?s\b/i

/**
 * Whether a listing title is this series in the right scope: every significant
 * word of the set name appears, it isn't merch or another language, and single
 * scope excludes lots while set scope requires one.
 */
export function titleMatches(listingTitle: string, setName: string, scope: Scope): boolean {
  if (NOT_THE_BOOK.test(listingTitle)) return false
  const listing = ` ${normalizeTitle(listingTitle)} `
  const words = normalizeTitle(setName)
    .split(' ')
    .filter((w) => w.length > 1 && !['the', 'of', 'and', 'a', 'an', 'to'].includes(w))
  if (words.length === 0 || !words.every((w) => listing.includes(` ${w} `))) return false
  const multi = MULTI.test(listingTitle)
  return scope === 'set' ? multi : !multi
}

interface Money {
  value?: string
  currency?: string
}

export interface ListingSummary {
  title?: string
  price?: Money
  lastSoldPrice?: Money
  shippingOptions?: { shippingCost?: Money }[]
}

function cents(m: Money | undefined): number | null {
  if (!m?.value || (m.currency && m.currency !== 'USD')) return null
  const n = Number(m.value)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}

/** Item price plus the cheapest listed shipping, in cents (null for non-USD or missing prices). */
export function totalCents(item: ListingSummary): number | null {
  const price = cents(item.price ?? item.lastSoldPrice)
  if (price === null) return null
  const shipping = (item.shippingOptions ?? [])
    .map((o) => cents(o.shippingCost))
    .filter((c): c is number => c !== null)
  return price + (shipping.length ? Math.min(...shipping) : 0)
}

export interface PriceRange {
  min_cents: number
  median_cents: number
  max_cents: number
  listing_count: number
}

/** Min, median and max of the matching listings' totals, or null with none. */
export function summarize(totals: number[]): PriceRange | null {
  if (totals.length === 0) return null
  const sorted = [...totals].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
  return {
    min_cents: sorted[0]!,
    median_cents: median,
    max_cents: sorted[sorted.length - 1]!,
    listing_count: sorted.length,
  }
}

/** Matching listings for one set and scope, reduced to a price range. */
export function priceRange(
  items: ListingSummary[],
  setName: string,
  scope: Scope,
): PriceRange | null {
  return summarize(
    items
      .filter((i) => i.title && titleMatches(i.title, setName, scope))
      .map(totalCents)
      .filter((c): c is number => c !== null),
  )
}
