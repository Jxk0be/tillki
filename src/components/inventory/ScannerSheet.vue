<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useScrollLock } from '@vueuse/core'
import { Flashlight, FlashlightOff, X } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useBarcodeScanner } from '@/composables/useBarcodeScanner'
import { normalizeIsbn } from '@/lib/isbn'

/** Full-screen camera for scanning a book's barcode, with a type-it-in fallback. */
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ isbn: [isbn: string] }>()

const video = ref<HTMLVideoElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
const manual = ref('')
const manualError = ref('')
const scrollLocked = useScrollLock(typeof document !== 'undefined' ? document.body : null)

const scanner = useBarcodeScanner(video, (isbn) => {
  open.value = false
  emit('isbn', isbn)
})

watch(open, async (isOpen) => {
  scrollLocked.value = isOpen
  if (isOpen) {
    manual.value = ''
    manualError.value = ''
    await nextTick()
    closeButton.value?.focus()
    await scanner.start()
  } else {
    scanner.stop()
  }
})

function submitManual() {
  const isbn = normalizeIsbn(manual.value)
  if (!isbn) {
    manualError.value = "That isn't a valid ISBN. Check the 13 digits under the barcode."
    return
  }
  open.value = false
  emit('isbn', isbn)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[80] flex flex-col bg-black pt-safe pb-safe text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Scan a barcode"
      @keydown.esc="open = false"
    >
      <div class="flex items-center justify-between p-2">
        <p class="px-2 font-semibold">Scan the barcode on the back</p>
        <div class="flex gap-1">
          <button
            v-if="scanner.torchAvailable.value"
            type="button"
            class="grid size-11 place-items-center rounded-full hover:bg-white/10"
            :aria-label="scanner.torchOn.value ? 'Turn off the light' : 'Turn on the light'"
            :aria-pressed="scanner.torchOn.value"
            @click="scanner.toggleTorch()"
          >
            <FlashlightOff v-if="scanner.torchOn.value" class="size-6" aria-hidden="true" />
            <Flashlight v-else class="size-6" aria-hidden="true" />
          </button>
          <button
            ref="closeButton"
            type="button"
            class="grid size-11 place-items-center rounded-full hover:bg-white/10"
            aria-label="Close scanner"
            @click="open = false"
          >
            <X class="size-6" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div class="relative min-h-0 flex-1 overflow-hidden">
        <video ref="video" class="size-full object-cover" playsinline muted aria-hidden="true" />
        <div class="pointer-events-none absolute inset-0 grid place-items-center">
          <div
            class="h-32 w-[80%] max-w-sm rounded-2xl border-4 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
          />
        </div>
        <p
          v-if="scanner.error.value"
          class="absolute inset-x-4 top-4 rounded-xl bg-black/80 p-3 text-sm"
          role="alert"
        >
          {{ scanner.error.value }}
        </p>
      </div>

      <form class="flex items-start gap-2 bg-black p-3" novalidate @submit.prevent="submitManual">
        <div class="flex-1">
          <label for="manual-isbn" class="sr-only">Type the ISBN</label>
          <input
            id="manual-isbn"
            v-model="manual"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            placeholder="Or type the ISBN"
            class="min-h-11 w-full rounded-lg border-2 border-white/30 bg-white/10 px-3 text-base text-white outline-none placeholder:text-white/60 focus:border-white"
            :aria-invalid="manualError ? true : undefined"
            aria-describedby="manual-isbn-error"
          />
          <p v-if="manualError" id="manual-isbn-error" class="mt-1 text-sm text-[#f59a96]">
            {{ manualError }}
          </p>
        </div>
        <BaseButton type="submit">Look up</BaseButton>
      </form>
    </div>
  </Teleport>
</template>
