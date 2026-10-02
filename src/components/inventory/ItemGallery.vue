<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useScrollLock } from '@vueuse/core'
import { ChevronLeft, ChevronRight, ImageOff, X } from 'lucide-vue-next'
import { useSignedUrls } from '@/composables/useSignedUrls'
import type { GalleryImage } from '@/composables/useItemDetail'

/**
 * Swipeable photos (CSS scroll-snap) with dots. Tap a photo to see it full
 * screen, where pinch zoom works. Set photos are labeled.
 */
const props = defineProps<{ images: GalleryImage[]; alt: string }>()

const { request, urlFor } = useSignedUrls()
watch(
  () => props.images,
  (imgs) => void request(imgs.map((i) => i.path)),
  { immediate: true },
)

const track = ref<HTMLElement | null>(null)
const index = ref(0)
const fullscreen = ref(false)
const closeButton = ref<HTMLButtonElement | null>(null)
const scrollLocked = useScrollLock(typeof document !== 'undefined' ? document.body : null)
let returnFocus: HTMLElement | null = null

const current = computed(() => props.images[index.value])

function onScroll() {
  const el = track.value
  if (!el || el.clientWidth === 0) return
  index.value = Math.round(el.scrollLeft / el.clientWidth)
}

function goTo(i: number) {
  const el = track.value
  index.value = Math.max(0, Math.min(props.images.length - 1, i))
  el?.scrollTo({ left: index.value * el.clientWidth, behavior: 'smooth' })
}

async function openFullscreen(i: number) {
  index.value = i
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  fullscreen.value = true
  scrollLocked.value = true
  await nextTick()
  closeButton.value?.focus()
}

function closeFullscreen() {
  fullscreen.value = false
  scrollLocked.value = false
  goTo(index.value)
  returnFocus?.focus()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeFullscreen()
  else if (e.key === 'ArrowRight') index.value = Math.min(props.images.length - 1, index.value + 1)
  else if (e.key === 'ArrowLeft') index.value = Math.max(0, index.value - 1)
}
</script>

<template>
  <div>
    <div
      v-if="images.length === 0"
      class="grid aspect-square w-full place-items-center rounded-2xl bg-surface-2 text-muted sm:aspect-[4/3]"
    >
      <span class="flex flex-col items-center gap-2 text-sm">
        <ImageOff class="size-8" aria-hidden="true" /> No photos yet
      </span>
    </div>

    <template v-else>
      <div
        ref="track"
        class="flex snap-x snap-mandatory overflow-x-auto rounded-2xl bg-surface-2 [scrollbar-width:none]"
        tabindex="0"
        :aria-label="`${alt} photos`"
        @scroll.passive="onScroll"
      >
        <button
          v-for="(img, i) in images"
          :key="img.path"
          type="button"
          class="relative aspect-square w-full shrink-0 snap-center sm:aspect-[4/3]"
          :aria-label="`View photo ${i + 1} of ${images.length} full screen`"
          @click="openFullscreen(i)"
        >
          <img
            v-if="urlFor(img.path)"
            :src="urlFor(img.path) ?? undefined"
            :alt="`${alt}, photo ${i + 1}`"
            class="size-full object-contain"
            :loading="i === 0 ? 'eager' : 'lazy'"
          />
          <span
            v-if="img.fromSet"
            class="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white"
            >Set photo</span
          >
        </button>
      </div>
      <div v-if="images.length > 1" class="mt-2 flex justify-center gap-1">
        <button
          v-for="(img, i) in images"
          :key="img.path"
          type="button"
          class="grid size-6 place-items-center"
          :aria-label="`Show photo ${i + 1}`"
          :aria-current="i === index"
          @click="goTo(i)"
        >
          <span class="size-2 rounded-full" :class="i === index ? 'bg-ink' : 'bg-line'" />
        </button>
      </div>
    </template>

    <Teleport to="body">
      <div
        v-if="fullscreen && current"
        class="fixed inset-0 z-[80] flex flex-col bg-black pt-safe pb-safe"
        role="dialog"
        aria-modal="true"
        :aria-label="`${alt} photo ${index + 1} of ${images.length}`"
        @keydown="onKeydown"
      >
        <div class="flex items-center justify-between p-2 text-white">
          <span class="px-2 text-sm">
            {{ index + 1 }} / {{ images.length
            }}<template v-if="current.fromSet"> · Set photo</template>
          </span>
          <button
            ref="closeButton"
            type="button"
            class="grid size-11 place-items-center rounded-full hover:bg-white/10"
            aria-label="Close"
            @click="closeFullscreen"
          >
            <X class="size-6" aria-hidden="true" />
          </button>
        </div>
        <div class="relative flex-1 overflow-auto [touch-action:pinch-zoom]">
          <img
            v-if="urlFor(current.path)"
            :src="urlFor(current.path) ?? undefined"
            :alt="`${alt}, photo ${index + 1}`"
            class="mx-auto h-full w-full object-contain"
          />
        </div>
        <div v-if="images.length > 1" class="flex justify-between p-2">
          <button
            type="button"
            class="grid size-12 place-items-center rounded-full text-white hover:bg-white/10 disabled:opacity-30"
            :disabled="index === 0"
            aria-label="Previous photo"
            @click="index--"
          >
            <ChevronLeft class="size-7" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="grid size-12 place-items-center rounded-full text-white hover:bg-white/10 disabled:opacity-30"
            :disabled="index === images.length - 1"
            aria-label="Next photo"
            @click="index++"
          >
            <ChevronRight class="size-7" aria-hidden="true" />
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
