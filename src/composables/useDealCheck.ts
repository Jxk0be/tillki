import { callFunction } from '@/lib/edgeFunctions'
import type { ItemCategory } from '@/types/inventory'

export interface DealInput {
  description: string
  template_id?: string
  series?: string
  category?: ItemCategory
  volumes?: number[]
  quantity?: number
  condition?: string
  asking_price_cents: number
  photo?: { media_type: 'image/jpeg' | 'image/png' | 'image/webp'; data: string }
}

export interface DealHistory {
  sale_count: number
  units_sold: number
  avg_sale_price_per_unit_cents: number | null
  avg_kept_per_unit_cents: number | null
  avg_net_profit_per_unit_cents: number | null
  avg_days_to_sell: number | null
  units_in_stock: number
  sell_through: number | null
}

export interface DealResult {
  verdict: {
    verdict: 'buy' | 'negotiate' | 'pass'
    max_price_cents: number
    reasoning: string
    confidence: 'low' | 'medium' | 'high'
  }
  history: DealHistory
  /** Which of our sales the numbers come from. */
  basis: 'set' | 'series' | 'category' | 'none'
  formula_max_price_cents: number | null
  target_margin_percent: number
  offered: { fills_gaps: number[]; duplicates: number[]; beyond_total: number[] } | null
  units: number
}

/** Asks the deal-check function for a verdict based on our own sales history. */
export function checkDeal(input: DealInput) {
  return callFunction<DealResult>('deal-check', input)
}

/** A photo as base64 for the request (already compressed by the caller). */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < buffer.length; i += 0x8000) {
    binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}
