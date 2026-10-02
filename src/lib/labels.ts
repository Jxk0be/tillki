import type { ItemCategory, ItemCondition, ItemStatus, SalesPlatform } from '@/types/inventory'

export const statusLabels: Record<ItemStatus, string> = {
  draft: 'Draft',
  in_stock: 'In stock',
  listed: 'Listed',
  reserved: 'Reserved',
  sold: 'Sold',
  kept: 'Kept',
  written_off: 'Written off',
}

export const categoryLabels: Record<ItemCategory, string> = {
  manga: 'Manga',
  figure: 'Figure',
  merch: 'Merch',
  custom: 'Custom',
  other: 'Other',
}

export const conditionLabels: Record<ItemCondition, string> = {
  new: 'New',
  like_new: 'Like new',
  very_good: 'Very good',
  good: 'Good',
  acceptable: 'Acceptable',
  for_parts: 'For parts',
}

export const platformLabels: Record<SalesPlatform, string> = {
  ebay: 'eBay',
  mercari: 'Mercari',
  fb_marketplace: 'Facebook Marketplace',
  shopify: 'Shopify',
  event: 'Event',
  in_person: 'In person',
  other: 'Other',
}

export const itemStatuses = Object.keys(statusLabels) as ItemStatus[]
export const itemCategories = Object.keys(categoryLabels) as ItemCategory[]
export const itemConditions = Object.keys(conditionLabels) as ItemCondition[]
