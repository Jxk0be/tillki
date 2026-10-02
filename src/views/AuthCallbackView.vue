<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { CircleAlert, LoaderCircle } from 'lucide-vue-next'
import GoogleSignInButton from '@/components/ui/GoogleSignInButton.vue'
import { useAuthStore } from '@/stores/auth'

/**
 * Google sends you back here. The Supabase client finishes the PKCE code
 * exchange on load; we wait for it, load the profile, and move on.
 */
const auth = useAuthStore()
const router = useRouter()
const error = ref<string | null>(null)
const retrying = ref(false)

/** Errors come back as ?error_description=... (or in the #hash for some flows). */
function errorFromUrl(): string | null {
  const query = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const description = query.get('error_description') ?? hash.get('error_description')
  const code = query.get('error') ?? hash.get('error')
  if (!description && !code) return null
  const text = (description ?? code ?? '').replace(/\+/g, ' ')
  if (/not allowed|isn.t allowed|403/i.test(text)) {
    return "This Google account isn't allowed to use Tillki. Sign in with one of the two shop accounts."
  }
  if (/access_denied|cancel/i.test(text)) return 'Sign-in was cancelled.'
  return text
}

onMounted(async () => {
  const fromUrl = errorFromUrl()
  if (fromUrl) {
    error.value = fromUrl
    return
  }

  await auth.init()
  if (!auth.session) {
    error.value = "Sign-in didn't finish. The link may have expired, so start again."
    return
  }

  await auth.refreshProfile()
  if (!auth.isAdmin) {
    await router.replace({ name: 'not-authorized' })
    return
  }
  await router.replace(auth.takeRedirect() ?? { name: 'inventory' })
})

async function tryAgain() {
  retrying.value = true
  try {
    await auth.signInWithGoogle()
  } catch {
    retrying.value = false
    error.value = "Couldn't reach Google sign-in. Check your connection and try again."
  }
}
</script>

<template>
  <div class="m-auto flex w-full max-w-sm flex-col items-center py-12 text-center">
    <template v-if="error">
      <div class="mb-4 grid size-16 place-items-center rounded-2xl bg-surface-2 text-danger">
        <CircleAlert class="size-8" aria-hidden="true" />
      </div>
      <h1 class="text-2xl font-black">Couldn't sign you in</h1>
      <p class="mt-2 text-ink-2" role="alert">{{ error }}</p>
      <div class="mt-8 w-full">
        <GoogleSignInButton :loading="retrying" @click="tryAgain" />
      </div>
      <RouterLink to="/login" class="mt-4 font-semibold text-primary underline underline-offset-4">
        Back to sign in
      </RouterLink>
    </template>

    <div v-else class="flex flex-col items-center gap-3" role="status">
      <LoaderCircle class="size-8 animate-spin text-muted" aria-hidden="true" />
      <p class="text-ink-2">Signing you in…</p>
    </div>
  </div>
</template>
