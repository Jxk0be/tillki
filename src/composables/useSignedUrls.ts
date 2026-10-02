import { reactive } from 'vue'
import { supabase } from '@/lib/supabase'

/** Signed URLs are valid this long. */
const LIFETIME_SECONDS = 60 * 60
/** Refresh a URL when it has less than this left. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000

interface CachedUrl {
  url: string
  expiresAt: number
}

// Shared across the app so the same photo is only signed once.
const cache = reactive(new Map<string, CachedUrl>())
const pending = new Set<string>()

/**
 * Signed URLs for photos in a private bucket. Call request() with the paths a
 * page needs (one batched request), then read urlFor(path) in the template; it
 * fills in reactively when the URLs arrive.
 */
export function useSignedUrls(bucket = 'item-images') {
  const keyOf = (path: string) => `${bucket}/${path}`

  async function request(paths: readonly (string | null | undefined)[]) {
    const now = Date.now()
    const needed = [
      ...new Set(paths.filter((p): p is string => typeof p === 'string' && p !== '')),
    ].filter((p) => {
      const key = keyOf(p)
      const cached = cache.get(key)
      return !pending.has(key) && (!cached || cached.expiresAt - REFRESH_MARGIN_MS < now)
    })
    if (needed.length === 0) return

    needed.forEach((p) => pending.add(keyOf(p)))
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrls(needed, LIFETIME_SECONDS)
      if (error || !data) return
      const expiresAt = now + LIFETIME_SECONDS * 1000
      for (const entry of data) {
        if (entry.path && entry.signedUrl)
          cache.set(keyOf(entry.path), { url: entry.signedUrl, expiresAt })
      }
    } finally {
      needed.forEach((p) => pending.delete(keyOf(p)))
    }
  }

  function urlFor(path: string | null | undefined): string | null {
    if (!path) return null
    const cached = cache.get(keyOf(path))
    return cached && cached.expiresAt - 60_000 > Date.now() ? cached.url : null
  }

  return { request, urlFor }
}
