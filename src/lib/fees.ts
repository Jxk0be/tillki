import type { Json } from '@/types/database'
import type { SalesPlatform } from '@/types/inventory'

export interface FeeRule {
  percent: number
  fixed_cents: number
}

export type FeeRules = Partial<Record<SalesPlatform, FeeRule>>

/** Reads app_settings.fee_rules ({ note, platforms: { ebay: { percent, fixed_cents } } }). */
export function parseFeeRules(value: Json | undefined): FeeRules {
  const platforms =
    value && typeof value === 'object' && !Array.isArray(value) ? value.platforms : undefined
  if (!platforms || typeof platforms !== 'object' || Array.isArray(platforms)) return {}
  const rules: FeeRules = {}
  for (const [platform, rule] of Object.entries(platforms)) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) continue
    const percent = typeof rule.percent === 'number' ? rule.percent : 0
    const fixed = typeof rule.fixed_cents === 'number' ? rule.fixed_cents : 0
    rules[platform as SalesPlatform] = { percent, fixed_cents: fixed }
  }
  return rules
}

/** Estimated platform fee on a sale price: percent of the price plus a fixed amount. */
export function estimateFeeCents(priceCents: number, rule: FeeRule): number {
  if (priceCents <= 0) return 0
  return Math.round((priceCents * rule.percent) / 100) + rule.fixed_cents
}

export interface Margin {
  feeCents: number
  /** What we'd keep after fees. */
  keepCents: number
  /** Kept minus what we paid. */
  profitCents: number
  /** Profit as a share of the price, rounded to a whole percent (null when there's no price). */
  marginPercent: number | null
}

/** "After fees you'd keep $X, profit $Y (Z%)" for an asking price and cost. */
export function calculateMargin(priceCents: number, costCents: number, rule: FeeRule): Margin {
  const feeCents = estimateFeeCents(priceCents, rule)
  const keepCents = priceCents - feeCents
  const profitCents = keepCents - costCents
  return {
    feeCents,
    keepCents,
    profitCents,
    marginPercent: priceCents > 0 ? Math.round((profitCents / priceCents) * 100) : null,
  }
}
