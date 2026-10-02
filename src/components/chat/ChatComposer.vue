<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { ArrowUp, Square } from 'lucide-vue-next'

/**
 * Question box. Grows with the text up to 5 lines. On a computer Enter sends and
 * Shift+Enter adds a line; on a phone Enter adds a line and the button sends.
 */
const props = defineProps<{ busy: boolean }>()
const text = defineModel<string>({ required: true })
const emit = defineEmits<{ send: [text: string]; stop: [] }>()

const box = ref<HTMLTextAreaElement | null>(null)
const touch = useMediaQuery('(pointer: coarse)')
const MAX_LINES = 5

function resize() {
  const el = box.value
  if (!el) return
  el.style.height = 'auto'
  const style = getComputedStyle(el)
  const line = parseFloat(style.lineHeight) || 24
  const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
  const borders = el.offsetHeight - el.clientHeight
  const max = line * MAX_LINES + padding + borders
  const wanted = el.scrollHeight + borders
  el.style.height = `${Math.min(wanted, max)}px`
  el.style.overflowY = wanted > max ? 'auto' : 'hidden'
}
watch(text, () => nextTick(resize))

function submit() {
  if (props.busy || !text.value.trim()) return
  emit('send', text.value.trim())
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Enter' || e.shiftKey || e.isComposing || touch.value) return
  e.preventDefault()
  submit()
}

defineExpose({ focus: () => box.value?.focus() })
</script>

<template>
  <form class="flex items-end gap-2" @submit.prevent="submit">
    <label class="min-w-0 flex-1">
      <span class="sr-only">Ask a question about the business</span>
      <textarea
        ref="box"
        v-model="text"
        rows="1"
        placeholder="Ask about sales, stock, sets…"
        class="block w-full resize-none rounded-2xl border-2 border-line bg-surface px-4 py-2.5 text-base leading-6 outline-none focus:border-primary"
        :enterkeyhint="touch ? 'enter' : 'send'"
        @keydown="onKeydown"
      />
    </label>
    <button
      v-if="busy"
      type="button"
      class="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-bg"
      aria-label="Stop the answer"
      @click="emit('stop')"
    >
      <Square class="size-4 fill-current" aria-hidden="true" />
    </button>
    <button
      v-else
      type="submit"
      class="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-ink disabled:opacity-40"
      :disabled="!text.trim()"
      aria-label="Send"
    >
      <ArrowUp class="size-5" :stroke-width="2.5" aria-hidden="true" />
    </button>
  </form>
</template>
