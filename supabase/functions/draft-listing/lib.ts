// Pure helpers for draft-listing (no Deno or network imports, so Vitest can test them).
import { z } from 'zod'

export const platforms = ['ebay', 'mercari', 'fb_marketplace'] as const
export type ListingPlatform = (typeof platforms)[number]

export const MAX_BUNDLE_ITEMS = 60
export const MAX_PHOTOS = 5

/** Longest title each platform accepts (eBay 80, Mercari 80, Facebook ~100; we keep FB short too). */
export const titleLimits: Record<ListingPlatform, number> = {
  ebay: 80,
  mercari: 80,
  fb_marketplace: 100,
}

export const RequestBody = z
  .object({
    item_id: z.uuid().optional(),
    item_ids: z.array(z.uuid()).min(1).max(MAX_BUNDLE_ITEMS).optional(),
    platform: z.enum(platforms),
  })
  .refine((b) => !!b.item_id !== !!b.item_ids, {
    message: 'Send either item_id or item_ids.',
  })

export const Draft = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  condition_notes: z.string().default(''),
  suggested_tags: z.array(z.string()).default([]),
  flaws_seen: z.array(z.string()).default([]),
})
export type Draft = z.infer<typeof Draft>

/** Cuts a title to the limit at a word boundary (never mid-word unless one word is too long). */
export function clampTitle(title: string, limit: number): string {
  const clean = title.replace(/\s+/g, ' ').trim()
  if (clean.length <= limit) return clean
  const cut = clean.slice(0, limit + 1)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : clean.slice(0, limit))
    .replace(/[\s,;:/|-]+$/, '')
    .trim()
}

/** Cleans up the model's draft: trims, clamps the title, de-duplicates tags. */
export function finishDraft(draft: Draft, platform: ListingPlatform): Draft {
  const tags = [...new Set(draft.suggested_tags.map((t) => t.trim()).filter(Boolean))].slice(0, 15)
  return {
    title: clampTitle(draft.title, titleLimits[platform]),
    description: draft.description.trim(),
    condition_notes: draft.condition_notes.trim(),
    suggested_tags: tags,
    flaws_seen: draft.flaws_seen.map((f) => f.trim()).filter(Boolean),
  }
}

const platformRules: Record<ListingPlatform, string> = {
  ebay: 'eBay: title at most 80 characters, keyword-first: series, volume(s), "Manga"/item type, language, edition or format if known, then condition. No emoji, no ALL CAPS words except standard abbreviations. Description: clear, factual, a short condition paragraph, and a line about shipping care (packed securely).',
  mercari:
    'Mercari: title at most 80 characters, shorter and friendlier than eBay but still searchable (series + volume + item type). Description: a few short lines, friendly, condition first.',
  fb_marketplace:
    'Facebook Marketplace: a short, plain title someone would search for locally (series + volume + item type). Description: casual and short; mention pickup or shipping can be discussed.',
}

export interface ListingFacts {
  kind: 'one_off' | 'set_volume' | 'bundle'
  title: string
  set_name: string | null
  volumes: string | null
  series: string | null
  category: string
  condition: string | null
  isbn: string | null
  sku: string | null
  description: string | null
  tags: string[]
  copies_available: number
  asking_price: string | null
}

export function systemPrompt(platform: ListingPlatform): string {
  return `You write resale listings for a small anime and manga resale business.

${platformRules[platform]}

Honesty rules:
- Use only the facts provided and what is clearly visible in the photos. Never invent details such as "first printing", "first edition", "rare", "OOP", "sealed", "signed", or a publisher, translator or year unless it is in the facts.
- Describe condition honestly from the condition field. Only mention specific wear (creases, yellowing, stains, sun fade, shelf wear, dings) if you can actually see it in a photo of THIS copy; list each in flaws_seen. If nothing is visible, flaws_seen is [].
- If the photos are labeled as example photos of the set, they are NOT this copy: do not judge condition or flaws from them at all.
- For a bundle, refer to the volumes as compact ranges exactly as given (e.g. "Vol 1-12" or "Vol 1-3, 5"), never a long list.
- Don't mention prices or SKUs in the title or description.

Reply with ONLY a JSON object, no prose and no code fences:
{"title": string, "description": string, "condition_notes": string, "suggested_tags": string[], "flaws_seen": string[]}`
}

export function factsText(
  facts: ListingFacts,
  photos: { count: number; examples: boolean },
): string {
  const photoLine =
    photos.count === 0
      ? 'There are no photos.'
      : photos.examples
        ? `The ${photos.count} photo(s) are EXAMPLE photos of the set, not this exact copy. Do not judge condition or flaws from them.`
        : `The ${photos.count} photo(s) show this exact copy.`
  return `Write the listing.\n\n${photoLine}\n\nFacts (JSON):\n${JSON.stringify(facts, null, 2)}`
}
