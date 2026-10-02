<script setup lang="ts">
import { computed } from 'vue'
import { LoaderCircle } from 'lucide-vue-next'
import { useOnline } from '@vueuse/core'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'sm'

const props = withDefaults(
  defineProps<{
    variant?: Variant
    size?: Size
    type?: 'button' | 'submit' | 'reset'
    loading?: boolean
    disabled?: boolean
    block?: boolean
  }>(),
  { variant: 'primary', size: 'md', type: 'button', loading: false, disabled: false, block: false },
)

// Save buttons (type="submit") wait while the network is down; nothing is cached offline.
const online = useOnline()
const offlineBlocked = computed(() => props.type === 'submit' && !online.value)

const variantClasses: Record<Variant, string> = {
  primary: 'bg-primary text-primary-ink hover:opacity-90',
  secondary: 'border-2 border-ink/80 bg-surface text-ink hover:bg-surface-2',
  ghost: 'text-ink hover:bg-surface-2',
  danger: 'bg-danger text-white hover:opacity-90 dark:text-bg',
}

const classes = computed(() => [
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition select-none',
  'disabled:cursor-not-allowed disabled:opacity-50',
  props.size === 'md' ? 'min-h-11 px-4 text-base' : 'min-h-11 px-3 text-sm',
  props.block ? 'w-full' : '',
  variantClasses[props.variant],
])
</script>

<template>
  <button
    :type="type"
    :class="classes"
    :disabled="disabled || loading || offlineBlocked"
    :title="offlineBlocked ? 'Offline: saving is paused' : undefined"
    :aria-busy="loading || undefined"
  >
    <LoaderCircle v-if="loading" class="size-5 animate-spin" aria-hidden="true" />
    <slot />
  </button>
</template>
