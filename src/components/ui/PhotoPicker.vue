<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  ArrowDown,
  ArrowUp,
  Camera,
  CircleAlert,
  ImagePlus,
  LoaderCircle,
  X,
} from 'lucide-vue-next'
import { MAX_PHOTOS, type PhotoEntry, type PhotoList } from '@/composables/usePhotos'
import { useSignedUrls } from '@/composables/useSignedUrls'

/**
 * Up to 5 photos: "Take photo" (rear camera) or "Choose photos". New photos
 * preview instantly and are compressed on the device; the first one is the
 * cover. Reorder by dragging (desktop) or the arrow buttons (mobile).
 * Uploading happens when the form saves (see uploadPhotos).
 */
const props = withDefaults(
  defineProps<{
    label?: string
    hint?: string
    /** Shown as the current cover when there are no photos (a set volume's set photo). */
    fallbackCoverPath?: string | null
    /** The form's photo list (usePhotoList). */
    list: PhotoList
  }>(),
  { label: 'Photos', hint: '', fallbackCoverPath: null },
)
const photos = computed(() => props.list.photos.value)

const { request, urlFor } = useSignedUrls()
watch(
  () => [...photos.value.map((p) => p.path), props.fallbackCoverPath],
  (paths) => void request(paths),
  { immediate: true },
)

const message = ref<string | null>(null)
const cameraInput = ref<HTMLInputElement | null>(null)
const libraryInput = ref<HTMLInputElement | null>(null)
const remaining = computed(() => MAX_PHOTOS - photos.value.length)

function addFiles(list: FileList | null) {
  message.value = null
  const files = [...(list ?? [])].filter((f) => f.type.startsWith('image/') || f.type === '')
  if (files.length === 0) return
  if (remaining.value <= 0) {
    message.value = `You can add up to ${MAX_PHOTOS} photos. Remove one to add another.`
    return
  }
  const leftOut = props.list.add(files)
  if (leftOut > 0) {
    message.value = `Only ${MAX_PHOTOS} photos are allowed, so ${leftOut} weren't added.`
  }
}

function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  addFiles(input.files)
  input.value = ''
}

function remove(key: string) {
  props.list.remove(key)
  message.value = null
}

function move(index: number, delta: number) {
  props.list.move(index, delta)
}

// Desktop drag to reorder.
const dragIndex = ref<number | null>(null)
function onDrop(index: number) {
  if (dragIndex.value === null || dragIndex.value === index) return
  move(dragIndex.value, index - dragIndex.value)
  dragIndex.value = null
}

function preview(entry: PhotoEntry) {
  return entry.previewUrl ?? urlFor(entry.path)
}
</script>

<template>
  <fieldset>
    <legend class="text-sm font-semibold text-ink-2">{{ label }}</legend>
    <p v-if="hint" class="mt-0.5 text-sm text-muted">{{ hint }}</p>

    <ul v-if="photos.length" class="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label="Photos">
      <li
        v-for="(photo, i) in photos"
        :key="photo.key"
        class="relative aspect-square overflow-hidden rounded-xl bg-surface-2"
        :class="{ 'ring-2 ring-primary': dragIndex === i }"
        draggable="true"
        @dragstart="dragIndex = i"
        @dragend="dragIndex = null"
        @dragover.prevent
        @drop.prevent="onDrop(i)"
      >
        <img
          v-if="preview(photo)"
          :src="preview(photo) ?? undefined"
          :alt="`Photo ${i + 1}`"
          class="size-full object-cover"
          draggable="false"
        />
        <span
          v-if="i === 0"
          class="absolute top-1 left-1 rounded-full bg-black/65 px-1.5 text-[11px] leading-5 font-semibold text-white"
          >Cover</span
        >

        <div
          v-if="photo.state === 'compressing'"
          class="absolute inset-0 grid place-items-center bg-black/40 text-white"
          role="status"
        >
          <LoaderCircle class="size-6 animate-spin" aria-label="Preparing photo" />
        </div>
        <div
          v-else-if="photo.state === 'uploading'"
          class="absolute inset-x-1 bottom-1 h-1.5 overflow-hidden rounded-full bg-black/40"
          role="progressbar"
          :aria-valuenow="Math.round(photo.progress * 100)"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-label="Uploading"
        >
          <div
            class="h-full bg-white transition-[width]"
            :style="{ width: `${photo.progress * 100}%` }"
          />
        </div>
        <div
          v-else-if="photo.state === 'failed'"
          class="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-danger/80 p-1 text-center text-[11px] font-semibold text-white"
          role="alert"
        >
          <CircleAlert class="size-5" aria-hidden="true" />
          {{ photo.error ?? 'Upload failed' }}
        </div>

        <button
          type="button"
          class="absolute top-1 right-1 grid size-8 place-items-center rounded-full bg-black/65 text-white"
          :aria-label="`Remove photo ${i + 1}`"
          @click="remove(photo.key)"
        >
          <X class="size-4" aria-hidden="true" />
        </button>
        <div class="absolute right-1 bottom-1 flex gap-1">
          <button
            v-if="i > 0"
            type="button"
            class="grid size-8 place-items-center rounded-full bg-black/65 text-white"
            :aria-label="`Move photo ${i + 1} earlier`"
            @click="move(i, -1)"
          >
            <ArrowUp class="size-4 -rotate-90 sm:rotate-0" aria-hidden="true" />
          </button>
          <button
            v-if="i < photos.length - 1"
            type="button"
            class="grid size-8 place-items-center rounded-full bg-black/65 text-white"
            :aria-label="`Move photo ${i + 1} later`"
            @click="move(i, 1)"
          >
            <ArrowDown class="size-4 -rotate-90 sm:rotate-0" aria-hidden="true" />
          </button>
        </div>
      </li>
    </ul>

    <div
      v-else-if="fallbackCoverPath"
      class="mt-2 flex items-center gap-3 rounded-xl border border-dashed border-line p-2"
    >
      <img
        v-if="urlFor(fallbackCoverPath)"
        :src="urlFor(fallbackCoverPath) ?? undefined"
        alt="Set photo"
        class="size-16 rounded-lg object-cover"
      />
      <p class="text-sm text-ink-2">
        Using the set photo as the cover. Add photos of this copy to replace it.
      </p>
    </div>

    <div class="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        class="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 font-semibold text-primary-ink disabled:opacity-50"
        :disabled="remaining <= 0"
        @click="cameraInput?.click()"
      >
        <Camera class="size-5" aria-hidden="true" /> Take photo
      </button>
      <button
        type="button"
        class="inline-flex min-h-11 items-center gap-2 rounded-lg border-2 border-line bg-surface px-4 font-semibold disabled:opacity-50"
        :disabled="remaining <= 0"
        @click="libraryInput?.click()"
      >
        <ImagePlus class="size-5" aria-hidden="true" /> Choose photos
      </button>
      <span class="self-center text-sm text-muted">{{ photos.length }} / {{ MAX_PHOTOS }}</span>
    </div>
    <p v-if="message" class="mt-2 text-sm font-medium text-danger" role="alert">{{ message }}</p>

    <input
      ref="cameraInput"
      type="file"
      accept="image/*"
      capture="environment"
      class="sr-only"
      tabindex="-1"
      aria-hidden="true"
      @change="onPick"
    />
    <input
      ref="libraryInput"
      type="file"
      accept="image/*"
      multiple
      class="sr-only"
      tabindex="-1"
      aria-hidden="true"
      @change="onPick"
    />
  </fieldset>
</template>
