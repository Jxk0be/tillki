<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { Copy, LoaderCircle, RotateCcw } from 'lucide-vue-next'
import type { ChatMessage } from '@/composables/useChat'
import { renderChatMarkdown, type LinkableSet } from '@/lib/chatMarkdown'

/** One chat bubble: your question, or Kura's answer rendered as safe markdown. */
const props = defineProps<{ message: ChatMessage; sets: readonly LinkableSet[] }>()
const emit = defineEmits<{ copy: [text: string]; retry: [] }>()
const router = useRouter()

const isUser = computed(() => props.message.role === 'user')
const html = computed(() =>
  isUser.value ? '' : renderChatMarkdown(props.message.content, props.sets),
)
const streaming = computed(() => props.message.status === 'streaming')

// In-app links (SKUs, sets) navigate without reloading the page.
function onClick(e: MouseEvent) {
  const link = (e.target as HTMLElement | null)?.closest('a')
  const href = link?.getAttribute('href')
  if (!href?.startsWith('/') || e.metaKey || e.ctrlKey || e.shiftKey) return
  e.preventDefault()
  void router.push(href)
}

// Long-press to copy (on phones), alongside the copy button.
let pressTimer: ReturnType<typeof setTimeout> | null = null
function startPress(e: PointerEvent) {
  if (e.pointerType === 'mouse' || !props.message.content) return
  pressTimer = setTimeout(() => {
    pressTimer = null
    emit('copy', props.message.content)
  }, 550)
}
function cancelPress() {
  if (pressTimer) clearTimeout(pressTimer)
  pressTimer = null
}
onBeforeUnmount(cancelPress)
</script>

<template>
  <li class="flex flex-col" :class="isUser ? 'items-end' : 'items-start'">
    <div
      class="max-w-[min(70ch,100%)] min-w-0 [-webkit-touch-callout:none]"
      :class="
        isUser
          ? 'rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-ink'
          : 'w-full text-ink'
      "
      @pointerdown="startPress"
      @pointerup="cancelPress"
      @pointerleave="cancelPress"
      @pointercancel="cancelPress"
      @pointermove="cancelPress"
      @contextmenu="pressTimer !== null && $event.preventDefault()"
    >
      <p v-if="isUser" class="break-words whitespace-pre-wrap">{{ message.content }}</p>
      <template v-else>
        <!-- eslint-disable-next-line vue/no-v-html -- sanitized by DOMPurify in renderChatMarkdown -->
        <div v-if="message.content" class="chat-md" v-html="html" @click="onClick" />
        <p
          v-if="streaming && (message.toolLabel || !message.content)"
          class="mt-1 flex items-center gap-2 text-sm text-ink-2"
          role="status"
        >
          <LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
          {{ message.toolLabel ?? 'Thinking' }}…
        </p>
        <p v-if="message.status === 'stopped'" class="mt-1 text-sm text-muted">Stopped.</p>
        <div
          v-if="message.status === 'error'"
          class="mt-1 flex flex-wrap items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          <span class="min-w-0 flex-1">{{ message.error }}</span>
          <button
            type="button"
            class="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-semibold underline"
            @click="emit('retry')"
          >
            <RotateCcw class="size-4" aria-hidden="true" /> Retry
          </button>
        </div>
      </template>
    </div>
    <button
      v-if="message.content && !streaming"
      type="button"
      class="mt-0.5 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted hover:bg-surface-2 hover:text-ink"
      :class="isUser ? '-mr-2' : '-ml-2'"
      :aria-label="isUser ? 'Copy your question' : 'Copy this answer'"
      @click="emit('copy', message.content)"
    >
      <Copy class="size-3.5" aria-hidden="true" /> Copy
    </button>
  </li>
</template>
