<script setup lang="ts">
import { onMounted } from 'vue'
import { ChevronRight, Clock, Receipt, Scale } from 'lucide-vue-next'
import { useAppSettings } from '@/composables/useAppSettings'
import { useStaleBadge } from '@/composables/useStale'

/** The extras: deal checker, stale stock, taxes and exports. */
const settings = useAppSettings()
const stale = useStaleBadge()
onMounted(async () => {
  await settings.ready
  void stale.refresh(settings.staleDays.value)
})

const tools = [
  {
    to: '/tools/deal',
    icon: Scale,
    title: 'Deal checker',
    text: 'Should we buy this lot? Checks the price against how similar stock has sold for us.',
  },
  {
    to: '/tools/stale',
    icon: Clock,
    title: 'Stale stock',
    text: 'Items sitting longer than your limit, with quick price drops, bundling and write-offs.',
  },
  {
    to: '/tools/taxes',
    icon: Receipt,
    title: 'Taxes and exports',
    text: 'A printable yearly summary and CSVs of items, sales, expenses and lots.',
  },
]
</script>

<template>
  <ul class="mx-auto max-w-2xl space-y-3 lg:mx-0">
    <li v-for="t in tools" :key="t.to">
      <RouterLink
        :to="t.to"
        class="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 hover:bg-surface-2"
      >
        <span class="grid size-12 shrink-0 place-items-center rounded-xl bg-surface-2">
          <component :is="t.icon" class="size-6" aria-hidden="true" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-2 font-bold">
            {{ t.title }}
            <span
              v-if="t.to === '/tools/stale' && stale.count.value"
              class="rounded-full bg-accent px-2 text-xs font-bold text-white"
              >{{ stale.count.value }}</span
            >
          </span>
          <span class="block text-sm text-ink-2">{{ t.text }}</span>
        </span>
        <ChevronRight class="size-5 shrink-0 text-muted" aria-hidden="true" />
      </RouterLink>
    </li>
  </ul>
</template>
