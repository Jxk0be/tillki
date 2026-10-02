<script setup lang="ts">
import { computed } from 'vue'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-vue-next'

/** One headline number with its change vs an earlier period (arrow + text, not color alone). */
const props = withDefaults(
  defineProps<{
    label: string
    value: string
    /** Whole percent change, or null when there's nothing to compare with. */
    change?: number | null
    /** e.g. "vs previous 30 days" */
    changeLabel?: string
    /** Whether a rise is good news (false for days to sell). */
    upIsGood?: boolean
    hint?: string
    loading?: boolean
  }>(),
  { change: null, changeLabel: '', upIsGood: true, hint: undefined, loading: false },
)

const tone = computed(() => {
  if (props.change === null || props.change === 0) return 'text-ink-2'
  return props.change > 0 === props.upIsGood ? 'text-success' : 'text-danger'
})
const icon = computed(() =>
  props.change === null || props.change === 0
    ? Minus
    : props.change > 0
      ? ArrowUpRight
      : ArrowDownRight,
)
const changeText = computed(() => {
  if (props.change === null) return 'No earlier data'
  if (props.change === 0) return `No change ${props.changeLabel}`
  return `${props.change > 0 ? 'Up' : 'Down'} ${Math.abs(props.change)}% ${props.changeLabel}`
})
</script>

<template>
  <div class="min-w-0 rounded-2xl border border-line bg-surface p-3 sm:p-4">
    <p class="truncate text-sm text-ink-2">{{ label }}</p>
    <template v-if="loading">
      <div class="mt-1 h-7 w-24 animate-pulse rounded bg-surface-2" />
      <div class="mt-2 h-4 w-28 animate-pulse rounded bg-surface-2" />
    </template>
    <template v-else>
      <p class="mt-0.5 truncate text-xl font-bold tabular-nums sm:text-2xl">{{ value }}</p>
      <p class="mt-1 flex items-start gap-1 text-xs font-medium" :class="tone">
        <component :is="icon" class="mt-px size-3.5 shrink-0" aria-hidden="true" />
        <span>{{ changeText }}</span>
      </p>
      <p v-if="hint" class="mt-0.5 text-xs text-muted">{{ hint }}</p>
    </template>
  </div>
</template>
