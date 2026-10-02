import { describe, expect, it } from 'vitest'
import {
  ageLabel,
  defaultFilters,
  parseAge,
  extraFilterCount,
  itemFiltersActive,
  normalizeTag,
  parseInventoryQuery,
  searchPattern,
  searchTagFilter,
  tagArrayLiteral,
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
      tag: 'box set 1-11',
    }
    const query = toInventoryQuery(filters)
    expect(query).toMatchObject({
      view: 'sets',
      status: 'in_stock,listed',
      nophotos: '1',
      gsort: 'missing',
      age: '31-60',
      tag: 'box set 1-11',
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

  it('filters by tag', () => {
    expect(parseInventoryQuery({ tag: '  Box  Set 1-11 ' }).tag).toBe('box set 1-11')
    expect(parseInventoryQuery({ tag: '' }).tag).toBeNull()
    expect(normalizeTag('   ')).toBeNull()
    expect(itemFiltersActive({ ...defaultFilters, tag: 'bundle' })).toBe(true)
    expect(extraFilterCount({ ...defaultFilters, tag: 'bundle' })).toBe(1)
  })

  it('quotes tags for array filters', () => {
    expect(tagArrayLiteral('box set 1-11')).toBe('{"box set 1-11"}')
    expect(tagArrayLiteral('say "hi" \\ bye')).toBe('{"say \\"hi\\" \\\\ bye"}')
  })

  it('matches a whole tag from the search box', () => {
    expect(searchTagFilter('Box Set 1-11')).toBe('tags.cs.{"box set 1-11"}')
    expect(searchTagFilter('a,b (c)')).toBe('tags.cs.{"a b c"}')
    expect(searchTagFilter(' , ')).toBeNull()
  })
})
