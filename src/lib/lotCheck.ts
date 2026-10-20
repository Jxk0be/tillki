/**
 * Buy Radar lot checker: should we buy this lot, and what's the most we should
 * pay? Pure math, judged on our own sales and any eBay prices we've collected.
 */
import { calculateMargin, type FeeRule } from './fees'
import type { RadarAction } from './radar'

/** Our own average needs this many sales before it beats an eBay asking price. */
export const OWN_SALES_TRUSTED = 3

export interface LotLine {
  template_id: string
  volumes: number[]
}

export interface LotSetContext {
  template_id: string
  name: string
  total_volumes: number | null
  /** Volume numbers with copies left in stock. */
  owned: number[]
  score: number | null
  action: RadarAction | null
  avg_sale_cents: number | null
  sample_size: number
  /** Median eBay asking price for a single volume, if collected. */
  ebay_median_cents: number | null
}

export type ResaleBasis = 'our sales' | 'eBay asking' | null

export interface LotSetResult {
  template_id: string
  name: string
  volumes: number[]
  duplicates: number[]
  fills_gaps: number[]
  completes_set: boolean
  score: number | null
  action: RadarAction | null
  unit_resale_cents: number | null
  basis: ResaleBasis
}

export type LotVerdict = 'good' | 'fair' | 'pass' | 'unknown'

export interface LotResult {
  sets: LotSetResult[]
  books: number
  priced_books: number
  expected_resale_cents: number
  expected_keep_cents: number
  profit_cents: number | null
  margin_percent: number | null
  max_price_cents: number | null
  verdict: LotVerdict
}

/** What one copy is likely to sell for, and where that number comes from. */
export function unitResale(ctx: LotSetContext): { cents: number | null; basis: ResaleBasis } {
  if (ctx.avg_sale_cents !== null && ctx.sample_size >= OWN_SALES_TRUSTED)
    return { cents: ctx.avg_sale_cents, basis: 'our sales' }
  if (ctx.ebay_median_cents !== null) return { cents: ctx.ebay_median_cents, basis: 'eBay asking' }
  if (ctx.avg_sale_cents !== null && ctx.sample_size > 0)
    return { cents: ctx.avg_sale_cents, basis: 'our sales' }
  return { cents: null, basis: null }
}

/**
 * Checks a lot. Lines for the same set are merged. Profit and the max price are
 * worked out on the books we can price; unpriced books add upside, not cost.
 */
export function checkLot(
  lines: LotLine[],
  contexts: LotSetContext[],
  askingCents: number,
  targetMarginPercent: number,
  fee: FeeRule,
): LotResult {
  const byId = new Map(contexts.map((c) => [c.template_id, c]))
  const merged = new Map<string, Set<number>>()
  for (const line of lines) {
    const set = merged.get(line.template_id) ?? new Set<number>()
    for (const v of line.volumes) set.add(v)
    merged.set(line.template_id, set)
  }

  const sets: LotSetResult[] = []
  let books = 0
  let pricedBooks = 0
  let resale = 0
  let keep = 0
  for (const [id, vols] of merged) {
    const ctx = byId.get(id)
    if (!ctx) continue
    const volumes = [...vols].sort((a, b) => a - b)
    const owned = new Set(ctx.owned)
    const missingBefore = ctx.total_volumes
      ? Array.from({ length: ctx.total_volumes }, (_, i) => i + 1).filter((n) => !owned.has(n))
      : []
    const fills = volumes.filter(
      (v) => !owned.has(v) && (!ctx.total_volumes || v <= ctx.total_volumes),
    )
    const { cents, basis } = unitResale(ctx)
    books += volumes.length
    if (cents !== null) {
      pricedBooks += volumes.length
      resale += cents * volumes.length
      keep += calculateMargin(cents, 0, fee).keepCents * volumes.length
    }
    sets.push({
      template_id: id,
      name: ctx.name,
      volumes,
      duplicates: volumes.filter((v) => owned.has(v)),
      fills_gaps: fills,
      completes_set: missingBefore.length > 0 && missingBefore.every((n) => vols.has(n)),
      score: ctx.score,
      action: ctx.action,
      unit_resale_cents: cents,
      basis,
    })
  }

  if (pricedBooks === 0) {
    return {
      sets,
      books,
      priced_books: 0,
      expected_resale_cents: 0,
      expected_keep_cents: 0,
      profit_cents: null,
      margin_percent: null,
      max_price_cents: null,
      verdict: 'unknown',
    }
  }
  const profit = keep - askingCents
  const margin = Math.round((profit / resale) * 100)
  // Highest price where (keep - price) / resale still meets the target margin.
  const maxPrice = Math.max(0, Math.floor(keep - (targetMarginPercent / 100) * resale))
  const verdict: LotVerdict =
    margin >= targetMarginPercent ? 'good' : margin >= targetMarginPercent / 2 ? 'fair' : 'pass'
  return {
    sets,
    books,
    priced_books: pricedBooks,
    expected_resale_cents: resale,
    expected_keep_cents: keep,
    profit_cents: profit,
    margin_percent: margin,
    max_price_cents: maxPrice,
    verdict,
  }
}

/** Splits the asking price across sets by book count, for pre-filling Add volumes per set. */
export function splitAsking(askingCents: number, sets: { volumes: number[] }[]): number[] {
  const total = sets.reduce((s, x) => s + x.volumes.length, 0)
  if (total === 0) return sets.map(() => 0)
  let given = 0
  return sets.map((s, i) => {
    if (i === sets.length - 1) return askingCents - given
    const share = Math.floor((askingCents * s.volumes.length) / total)
    given += share
    return share
  })
}
