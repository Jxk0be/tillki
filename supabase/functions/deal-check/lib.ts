// Pure helpers for deal-check (no Deno or network imports, so Vitest can test them).
import { z } from 'zod'

export const MIN_SALES_FOR_CONFIDENCE = 3

export const RequestBody = z.object({
  description: z.string().trim().min(1, 'Say what the deal is.').max(500),
  template_id: z.uuid().optional(),
  series: z.string().trim().max(100).optional(),
  category: z.enum(['manga', 'figure', 'merch', 'custom', 'other']).optional(),
  volumes: z.array(z.number().int().min(1).max(5000)).max(500).optional(),
  quantity: z.number().int().min(1).max(500).optional(),
  condition: z.string().max(40).optional(),
  asking_price_cents: z.number().int().min(0).max(100_000_000),
  photo: z
    .object({
      media_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
      data: z.string().max(7_000_000),
    })
    .optional(),
})
export type DealRequest = z.infer<typeof RequestBody>

export const Verdict = z.object({
  verdict: z.enum(['buy', 'negotiate', 'pass']),
  max_price_cents: z.number().int().min(0),
  reasoning: z.string().min(1),
  confidence: z.enum(['low', 'medium', 'high']),
})
export type Verdict = z.infer<typeof Verdict>

export interface SaleRow {
  quantity: number
  revenue_cents: number
  platform_fee_cents: number
  shipping_cost_cents: number
  other_cost_cents: number
  net_profit_cents: number
  days_to_sell: number
}

export interface History {
  sale_count: number
  units_sold: number
  avg_sale_price_per_unit_cents: number | null
  /** What we keep per unit after fees, shipping paid and other costs (before item cost). */
  avg_kept_per_unit_cents: number | null
  avg_net_profit_per_unit_cents: number | null
  avg_days_to_sell: number | null
  units_in_stock: number
  /** Share of units that sold, of those sold plus those still in stock (0-1). */
  sell_through: number | null
}

/** Our own track record for a group of sales plus what's still on the shelf. */
export function summarizeHistory(sales: readonly SaleRow[], unitsInStock: number): History {
  const units = sales.reduce((s, r) => s + r.quantity, 0)
  const sum = (f: (r: SaleRow) => number) => sales.reduce((s, r) => s + f(r), 0)
  const perUnit = (total: number) => (units ? Math.round(total / units) : null)
  const kept = sum(
    (r) => r.revenue_cents - r.platform_fee_cents - r.shipping_cost_cents - r.other_cost_cents,
  )
  return {
    sale_count: sales.length,
    units_sold: units,
    avg_sale_price_per_unit_cents: perUnit(sum((r) => r.revenue_cents)),
    avg_kept_per_unit_cents: perUnit(kept),
    avg_net_profit_per_unit_cents: perUnit(sum((r) => r.net_profit_cents)),
    avg_days_to_sell: units
      ? Math.round((sum((r) => r.days_to_sell * r.quantity) / units) * 10) / 10
      : null,
    units_in_stock: unitsInStock,
    sell_through:
      units + unitsInStock ? Math.round((units / (units + unitsInStock)) * 100) / 100 : null,
  }
}

/**
 * The most we can pay and still hit the target margin, if units sell like ours
 * have: kept per unit x units x (1 - margin). Null without any sales history.
 */
export function formulaMaxPriceCents(
  history: History,
  units: number,
  targetMarginPercent: number,
): number | null {
  if (history.avg_kept_per_unit_cents === null || units < 1) return null
  const margin = Math.min(Math.max(targetMarginPercent, 0), 95) / 100
  return Math.max(0, Math.floor(history.avg_kept_per_unit_cents * units * (1 - margin)))
}

/** Which offered volumes fill gaps in our set and which we already have copies of. */
export function splitOffered(
  offered: readonly number[],
  owned: readonly number[],
  total: number | null,
): { fills_gaps: number[]; duplicates: number[]; beyond_total: number[] } {
  const have = new Set(owned)
  const sorted = [...new Set(offered)].sort((a, b) => a - b)
  return {
    fills_gaps: sorted.filter((v) => !have.has(v) && (total === null || v <= total)),
    duplicates: sorted.filter((v) => have.has(v)),
    beyond_total: total === null ? [] : sorted.filter((v) => v > total && !have.has(v)),
  }
}

/** Confidence can never be more than "low" with fewer than 3 sales to go on. */
export function enforceConfidence(v: Verdict, saleCount: number): Verdict {
  return saleCount < MIN_SALES_FOR_CONFIDENCE ? { ...v, confidence: 'low' } : v
}

export const SYSTEM_PROMPT = `You help a two-person anime and manga resale business decide whether to buy a deal (a lot of manga volumes, a figure, merch) to resell.

You only know THEIR OWN sales history for similar items, given below. You do not know market prices. Never claim to know current market value or what it "usually sells for" elsewhere.

Decide:
- "buy" if the asking price is at or under a price that leaves their target margin based on their history,
- "negotiate" if it's somewhat above that or the history is thin but the deal looks plausible,
- "pass" if it clearly can't hit the margin or similar stock sells slowly / sits in stock.
max_price_cents is the most they should pay for the whole deal to hit the target margin (use formula_max_price_cents as the anchor when present; adjust down for duplicates of volumes they already hold, slow sell-through, or poor condition; with no history, give a cautious number and say why).
reasoning: 2-3 short sentences, plain language, mention the key numbers in dollars.
confidence: "low" with fewer than 3 past sales in this series/category, otherwise "medium" or "high" depending on how consistent the history is.

Reply with ONLY a JSON object, no prose and no code fences:
{"verdict": "buy"|"negotiate"|"pass", "max_price_cents": integer, "reasoning": string, "confidence": "low"|"medium"|"high"}`
