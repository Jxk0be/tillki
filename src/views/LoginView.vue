<script setup lang="ts">
import { ref } from 'vue'
import GoogleSignInButton from '@/components/ui/GoogleSignInButton.vue'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

const auth = useAuthStore()
const toast = useToast()
const redirecting = ref(false)

async function continueWithGoogle() {
  redirecting.value = true
  try {
    // Leaves the page for Google; we come back on /auth/callback.
    await auth.signInWithGoogle()
  } catch {
    redirecting.value = false
    toast.error("Couldn't reach Google sign-in. Check your connection and try again.")
  }
}
</script>

<template>
  <div class="m-auto flex w-full max-w-sm flex-col items-center py-12 text-center">
    <div
      class="mb-5 grid size-20 rotate-[-4deg] place-items-center rounded-xl border-[3px] border-accent text-5xl font-black text-accent"
      aria-hidden="true"
    >
      蔵
    </div>
    <h1 class="text-4xl font-black tracking-tight">Tillki</h1>
    <p class="mt-2 text-ink-2">Inventory and profit for our manga and merch shop.</p>

    <div class="mt-10 w-full">
      <GoogleSignInButton :loading="redirecting" @click="continueWithGoogle" />
    </div>
  </div>
</template>
