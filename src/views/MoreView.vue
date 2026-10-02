<script setup lang="ts">
import { ChevronRight, LogOut } from 'lucide-vue-next'
import { secondaryNav } from '@/layouts/navigation'
import { useToast } from '@/composables/useToast'

const toast = useToast()

function signOut() {
  toast.show('Sign-in arrives in step 4.')
}
</script>

<template>
  <div class="mx-auto max-w-xl lg:mx-0">
    <ul class="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      <li v-for="item in secondaryNav" :key="item.to">
        <RouterLink
          :to="item.to"
          class="flex min-h-14 items-center gap-3 px-4 font-medium hover:bg-surface-2"
        >
          <component :is="item.icon" class="size-5 text-ink-2" aria-hidden="true" />
          <span class="flex-1">{{ item.label }}</span>
          <ChevronRight class="size-5 text-muted" aria-hidden="true" />
        </RouterLink>
      </li>
    </ul>

    <button
      type="button"
      class="mt-6 flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 font-semibold text-danger hover:bg-surface-2"
      @click="signOut"
    >
      <LogOut class="size-5" aria-hidden="true" />
      Sign out
    </button>
  </div>
</template>
