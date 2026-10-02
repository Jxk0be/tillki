<script setup lang="ts">
import { computed, ref, watch } from 'vue'

/** Google profile photo, falling back to initials if there's none or it fails to load. */
const props = withDefaults(
  defineProps<{ src?: string | null; name?: string; size?: 'sm' | 'md' | 'lg' }>(),
  { src: null, name: '', size: 'md' },
)

const failed = ref(false)
watch(
  () => props.src,
  () => (failed.value = false),
)

const initials = computed(() => {
  const parts = props.name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? [parts[0]![0], parts[parts.length - 1]![0]] : [parts[0]?.[0]]
  return letters.filter(Boolean).join('').toUpperCase() || '?'
})

const sizeClass = computed(
  () => ({ sm: 'size-8 text-xs', md: 'size-9 text-sm', lg: 'size-14 text-lg' })[props.size],
)
</script>

<template>
  <img
    v-if="src && !failed"
    :src="src"
    alt=""
    referrerpolicy="no-referrer"
    class="shrink-0 rounded-full border-2 border-line object-cover"
    :class="sizeClass"
    @error="failed = true"
  />
  <span
    v-else
    class="grid shrink-0 place-items-center rounded-full border-2 border-line bg-surface-2 font-bold text-ink-2"
    :class="sizeClass"
    aria-hidden="true"
  >
    {{ initials }}
  </span>
</template>
