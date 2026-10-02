import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import VolumeStrip from '../templates/VolumeStrip.vue'
import ItemCardRow from '../inventory/ItemCardRow.vue'
import SetGroupCard from '../templates/SetGroupCard.vue'
import { buildVolumeStatus } from '@/lib/volumes'
import type { InventoryItem, InventorySet } from '@/types/inventory'

const push = vi.fn<(to: unknown) => void>()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

// RouterLink renders its target so tests can check where links go.
const RouterLinkStub = {
  props: ['to'],
  template: '<a :data-to="JSON.stringify(to)"><slot /></a>',
}
const global = { stubs: { RouterLink: RouterLinkStub, Teleport: true } }

const item = (extra: Partial<InventoryItem> = {}): InventoryItem => ({
  id: 'item-3',
  sku: 'MG-00003',
  name: 'Shaman King Volume 3',
  description: null,
  effective_description: null,
  category: 'manga',
  kind: 'set',
  template_id: 'set-1',
  template_name: 'Shaman King',
  total_volumes: 32,
  series: 'Shaman King',
  volume_number: 3,
  isbn: null,
  condition: 'very_good',
  quantity: 2,
  units_sold: 0,
  units_left: 2,
  cost_cents: 450,
  list_price_cents: 800,
  est_profit_cents: 246,
  status: 'listed',
  listed_at: null,
  purchased_at: '2026-01-10',
  storage_location: null,
  tags: [],
  lot_names: [],
  image_count: 0,
  cover_path: null,
  cover_source: null,
  acquisition_count: 1,
  days_in_stock: 10,
  created_at: '2026-01-10T17:00:00Z',
  created_by: null,
  archived_at: null,
  ...extra,
})

beforeEach(() => push.mockClear())

describe('VolumeStrip', () => {
  const rows = buildVolumeStatus(
    [
      {
        id: 'item-3',
        volume_number: 3,
        status: 'listed',
        quantity: 2,
        units_left: 2,
        units_sold: 0,
      },
      { id: 'item-4', volume_number: 4, status: 'sold', quantity: 1, units_left: 0, units_sold: 1 },
    ],
    5,
  )

  it('labels every state in words, not just color', () => {
    const wrapper = mount(VolumeStrip, { props: { rows, templateId: 'set-1' }, global })
    const labels = wrapper
      .findAll('ul[aria-label="Volumes"] button')
      .map((b) => b.attributes('aria-label'))
    expect(labels).toEqual([
      'Volume 1, missing',
      'Volume 2, missing',
      'Volume 3, owned, listed, 2 copies left',
      'Volume 4, sold',
      'Volume 5, missing',
    ])
    expect(wrapper.text()).toContain('×2')
  })

  it('opens the item for an owned volume', async () => {
    const wrapper = mount(VolumeStrip, { props: { rows, templateId: 'set-1' }, global })
    await wrapper.findAll('ul[aria-label="Volumes"] button')[2]!.trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'item-detail', params: { id: 'item-3' } })
  })

  it('offers to add a missing volume', async () => {
    const wrapper = mount(VolumeStrip, { props: { rows, templateId: 'set-1' }, global })
    await wrapper.findAll('ul[aria-label="Volumes"] button')[1]!.trigger('click')
    await flushPromises()
    const add = wrapper.findAll('button').find((b) => b.text().includes('Add Volume 2'))
    expect(add).toBeDefined()
    await add!.trigger('click')
    expect(push).toHaveBeenCalledWith({
      name: 'template-add-volumes',
      params: { id: 'set-1' },
      query: { v: '2' },
    })
  })
})

describe('ItemCardRow', () => {
  it('shows price, cost, signed profit, copies and the set chip', () => {
    const wrapper = mount(ItemCardRow, { props: { item: item() }, global })
    const text = wrapper.text()
    expect(text).toContain('Shaman King Volume 3')
    expect(text).toContain('$8.00')
    expect(text).toContain('cost $4.50')
    expect(text).toContain('+$2.46')
    expect(text).toContain('×2')
    expect(text).toContain('Listed')
    const chip = wrapper.find('a[aria-label="Show set Shaman King"]')
    expect(JSON.parse(chip.attributes('data-to')!)).toEqual({
      name: 'inventory',
      query: { view: 'sets', expand: 'set-1' },
    })
  })

  it('emits the menu event', async () => {
    const wrapper = mount(ItemCardRow, { props: { item: item() }, global })
    await wrapper.find('button[aria-label="Actions for Shaman King Volume 3"]').trigger('click')
    expect(wrapper.emitted('menu')?.[0]).toBeTruthy()
  })
})

describe('SetGroupCard', () => {
  const set: InventorySet = {
    id: 'set-1',
    name: 'Shaman King',
    description: null,
    category: 'manga',
    publisher: 'VIZ Media',
    total_volumes: 32,
    total_known: true,
    is_ongoing: false,
    cover_path: null,
    volumes_owned: 18,
    units_in_stock: 20,
    extra_copies: 2,
    volumes_sold: 1,
    owned_ranges: '3-20',
    missing_ranges: '1-2, 21-32',
    missing_count: 14,
    completion_percent: 56,
    cost_basis_cents: 10005,
    list_value_cents: 16000,
    est_profit_cents: 3915,
    last_added_at: null,
    created_at: '2026-01-10T17:00:00Z',
  }

  it('summarises the set and toggles with aria-expanded', async () => {
    const wrapper = mount(SetGroupCard, {
      props: {
        set,
        expanded: false,
        volumes: undefined,
        loadingVolumes: false,
        strip: undefined,
        match: { matching: 5, total: 18 },
        filtering: true,
        highlightMatches: false,
      },
      global,
    })
    const text = wrapper.text()
    expect(text).toContain('18 of 32 owned')
    expect(text).toContain('Missing 1-2, 21-32')
    expect(text).toContain('5 of 18 match')
    const header = wrapper.find('button[aria-expanded]')
    expect(header.attributes('aria-expanded')).toBe('false')
    await header.trigger('click')
    expect(wrapper.emitted('toggle')?.[0]).toEqual(['set-1'])
  })
})
