import { describe, expect, it } from 'vitest'
import { isAddRoute, isNavActive } from '../navigation'

describe('isAddRoute', () => {
  it.each(['/inventory/new', '/templates/new', '/templates/abc-123/add-volumes'])(
    '%s is an add page',
    (path) => {
      expect(isAddRoute(path)).toBe(true)
    },
  )

  it.each(['/inventory', '/inventory/abc', '/templates', '/templates/abc', '/templates/abc/edit'])(
    '%s is not',
    (path) => {
      expect(isAddRoute(path)).toBe(false)
    },
  )
})

describe('isNavActive', () => {
  it('matches a section and its children', () => {
    expect(isNavActive('/inventory', '/inventory')).toBe(true)
    expect(isNavActive('/inventory', '/inventory/abc/edit')).toBe(true)
    expect(isNavActive('/templates', '/templates/abc')).toBe(true)
  })

  it('does not highlight a tab on add pages', () => {
    expect(isNavActive('/inventory', '/inventory/new')).toBe(false)
    expect(isNavActive('/templates', '/templates/abc/add-volumes')).toBe(false)
  })

  it('does not treat a shared prefix as a child', () => {
    expect(isNavActive('/ask', '/asking')).toBe(false)
  })

  it('lights up More on mobile for pages it links to', () => {
    expect(isNavActive('/more', '/sales', { mobile: true })).toBe(true)
    expect(isNavActive('/more', '/templates/abc', { mobile: true })).toBe(true)
    expect(isNavActive('/more', '/inventory', { mobile: true })).toBe(false)
    expect(isNavActive('/more', '/sales')).toBe(false)
  })
})
