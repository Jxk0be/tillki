<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * Tap volume numbers to select them. Volumes we already have are marked, and
 * selecting one shows "+1" (it adds a copy instead of a new row). Shift-click
 * selects a range on desktop.
 */
const props = defineProps<{
  /** Numbers to show: 1..last. */
  last: number
  /** Volumes with copies left now. */
  owned: ReadonlySet<number>
  /** Volumes that have a row (owned, or sold out); selecting them merges. */
  existing: ReadonlySet<number>
  selected: ReadonlySet<number>
  /** Volumes above this are past the set's known total. */
  totalVolumes: number | null
}>()
const emit = defineEmits<{ change: [selected: Set<number>] }>()

const lastClicked = ref<number | null>(null)
const numbers = computed(() => Array.from({ length: props.last }, (_, i) => i + 1))

function toggle(n: number, event: MouseEvent) {
  const next = new Set(props.selected)
  if (event.shiftKey && lastClicked.value !== null && lastClicked.value !== n) {
    const select = !props.selected.has(n)
    const [lo, hi] = [Math.min(lastClicked.value, n), Math.max(lastClicked.value, n)]
    for (let v = lo; v <= hi; v++) {
      if (select) next.add(v)
      else next.delete(v)
    }
  } else if (next.has(n)) {
    next.delete(n)
  } else {
    next.add(n)
  }
  lastClicked.value = n
  emit('change', next)
}

function label(n: number) {
  const parts = [`Volume ${n}`]
  if (props.owned.has(n)) parts.push('you have it')
  else if (props.existing.has(n)) parts.push('sold out')
  if (props.selected.has(n))
    parts.push(props.existing.has(n) ? 'selected, adds another copy' : 'selected')
  return parts.join(', ')
}
</script>

<template>
  <div>
    <ul
      class="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5"
      aria-label="Volume numbers"
    >
      <li v-for="n in numbers" :key="n">
        <button
          type="button"
          class="relative grid h-11 w-full place-items-center rounded-lg border-2 text-sm font-bold tabular-nums transition select-none"
          :class="[
            selected.has(n)
              ? 'border-primary bg-primary text-primary-ink'
              : owned.has(n)
                ? 'border-ink/60 bg-surface-2 text-ink'
                : 'border-dashed border-line text-ink-2',
            totalVolumes && n > totalVolumes ? 'opacity-50' : '',
          ]"
          :aria-pressed="selected.has(n)"
          :aria-label="label(n)"
          @click="toggle(n, $event)"
        >
          {{ n }}
          <span
            v-if="selected.has(n) && existing.has(n)"
            class="absolute -top-2 -right-1.5 rounded-full border border-bg bg-accent px-1 text-[10px] leading-4 text-white"
            aria-hidden="true"
            >+1</span
          >
          <span
            v-else-if="owned.has(n) && !selected.has(n)"
            class="absolute top-0.5 right-1 size-1.5 rounded-full bg-ink"
            aria-hidden="true"
          />
        </button>
      </li>
    </ul>
    <ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Legend">
      <li class="flex items-center gap-1.5">
        <span class="size-3.5 rounded border-2 border-ink/60 bg-surface-2" aria-hidden="true" />Have
        it
      </li>
      <li class="flex items-center gap-1.5">
        <span class="size-3.5 rounded border-2 border-dashed border-line" aria-hidden="true" />Don't
        have
      </li>
      <li class="flex items-center gap-1.5">
        <span class="size-3.5 rounded bg-primary" aria-hidden="true" />Selected
      </li>
      <li class="flex items-center gap-1.5">
        <span
          class="rounded-full bg-accent px-1 text-[10px] leading-4 text-white"
          aria-hidden="true"
          >+1</span
        >Adds a copy
      </li>
    </ul>
  </div>
</template>
