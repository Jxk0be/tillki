<script setup lang="ts">
import { MessageSquarePlus, Pencil, Trash2 } from 'lucide-vue-next'
import type { ChatThread } from '@/composables/useChat'
import { formatDate } from '@/lib/dates'

/** Your chats, newest first, with rename and delete. */
defineProps<{ threads: ChatThread[]; activeId: string | null; loading: boolean }>()
const emit = defineEmits<{
  open: [id: string]
  new: []
  rename: [thread: ChatThread]
  delete: [thread: ChatThread]
}>()

const titleOf = (t: ChatThread) => t.title || 'New chat'
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <button
      type="button"
      class="mb-2 flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 font-semibold text-primary-ink hover:opacity-90"
      @click="emit('new')"
    >
      <MessageSquarePlus class="size-5" aria-hidden="true" /> New chat
    </button>

    <div v-if="loading" class="space-y-2" aria-busy="true">
      <div v-for="n in 5" :key="n" class="h-12 animate-pulse rounded-lg bg-surface-2" />
    </div>
    <p v-else-if="threads.length === 0" class="px-2 py-6 text-center text-sm text-ink-2">
      No chats yet. Ask something to start one.
    </p>
    <ul v-else class="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1" aria-label="Chats">
      <li
        v-for="t in threads"
        :key="t.id"
        class="group flex items-center rounded-lg"
        :class="t.id === activeId ? 'bg-surface-2' : 'hover:bg-surface-2'"
      >
        <button
          type="button"
          class="min-h-11 min-w-0 flex-1 rounded-lg px-3 py-1.5 text-left"
          :aria-current="t.id === activeId ? 'page' : undefined"
          @click="emit('open', t.id)"
        >
          <span
            class="block truncate text-sm"
            :class="t.id === activeId ? 'font-bold' : 'font-medium'"
          >
            {{ titleOf(t) }}
          </span>
          <span class="block text-xs text-muted">{{ formatDate(t.updated_at) }}</span>
        </button>
        <button
          type="button"
          class="grid size-11 shrink-0 place-items-center rounded-lg text-ink-2 hover:text-ink"
          :aria-label="`Rename ${titleOf(t)}`"
          @click="emit('rename', t)"
        >
          <Pencil class="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="grid size-11 shrink-0 place-items-center rounded-lg text-ink-2 hover:text-danger"
          :aria-label="`Delete ${titleOf(t)}`"
          @click="emit('delete', t)"
        >
          <Trash2 class="size-4" aria-hidden="true" />
        </button>
      </li>
    </ul>
  </div>
</template>
