import type { Component } from 'vue'
import {
  BookCopy,
  BookPlus,
  Layers,
  LayoutDashboard,
  LibraryBig,
  Menu,
  MessageCircle,
  Package,
  PackagePlus,
  Receipt,
  Settings,
  Wallet,
  Wrench,
} from 'lucide-vue-next'

export interface NavItem {
  label: string
  to: string
  icon: Component
}

export interface AddChoice extends NavItem {
  description: string
}

/** Mobile bottom tab bar. The raised center Add button sits between left and right. */
export const tabItems = {
  left: [
    { label: 'Inventory', to: '/inventory', icon: Package },
    { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  ],
  right: [
    { label: 'Ask', to: '/ask', icon: MessageCircle },
    { label: 'More', to: '/more', icon: Menu },
  ],
} satisfies { left: NavItem[]; right: NavItem[] }

/** What the Add button offers. */
export const addChoices: AddChoice[] = [
  {
    label: 'One-off item',
    description: 'A single figure, piece of merch, or standalone book.',
    to: '/inventory/new',
    icon: PackagePlus,
  },
  {
    label: 'Volumes of a set',
    description: 'Pick a set, then choose which volumes came in.',
    // The Sets list switches into "pick a set" mode with this query.
    to: '/templates?pick=add-volumes',
    icon: BookCopy,
  },
  {
    label: 'New set',
    description: 'Name, description and example photos shared by every volume.',
    to: '/templates/new',
    icon: BookPlus,
  },
]

/** Desktop sidebar, top group. */
export const primaryNav: NavItem[] = [
  { label: 'Inventory', to: '/inventory', icon: Package },
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Ask Kura', to: '/ask', icon: MessageCircle },
]

/** Desktop sidebar, second group, and the destinations listed on /more. */
export const secondaryNav: NavItem[] = [
  { label: 'Sets', to: '/templates', icon: LibraryBig },
  { label: 'Sales', to: '/sales', icon: Receipt },
  { label: 'Lots', to: '/lots', icon: Layers },
  { label: 'Expenses', to: '/expenses', icon: Wallet },
  { label: 'Tools', to: '/tools', icon: Wrench },
  { label: 'Settings', to: '/settings', icon: Settings },
]

/** Pages that belong to the Add button rather than a tab. */
export function isAddRoute(path: string): boolean {
  return (
    path === '/inventory/new' ||
    path === '/templates/new' ||
    /^\/templates\/[^/]+\/add-volumes$/.test(path)
  )
}

/**
 * Whether a nav item should show as active for the current path. Add pages
 * belong to the Add button, and on mobile the More tab owns the pages it links
 * to so you can tell where you are.
 */
export function isNavActive(
  itemTo: string,
  path: string,
  opts: { mobile?: boolean } = {},
): boolean {
  if (isAddRoute(path)) return false
  if (itemTo === '/more' && opts.mobile) {
    return path === '/more' || secondaryNav.some((item) => isNavActive(item.to, path))
  }
  return path === itemTo || path.startsWith(`${itemTo}/`)
}
