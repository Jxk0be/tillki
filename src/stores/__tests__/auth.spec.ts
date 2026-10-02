import { describe, expect, it, vi } from 'vitest'

// The store module imports the Supabase client, which needs env vars; the pure
// helper under test doesn't touch it.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

const { isSafeRedirect } = await import('../auth')

describe('isSafeRedirect', () => {
  it.each(['/inventory', '/inventory/abc?status=listed', '/templates/xyz/add-volumes', '/ask/123'])(
    'allows %s',
    (path) => {
      expect(isSafeRedirect(path)).toBe(true)
    },
  )

  it.each([
    null,
    undefined,
    '',
    'inventory',
    'https://evil.example.com',
    '//evil.example.com',
    '/login',
    '/auth/callback',
    '/not-authorized',
  ])('rejects %s', (path) => {
    expect(isSafeRedirect(path)).toBe(false)
  })
})
