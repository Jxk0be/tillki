<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ShieldX } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

/** A signed-in account that isn't one of ours. Shows no data, only a way out. */
const auth = useAuthStore()
const router = useRouter()
const toast = useToast()
const busy = ref(false)
const checking = ref(false)

async function signOut() {
  busy.value = true
  try {
    await auth.signOut()
    await router.replace({ name: 'login' })
  } catch {
    toast.error("Couldn't sign out. Check your connection and try again.")
  } finally {
    busy.value = false
  }
}

// If the profile couldn't load (e.g. a network blip), let them check again.
async function checkAgain() {
  checking.value = true
  await auth.refreshProfile()
  checking.value = false
  if (auth.isAdmin) await router.replace(auth.takeRedirect() ?? { name: 'inventory' })
}
</script>

<template>
  <div class="m-auto flex w-full max-w-sm flex-col items-center py-12 text-center">
    <div class="mb-4 grid size-16 place-items-center rounded-2xl bg-surface-2 text-ink-2">
      <ShieldX class="size-8" aria-hidden="true" />
    </div>
    <h1 class="text-2xl font-black">No access</h1>
    <p class="mt-2 text-ink-2">This Google account doesn't have access to Tillki.</p>
    <p v-if="auth.email" class="mt-4 rounded-lg bg-surface-2 px-3 py-2 font-medium break-all">
      Signed in as {{ auth.email }}
    </p>

    <div class="mt-8 flex w-full flex-col gap-2">
      <BaseButton block :loading="busy" @click="signOut">Sign out</BaseButton>
      <BaseButton
        v-if="auth.profileError"
        block
        variant="ghost"
        :loading="checking"
        @click="checkAgain"
      >
        Check again
      </BaseButton>
    </div>
  </div>
</template>
