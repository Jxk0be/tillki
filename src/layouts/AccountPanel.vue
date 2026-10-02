<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { LogOut } from 'lucide-vue-next'
import ThemeToggle from '@/components/ui/ThemeToggle.vue'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

/** Who's signed in, the theme switch, and sign out. Used in the avatar sheet and on /more. */
const emit = defineEmits<{ 'signed-out': [] }>()

const auth = useAuthStore()
const router = useRouter()
const toast = useToast()
const signingOut = ref(false)

async function signOut() {
  signingOut.value = true
  try {
    await auth.signOut()
    emit('signed-out')
    await router.push({ name: 'login' })
    toast.show('Signed out.')
  } catch {
    toast.error("Couldn't sign out. Check your connection and try again.")
  } finally {
    signingOut.value = false
  }
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-center gap-3">
      <UserAvatar :src="auth.avatarUrl" :name="auth.displayName" size="lg" />
      <div class="min-w-0">
        <p class="truncate text-lg font-bold">{{ auth.displayName }}</p>
        <p class="truncate text-ink-2">{{ auth.email }}</p>
      </div>
    </div>

    <ThemeToggle />

    <button
      type="button"
      class="flex min-h-11 w-full items-center gap-3 rounded-lg px-1 font-semibold text-danger disabled:opacity-60"
      :disabled="signingOut"
      @click="signOut"
    >
      <LogOut class="size-5" aria-hidden="true" />
      {{ signingOut ? 'Signing out…' : 'Sign out' }}
    </button>
  </div>
</template>
