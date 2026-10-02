import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env and fill them in.',
  )
}

// Called when a data request (not an auth request) comes back 401, which means
// the session has expired or been revoked. main.ts registers the handler that
// signs out and sends you to /login.
let unauthorizedHandler: (() => void) | null = null

export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler
}

const fetchWithExpiryCheck: typeof fetch = async (input, init) => {
  const response = await fetch(input, init)
  if (response.status === 401 && unauthorizedHandler) {
    const requestUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    // Auth endpoints report their own errors (and sign-out itself may 401).
    if (!requestUrl.includes('/auth/v1/')) unauthorizedHandler()
  }
  return response
}

export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: fetchWithExpiryCheck,
  },
})
