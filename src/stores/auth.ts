import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

export type Profile = Tables<'profiles'>

/** Where to go after Google sends you back (survives the redirect to Google). */
const REDIRECT_KEY = 'kura-after-sign-in'

/** Only same-app paths, never the auth pages themselves. */
export function isSafeRedirect(path: string | null | undefined): path is string {
  return (
    typeof path === 'string' &&
    path.startsWith('/') &&
    !path.startsWith('//') &&
    !path.startsWith('/login') &&
    !path.startsWith('/auth/') &&
    !path.startsWith('/not-authorized')
  )
}

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const profile = ref<Profile | null>(null)
  const loading = ref(true)
  const profileError = ref<string | null>(null)

  const user = computed(() => session.value?.user ?? null)
  const isAdmin = computed(() => profile.value?.role === 'admin')
  const email = computed(() => profile.value?.email ?? user.value?.email ?? '')
  const displayName = computed(() => {
    const meta = user.value?.user_metadata
    const fromMeta = typeof meta?.full_name === 'string' ? meta.full_name : null
    return profile.value?.display_name ?? fromMeta ?? email.value.split('@')[0] ?? ''
  })
  const avatarUrl = computed(() => {
    const meta = user.value?.user_metadata
    const fromMeta = typeof meta?.avatar_url === 'string' ? meta.avatar_url : null
    return profile.value?.avatar_url ?? fromMeta
  })

  let initPromise: Promise<void> | null = null

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    if (error) {
      profileError.value = error.message
      profile.value = null
      return
    }
    profileError.value = null
    profile.value = data
  }

  /** Re-fetch the signed-in user's profile (e.g. right after sign-in). */
  async function refreshProfile() {
    if (session.value) await loadProfile(session.value.user.id)
  }

  /**
   * Loads the current session and profile once, and keeps them in sync with
   * Supabase Auth. The router waits for this before the first navigation.
   */
  function init() {
    initPromise ??= (async () => {
      // getSession also finishes the PKCE code exchange when we land on /auth/callback.
      const { data } = await supabase.auth.getSession()
      session.value = data.session
      if (data.session) await loadProfile(data.session.user.id)

      supabase.auth.onAuthStateChange((_event, next) => {
        const previousUserId = session.value?.user.id
        session.value = next
        if (!next) {
          profile.value = null
          return
        }
        if (next.user.id !== previousUserId) {
          // Don't await Supabase calls inside this callback (it can deadlock the client).
          setTimeout(() => void loadProfile(next.user.id), 0)
        }
      })

      loading.value = false
    })()
    return initPromise
  }

  function rememberRedirect(path: string) {
    if (!isSafeRedirect(path)) return
    try {
      sessionStorage.setItem(REDIRECT_KEY, path)
    } catch {
      // Storage blocked: you'll land on /inventory instead.
    }
  }

  /** The page you were trying to reach before signing in, once. */
  function takeRedirect(): string | null {
    try {
      const path = sessionStorage.getItem(REDIRECT_KEY)
      sessionStorage.removeItem(REDIRECT_KEY)
      return isSafeRedirect(path) ? path : null
    } catch {
      return null
    }
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // Always show the account picker so switching between our two accounts is easy.
        queryParams: { prompt: 'select_account' },
      },
    })
    if (error) throw error
  }

  /** Signs out on this device only (the other person's sessions are untouched). */
  async function signOut() {
    await supabase.auth.signOut({ scope: 'local' })
    session.value = null
    profile.value = null
  }

  return {
    session,
    profile,
    loading,
    profileError,
    user,
    isAdmin,
    email,
    displayName,
    avatarUrl,
    init,
    refreshProfile,
    rememberRedirect,
    takeRedirect,
    signInWithGoogle,
    signOut,
  }
})
