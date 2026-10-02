<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ChevronRight, Scale } from 'lucide-vue-next'
import BaseSheet from '@/components/ui/BaseSheet.vue'
import { addChoices } from './navigation'

/** The sheet behind the Add button: one-off item, volumes of a set, or a new set. */
const open = defineModel<boolean>('open', { required: true })
const router = useRouter()

function go(to: string) {
  open.value = false
  router.push(to)
}
</script>

<template>
  <BaseSheet v-model:open="open" title="Add to inventory">
    <ul class="space-y-2">
      <li v-for="choice in addChoices" :key="choice.to">
        <button
          type="button"
          class="flex min-h-16 w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left hover:bg-surface-2"
          @click="go(choice.to)"
        >
          <span class="grid size-11 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink">
            <component :is="choice.icon" class="size-6" aria-hidden="true" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block font-bold">{{ choice.label }}</span>
            <span class="block text-sm text-ink-2">{{ choice.description }}</span>
          </span>
          <ChevronRight class="size-5 shrink-0 text-muted" aria-hidden="true" />
        </button>
      </li>
    </ul>
    <button
      type="button"
      class="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-primary hover:bg-surface-2"
      @click="go('/tools/deal')"
    >
      <Scale class="size-4" aria-hidden="true" /> Not bought yet? Check the deal first
    </button>
  </BaseSheet>
</template>
