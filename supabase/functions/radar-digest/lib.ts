// Pure helpers for radar-digest (no Deno or network imports, so Vitest can test them).
import { z } from 'zod'

/** How many top-scoring series go into the digest, besides finish/avoid/watchlist ones. */
export const TOP_N = 25

export interface SeriesFacts {
  series_id: string
  name: string
  score: number
  action: 'buy' | 'hold' | 'finish_set' | 'avoid'
  components: Record<string, number>
  reasons: string[]
  missing_ranges: string
  performance: {
    units_on_hand: number
    units_sold: number
    avg_cost_cents: number | null
    avg_sale_cents: number | null
    avg_net_cents: number | null
    margin_pct: number | null
    median_days_to_sell: number | null
    sold_last_30d: number
    stale_count: number
    sample_size: number
  } | null
  /** Latest asking-price range per copy; "asking" prices are not sold prices. */
  prices: {
    source: string
    min_cents: number | null
    median_cents: number | null
    max_cents: number | null
    listing_count: number | null
  } | null
  watchlist: { max_buy_cents: number | null; note: string | null } | null
}

/** The series the digest looks at: top scores, every finish/avoid, and the watchlist. */
export function selectForDigest(all: SeriesFacts[], topN = TOP_N): SeriesFacts[] {
  const byScore = [...all].sort((a, b) => b.score - a.score)
  const picked = new Map<string, SeriesFacts>()
  for (const s of byScore.slice(0, topN)) picked.set(s.series_id, s)
  for (const s of all) {
    if (s.action === 'finish_set' || s.action === 'avoid' || s.watchlist) picked.set(s.series_id, s)
  }
  return [...picked.values()].sort((a, b) => b.score - a.score)
}

const Pick = z.object({
  series_id: z.string().min(1),
  why: z.string().min(1).max(600),
  suggested_max_cents: z.number().int().min(0).nullable(),
})
export type Pick = z.infer<typeof Pick>

export const Digest = z.object({
  buy: z.array(Pick).max(15),
  finish_sets: z.array(Pick).max(15),
  stop_buying: z.array(Pick).max(15),
  watch: z.array(Pick).max(15),
  notes: z.string().max(2000),
})
export type Digest = z.infer<typeof Digest>

export const SYSTEM_PROMPT = `You write the weekly buying list for Kura, a two-person manga resale business that buys used manga (often in lots) and resells it on eBay, Mercari, Facebook Marketplace and at events.

You get JSON describing manga series the business stocks or watches. Each has a nightly buy score (0-100) with an action (buy, hold, finish_set, avoid), the score's components (each 0-1, 0.5 is neutral or unknown), the reasons behind it, the business's own sales numbers for the series, current asking prices if any, missing volumes, and watchlist notes.

Rules:
- Use only the data provided. Do not use outside knowledge about a series' popularity, prices or anime.
- Every "why" must cite the specific numbers behind the pick (for example the score, units sold in 30 days, margin, stale copies, missing volumes, or popularity signals).
- Say plainly when the data is thin: sample_size is the number of units sold, and under 5 means our own sales say little.
- Never invent a price. suggested_max_cents must be null unless the series has avg_sale_cents or a price range in the data, and must not exceed what that data supports. Money is integer cents.
- Prices labelled as asking prices are what sellers ask, not what items sold for.
- finish_sets are series with only a few volumes missing; name the missing volumes.
- stop_buying is for series with stale stock or cooling interest.
- watch is for series worth keeping an eye on but not buying yet.
- Pick at most 8 per list. It is fine for a list to be empty.
- Use the series_id values exactly as given.

Reply with only a JSON object, no other text, in exactly this shape:
{"buy":[{"series_id":"...","why":"...","suggested_max_cents":null}],"finish_sets":[...],"stop_buying":[...],"watch":[...],"notes":"one or two sentences on the week overall"}`

export function userMessage(series: SeriesFacts[], today: string): string {
  return `Today is ${today}. Series data:\n${JSON.stringify(series)}`
}

/** Highest per-copy price the data supports for a series, or null when there's none. */
export function priceCeiling(s: SeriesFacts): number | null {
  const candidates = [s.performance?.avg_sale_cents ?? null, s.prices?.max_cents ?? null].filter(
    (n): n is number => n !== null && n > 0,
  )
  return candidates.length ? Math.max(...candidates) : null
}

/**
 * Drops picks for series that weren't in the input, and clears any suggested
 * price that the data doesn't support (no price basis, or above the ceiling).
 */
export function sanitizeDigest(d: Digest, input: SeriesFacts[]): Digest {
  const byId = new Map(input.map((s) => [s.series_id, s]))
  const clean = (list: Pick[]): Pick[] =>
    list
      .filter((p) => byId.has(p.series_id))
      .map((p) => {
        const ceiling = priceCeiling(byId.get(p.series_id)!)
        const ok =
          p.suggested_max_cents !== null && ceiling !== null && p.suggested_max_cents <= ceiling
        return { ...p, suggested_max_cents: ok ? p.suggested_max_cents : null }
      })
  return {
    buy: clean(d.buy),
    finish_sets: clean(d.finish_sets),
    stop_buying: clean(d.stop_buying),
    watch: clean(d.watch),
    notes: d.notes,
  }
}
