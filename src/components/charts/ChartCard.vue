<script setup lang="ts">
import { computed } from 'vue'
import { MessageCircle } from 'lucide-vue-next'

/**
 * A titled card around one chart: loading skeleton, empty state, an "Ask about
 * this" link to /ask, and horizontal scrolling inside the card when the chart
 * needs more room than the screen has (instead of squishing the bars).
 */
const props = withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    loading?: boolean
    empty?: boolean
    emptyText?: string
    /** Prefilled question for Ask Kura. */
    ask: string
    /** Minimum chart width in px; wider than the card scrolls sideways. */
    minWidth?: number
    height?: number
  }>(),
  {
    subtitle: undefined,
    loading: false,
    empty: false,
    emptyText: 'Nothing in this date range yet.',
    minWidth: 0,
    height: 260,
  },
)

const id = `chart-${Math.random().toString(36).slice(2, 9)}`
const style = computed(() => ({
  height: `${props.height}px`,
  minWidth: props.minWidth ? `${props.minWidth}px` : undefined,
}))
</script>

<template>
  <section
    class="flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-4"
    :aria-labelledby="id"
  >
    <div class="mb-3 flex items-start justify-between gap-2">
      <div class="min-w-0">
        <h2 :id="id" class="font-bold">{{ title }}</h2>
        <p v-if="subtitle" class="text-sm text-ink-2">{{ subtitle }}</p>
      </div>
      <RouterLink
        :to="{ name: 'ask', query: { q: ask } }"
        class="-mt-2 -mr-2 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-surface-2"
        :aria-label="`Ask about ${title}`"
      >
        <MessageCircle class="size-4" aria-hidden="true" />
        <span>Ask about this</span>
      </RouterLink>
    </div>

    <div
      v-if="loading"
      class="animate-pulse rounded-xl bg-surface-2"
      :style="{ height: `${height}px` }"
      aria-busy="true"
    >
      <span class="sr-only">Loading {{ title }}</span>
    </div>
    <div
      v-else-if="empty"
      class="grid place-items-center rounded-xl border border-dashed border-line px-4 text-center text-sm text-ink-2"
      :style="{ height: `${Math.min(height, 160)}px` }"
    >
      {{ emptyText }}
    </div>
    <div v-else class="-mx-4 overflow-x-auto px-4 [scrollbar-width:thin]">
      <div :style="style" class="relative">
        <slot />
      </div>
    </div>
    <slot name="footer" />
  </section>
</template>
