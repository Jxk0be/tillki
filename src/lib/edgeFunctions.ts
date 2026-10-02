import { supabase } from './supabase'

/**
 * Calls one of our Edge Functions as the signed-in user and returns its JSON.
 * Throws an Error with the function's own readable message when it fails.
 */
export async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Your session has expired. Sign in again.')
  let response: Response
  try {
    response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error("Couldn't reach Tillki. Check your connection.")
  }
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null
  if (!response.ok || !payload)
    throw new Error(payload?.error ?? `Something went wrong (${response.status}).`)
  return payload
}
