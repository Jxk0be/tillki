import { describe, expect, it } from 'vitest'
import {
  ageLabel,
  defaultFilters,
  parseAge,
  extraFilterCount,
  itemFiltersActive,
  parseInventoryQuery,
  searchPattern,
  toInventoryQuery,
  type InventoryFilters,
} from '../inventoryQuery'

describe('inventory URL query', () => {
  it('parses an empty query to the defaults', () => {
    expect(parseInventoryQuery({})).toEqual(defaultFilters)
  })

  it('writes nothing for the defaults', () => {
    expect(toInventoryQuery({ ...defaultFilters })).toEqual({})
  })

  it('round-trips every filter', () => {
    const filters: InventoryFilters = {
      view: 'sets',
      q: 'volume 7',
      kind: 'set',
      set: 'abc',
      category: 'manga',
      status: ['in_stock', 'listed'],
      condition: 'good',
      noPhotos: true,
      archived: true,
      sort: 'list_price_cents',
      dir: 'asc',
      groupSort: 'missing',
      expand: 'abc',
      age: { min: 31, max: 60 },
    }
    const query = toInventoryQuery(filters)
    expect(query).toMatchObject({
      view: 'sets',
      status: 'in_stock,listed',
      nophotos: '1',
      gsort: 'missing',
      age: '31-60',
    })
    expect(parseInventoryQuery(query as Record<string, string>)).toEqual(filters)
  })

  it('ignores unknown values', () => {
    const f = parseInventoryQuery({
      view: 'grid',
      status: 'listed,bogus,listed',
      sort: 'drop table',
      dir: 'x',
    })
    expect(f.view).toBe('items')
    expect(f.status).toEqual(['listed'])
    expect(f.sort).toBe('created_at')
    expect(f.dir).toBe('desc')
  })
})

describe('filter helpers', () => {
  it('knows when item filters are active', () => {
    expect(itemFiltersActive({ ...defaultFilters })).toBe(false)
    expect(itemFiltersActive({ ...defaultFilters, view: 'sets', sort: 'name' })).toBe(false)
    expect(itemFiltersActive({ ...defaultFilters, q: ' 7 ' })).toBe(true)
    expect(itemFiltersActive({ ...defaultFilters, status: ['sold'] })).toBe(true)
  })

  it('counts the filters in the Filters sheet', () => {
    expect(
      extraFilterCount({ ...defaultFilters, kind: 'set', noPhotos: true, status: ['sold'] }),
    ).toBe(2)
  })

  it('makes search text safe for or() filters', () => {
    expect(searchPattern('  ')).toBeNull()
    expect(searchPattern('One Piece, Vol. (3)')).toBe('*One Piece Vol. 3*')
    expect(searchPattern('MG-00042')).toBe('*MG-00042*')
  })

  it('reads age ranges from the aging chart', () => {
    expect(parseAge('0-30')).toEqual({ min: 0, max: 30 })
    expect(parseAge('91-')).toEqual({ min: 91, max: null })
    expect(parseAge('60-31')).toBeNull()
    expect(parseAge('soon')).toBeNull()
    expect(parseAge(null)).toBeNull()
    expect(ageLabel({ min: 91, max: null })).toBe('Over 90 days')
    expect(ageLabel({ min: 31, max: 60 })).toBe('31-60 days')
    expect(itemFiltersActive({ ...defaultFilters, age: { min: 0, max: 30 } })).toBe(true)
  })
})
