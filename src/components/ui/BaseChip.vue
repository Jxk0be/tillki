<script setup lang="ts">
import { Check } from 'lucide-vue-next'

withDefaults(defineProps<{ selected?: boolean; disabled?: boolean }>(), {
  selected: false,
  disabled: false,
})

defineEmits<{ toggle: [] }>()
</script>

<template>
  <button
    type="button"
    class="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border-2 px-4 text-sm font-semibold whitespace-nowrap transition disabled:opacity-50"
    :class="
      selected
        ? 'border-ink bg-ink text-bg'
        : 'border-line bg-surface text-ink-2 hover:border-ink-2'
    "
    :aria-pressed="selected"
    :disabled="disabled"
    @click="$emit('toggle')"
  >
    <Check v-if="selected" class="size-4" aria-hidden="true" />
    <slot />
  </button>
</template>
