<script setup lang="ts">
import { CircleAlert, CircleCheck, Info, X } from 'lucide-vue-next'
import { useToast, type ToastVariant } from '@/composables/useToast'

/** Renders the toast stack. Mounted once in App.vue; use useToast() to show toasts. */
const { toasts, dismiss } = useToast()

const icons = { info: Info, success: CircleCheck, error: CircleAlert } satisfies Record<
  ToastVariant,
  unknown
>

function runAction(id: number, onClick: () => void) {
  onClick()
  dismiss(id)
}
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:px-6"
    role="region"
    aria-label="Notifications"
  >
    <TransitionGroup
      enter-active-class="transition duration-200"
      leave-active-class="transition duration-150"
      enter-from-class="translate-y-2 opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :role="toast.variant === 'error' ? 'alert' : 'status'"
        class="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl bg-ink py-2 pr-2 pl-4 text-bg shadow-lg"
      >
        <component
          :is="icons[toast.variant]"
          class="size-5 shrink-0"
          :class="{
            'text-[#f59a96]': toast.variant === 'error',
            'text-[#a9cf98]': toast.variant === 'success',
          }"
          aria-hidden="true"
        />
        <p class="min-w-0 flex-1 py-1.5 text-sm font-medium">{{ toast.message }}</p>
        <button
          v-if="toast.action"
          type="button"
          class="min-h-11 shrink-0 rounded-lg px-3 text-sm font-bold underline-offset-2 hover:underline"
          @click="runAction(toast.id, toast.action.onClick)"
        >
          {{ toast.action.label }}
        </button>
        <button
          type="button"
          class="grid size-11 shrink-0 place-items-center rounded-lg opacity-70 hover:opacity-100"
          aria-label="Dismiss notification"
          @click="dismiss(toast.id)"
        >
          <X class="size-4" aria-hidden="true" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
