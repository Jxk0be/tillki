<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import { useMediaQuery, useScrollLock } from '@vueuse/core'
import { X } from 'lucide-vue-next'

/**
 * Bottom sheet on mobile (drag the handle down or tap outside to close),
 * centered dialog from lg up. Traps focus, closes on Esc, and returns focus
 * to whatever opened it.
 */
const props = withDefaults(
  defineProps<{
    title: string
    description?: string
    /** Hide the visible title (it's still announced to screen readers). */
    hideTitle?: boolean
  }>(),
  { hideTitle: false },
)

const open = defineModel<boolean>('open', { required: true })

const isDesktop = useMediaQuery('(min-width: 1024px)')
const titleId = useId()
const descriptionId = useId()
const panel = ref<HTMLElement | null>(null)
const scrollLocked = useScrollLock(typeof document !== 'undefined' ? document.body : null)
let returnFocusTo: HTMLElement | null = null

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusables(): HTMLElement[] {
  if (!panel.value) return []
  return Array.from(panel.value.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  )
}

function close() {
  open.value = false
}

watch(
  open,
  async (isOpen) => {
    scrollLocked.value = isOpen
    if (isOpen) {
      returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
      await nextTick()
      // Focus the first field/button after the close button, else the panel itself.
      const [first, second] = focusables()
      ;(second ?? first ?? panel.value)?.focus({ preventScroll: true })
    } else {
      dragOffset.value = 0
      returnFocusTo?.focus({ preventScroll: true })
      returnFocusTo = null
    }
  },
  { immediate: false },
)

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    close()
    return
  }
  if (event.key !== 'Tab') return
  const items = focusables()
  if (items.length === 0) {
    event.preventDefault()
    return
  }
  const first = items[0]!
  const last = items[items.length - 1]!
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

// ---- drag to dismiss (mobile only) ----
const dragOffset = ref(0)
const dragging = ref(false)
let dragStartY = 0
let dragStartTime = 0

function onDragStart(event: PointerEvent) {
  if (isDesktop.value) return
  dragging.value = true
  dragStartY = event.clientY
  dragStartTime = performance.now()
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onDragMove(event: PointerEvent) {
  if (!dragging.value) return
  dragOffset.value = Math.max(0, event.clientY - dragStartY)
}

function onDragEnd() {
  if (!dragging.value) return
  dragging.value = false
  const elapsed = Math.max(1, performance.now() - dragStartTime)
  const velocity = dragOffset.value / elapsed // px per ms
  if (dragOffset.value > 120 || velocity > 0.6) {
    close()
  } else {
    dragOffset.value = 0
  }
}

const panelStyle = computed(() =>
  dragOffset.value > 0 ? { transform: `translateY(${dragOffset.value}px)` } : undefined,
)
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 z-50 bg-black/50" aria-hidden="true" @click="close" />
    </Transition>

    <Transition
      :enter-active-class="
        isDesktop ? 'transition duration-200' : 'transition duration-250 ease-out'
      "
      :leave-active-class="
        isDesktop ? 'transition duration-150' : 'transition duration-200 ease-in'
      "
      :enter-from-class="isDesktop ? 'opacity-0 scale-95' : 'translate-y-full'"
      :leave-to-class="isDesktop ? 'opacity-0 scale-95' : 'translate-y-full'"
    >
      <div
        v-if="open"
        class="pointer-events-none fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:p-6"
      >
        <div
          ref="panel"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          :aria-describedby="props.description ? descriptionId : undefined"
          tabindex="-1"
          class="pointer-events-auto flex max-h-[88dvh] w-full flex-col rounded-t-2xl bg-surface shadow-2xl outline-none lg:max-h-[85dvh] lg:max-w-lg lg:rounded-2xl"
          :class="{ 'transition-transform duration-200': !dragging }"
          :style="panelStyle"
          @keydown="onKeydown"
        >
          <!-- Drag handle + header. The whole header is the drag target on mobile. -->
          <div
            class="shrink-0 touch-none px-4 pt-2 pb-2 lg:touch-auto lg:px-6 lg:pt-5"
            @pointerdown="onDragStart"
            @pointermove="onDragMove"
            @pointerup="onDragEnd"
            @pointercancel="onDragEnd"
          >
            <div
              class="mx-auto mb-2 h-1.5 w-10 rounded-full bg-line lg:hidden"
              aria-hidden="true"
            />
            <div class="flex items-start gap-3">
              <div class="min-w-0 flex-1 pt-2">
                <h2
                  :id="titleId"
                  class="text-lg leading-tight font-bold"
                  :class="{ 'sr-only': hideTitle }"
                >
                  {{ title }}
                </h2>
                <p v-if="description" :id="descriptionId" class="mt-1 text-sm text-muted">
                  {{ description }}
                </p>
              </div>
              <button
                type="button"
                class="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-2"
                aria-label="Close"
                @pointerdown.stop
                @click="close"
              >
                <X class="size-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 lg:px-6">
            <slot />
          </div>

          <div
            v-if="$slots.footer"
            class="shrink-0 border-t border-line px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:px-6 lg:pb-5"
          >
            <slot name="footer" />
          </div>
          <div v-else class="shrink-0 pb-[env(safe-area-inset-bottom)] lg:pb-2" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
