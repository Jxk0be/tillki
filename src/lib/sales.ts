import { formatRanges } from './volumes'
import type { SalesPlatform } from '@/types/inventory'

export interface SaleMoney {
  salePriceCents: number
  shippingChargedCents: number
  shippingCostCents: number
  platformFeeCents: number
  otherCostCents: number
}

/** What we keep after fees, shipping and other costs (before what the item cost us). */
export function keptCents(m: SaleMoney): number {
  return (
    m.salePriceCents +
    m.shippingChargedCents -
    m.platformFeeCents -
    m.shippingCostCents -
    m.otherCostCents
  )
}

/** Net profit: what we keep minus the average cost of the copies sold. Matches v_sales. */
export function saleProfitCents(m: SaleMoney, unitCostCents: number, quantity: number): number {
  return keptCents(m) - unitCostCents * quantity
}

/**
 * Splits an amount across weights exactly like the database's split_cents():
 * each share is floor(total * w / sum), and the leftover goes to the last share
 * with a positive weight. Shares always add up to the total.
 */
export function splitByWeights(totalCents: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum <= 0) return weights.map(() => 0)
  const last = weights.reduce((idx, w, i) => (w > 0 ? i : idx), -1)
  let given = 0
  return weights.map((w, i) => {
    if (i === last) return totalCents - given
    if (w === 0) return 0
    const part = Math.floor((totalCents * w) / sum)
    given += part
    return part
  })
}

export interface BundleLine {
  id: string
  name: string
  quantity: number
  listPriceCents: number | null
  unitCostCents: number
}

export type BundleSplitMode = 'even' | 'by_list_price'

export interface BundleShare extends SaleMoney {
  id: string
  name: string
  quantity: number
  profitCents: number
}

/** Each item's share of a bundle's money, matching record_bundle_sale(). */
export function bundleShares(
  lines: readonly BundleLine[],
  totals: Omit<SaleMoney, 'otherCostCents'>,
  mode: BundleSplitMode,
): BundleShare[] {
  const weights = lines.map((l) =>
    mode === 'even' ? l.quantity : l.quantity * (l.listPriceCents ?? 0),
  )
  const price = splitByWeights(totals.salePriceCents, weights)
  const charged = splitByWeights(totals.shippingChargedCents, weights)
  const shipCost = splitByWeights(totals.shippingCostCents, weights)
  const fee = splitByWeights(totals.platformFeeCents, weights)
  return lines.map((l, i) => {
    const money: SaleMoney = {
      salePriceCents: price[i] ?? 0,
      shippingChargedCents: charged[i] ?? 0,
      shippingCostCents: shipCost[i] ?? 0,
      platformFeeCents: fee[i] ?? 0,
      otherCostCents: 0,
    }
    return {
      id: l.id,
      name: l.name,
      quantity: l.quantity,
      ...money,
      profitCents: saleProfitCents(money, l.unitCostCents, l.quantity),
    }
  })
}

export interface BundleRowLike {
  template_name: string | null
  volume_number: number | null
  item_name: string
}

/** "One Piece Volume 1-12 (bundle)", or "3 items (bundle)" for a mix. */
export function bundleTitle(rows: readonly BundleRowLike[]): string {
  const sets = new Set(rows.map((r) => r.template_name))
  const first = rows[0]
  if (
    first &&
    sets.size === 1 &&
    first.template_name &&
    rows.every((r) => r.volume_number !== null)
  ) {
    const volumes = rows.map((r) => r.volume_number as number)
    return `${first.template_name} Volume ${formatRanges(volumes)} (bundle)`
  }
  return `${rows.length} items (bundle)`
}

export interface MonthTotals {
  revenueCents: number
  feesCents: number
  shippingCents: number
  netProfitCents: number
  units: number
}

export interface SaleForTotals {
  sold_at: string
  quantity: number
  sale_price_cents: number
  shipping_charged_cents: number
  shipping_cost_cents: number
  platform_fee_cents: number
  net_profit_cents: number
}

/** "2026-03" for a sale, in the browser's local time. */
export function monthKey(soldAt: string): string {
  const d = new Date(soldAt)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Sums revenue (price + shipping charged), fees, shipping paid and net profit. */
export function totalsFor(sales: readonly SaleForTotals[]): MonthTotals {
  return sales.reduce<MonthTotals>(
    (t, s) => ({
      revenueCents: t.revenueCents + s.sale_price_cents + s.shipping_charged_cents,
      feesCents: t.feesCents + s.platform_fee_cents,
      shippingCents: t.shippingCents + s.shipping_cost_cents,
      netProfitCents: t.netProfitCents + s.net_profit_cents,
      units: t.units + s.quantity,
    }),
    { revenueCents: 0, feesCents: 0, shippingCents: 0, netProfitCents: 0, units: 0 },
  )
}

const LAST_PLATFORM_KEY = 'kura-last-platform'

export function rememberPlatform(platform: SalesPlatform) {
  try {
    localStorage.setItem(LAST_PLATFORM_KEY, platform)
  } catch {
    // storage blocked; no memory, no problem
  }
}

export function lastPlatform(): SalesPlatform | null {
  try {
    return localStorage.getItem(LAST_PLATFORM_KEY) as SalesPlatform | null
  } catch {
    return null
  }
}
