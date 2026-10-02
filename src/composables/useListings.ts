import { callFunction } from '@/lib/edgeFunctions'
import { supabase } from '@/lib/supabase'

export type ListingPlatform = 'ebay' | 'mercari' | 'fb_marketplace'

export interface ListingDraft {
  title: string
  description: string
  condition_notes: string
  suggested_tags: string[]
  flaws_seen: string[]
}

export interface DraftResponse {
  draft: ListingDraft
  platform: ListingPlatform
  photos: { count: number; examples: boolean }
  volumes: string | null
  item_count: number
}

/** Drafts a listing for one item, or a bundle of volumes from one set. */
export function draftListing(itemIds: string[], platform: ListingPlatform) {
  return callFunction<DraftResponse>('draft-listing', {
    ...(itemIds.length > 1 ? { item_ids: itemIds } : { item_id: itemIds[0] }),
    platform,
  })
}

/** Saves a drafted description as the item's own description. */
export async function saveItemDescription(itemId: string, description: string) {
  const { error } = await supabase.from('items').update({ description }).eq('id', itemId)
  if (error) throw new Error("Couldn't save the description.")
}
