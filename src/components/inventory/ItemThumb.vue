<script setup lang="ts">
import { computed } from 'vue'
import { ImageOff, Library } from 'lucide-vue-next'
import { useSignedUrls } from '@/composables/useSignedUrls'

/**
 * Square cover photo. The parent requests signed URLs in one batch; this just
 * reads them. A set volume without its own photo shows the set's photo with a
 * "Set photo" label (a small corner icon on the tiny table thumbnails).
 */
const props = withDefaults(
  defineProps<{
    path: string | null
    source?: 'item' | 'template' | null
    size?: 'sm' | 'md' | 'lg'
    alt?: string
  }>(),
  { source: null, size: 'md', alt: '' },
)

const { urlFor } = useSignedUrls()
const url = computed(() => urlFor(props.path))
const sizeClass = computed(() => ({ sm: 'size-10', md: 'size-16', lg: 'size-20' })[props.size])
</script>

<template>
  <div class="relative shrink-0 overflow-hidden rounded-lg bg-surface-2" :class="sizeClass">
    <img v-if="url" :src="url" :alt="alt" class="size-full object-cover" loading="lazy" />
    <div v-else class="grid size-full place-items-center text-muted" aria-hidden="true">
      <ImageOff class="size-5" />
    </div>
    <template v-if="url && source === 'template'">
      <span
        v-if="size === 'sm'"
        class="absolute right-0.5 bottom-0.5 grid size-4 place-items-center rounded bg-black/70 text-white"
        title="Set photo"
      >
        <Library class="size-3" aria-hidden="true" />
        <span class="sr-only">Set photo</span>
      </span>
      <span
        v-else
        class="absolute inset-x-0 bottom-0 bg-black/60 text-center text-[10px] leading-4 font-semibold text-white"
      >
        Set photo
      </span>
    </template>
  </div>
</template>
