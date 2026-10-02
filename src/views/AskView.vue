<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown, History, MessageCircle, SquarePen } from 'lucide-vue-next'
import ChatComposer from '@/components/chat/ChatComposer.vue'
import ChatMessage from '@/components/chat/ChatMessage.vue'
import ChatThreadList from '@/components/chat/ChatThreadList.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSheet from '@/components/ui/BaseSheet.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useChat, type ChatThread } from '@/composables/useChat'
import { useKeyboardInset } from '@/composables/useKeyboardInset'
import { useToast } from '@/composables/useToast'

const props = defineProps<{ threadId?: string }>()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const chat = useChat()
const { messages, threads } = chat
const keyboardInset = useKeyboardInset()

const draft = ref('')
const listOpen = ref(false)
const composer = ref<InstanceType<typeof ChatComposer> | null>(null)
const scroller = ref<HTMLElement | null>(null)
/** Follow new text unless you've scrolled up to read something. */
const pinned = ref(true)

const starters = [
  'What did we spend this month?',
  'How much profit is sitting on our shelves?',
  'Which series sell fastest?',
  "What's been listed for over 60 days?",
  'Which platform makes us the most after fees?',
  'Which sets are we missing volumes for?',
  'How did last month compare to the month before?',
]

onMounted(() => {
  void chat.loadThreads()
  void chat.loadSets()
})

// ---------------------------------------------------------------- which chat
watch(
  () => props.threadId,
  (id) => {
    pinned.value = true
    if (id) void chat.openThread(id)
    else if (!chat.sending.value) chat.newChat()
  },
  { immediate: true },
)

const onThread = (id: string) => void router.replace({ name: 'ask', params: { threadId: id } })

async function ask(text: string) {
  draft.value = ''
  pinned.value = true
  await chat.send(text, { onThread })
}

// "Ask about this" from the dashboard: /ask?q=... starts a new chat and sends it.
watch(
  () => route.query.q,
  (q) => {
    if (typeof q !== 'string' || !q.trim()) return
    void router.replace({ name: 'ask', query: {} })
    chat.newChat()
    void ask(q)
  },
  { immediate: true },
)

function openChat(id: string) {
  listOpen.value = false
  void router.push({ name: 'ask', params: { threadId: id } })
}
function startNew() {
  listOpen.value = false
  chat.newChat()
  void router.push({ name: 'ask' })
  void nextTick(() => composer.value?.focus())
}

// ---------------------------------------------------------------- scrolling

function onScroll() {
  const el = scroller.value
  if (!el) return
  pinned.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80
}
function jumpToLatest(smooth = true) {
  const el = scroller.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  pinned.value = true
}
watch(
  () => [
    messages.value.length,
    messages.value.at(-1)?.content.length,
    messages.value.at(-1)?.toolLabel,
  ],
  () => {
    if (pinned.value) void nextTick(() => jumpToLatest(false))
  },
  { flush: 'post' },
)
// Keep the newest text in view when the keyboard opens and the chat gets shorter.
watch(keyboardInset, () => {
  if (pinned.value) void nextTick(() => jumpToLatest(false))
})

// ---------------------------------------------------------------- copy, rename, delete
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copied.')
  } catch {
    toast.error("Couldn't copy. Select the text instead.")
  }
}

const renaming = ref<ChatThread | null>(null)
const renameText = ref('')
const renameOpen = computed({
  get: () => renaming.value !== null,
  set: (v) => {
    if (!v) renaming.value = null
  },
})
function startRename(t: ChatThread) {
  listOpen.value = false
  renaming.value = t
  renameText.value = t.title ?? ''
}
async function saveRename() {
  if (!renaming.value) return
  if (await chat.rename(renaming.value.id, renameText.value)) renaming.value = null
  else toast.error('Give it a name, then save.')
}

const deleting = ref<ChatThread | null>(null)
const deleteOpen = computed({
  get: () => deleting.value !== null,
  set: (v) => {
    if (!v) deleting.value = null
  },
})
function startDelete(t: ChatThread) {
  listOpen.value = false
  deleting.value = t
}
async function confirmDelete() {
  const t = deleting.value
  if (!t) return
  const wasOpen = t.id === chat.threadId.value
  if (await chat.remove(t.id)) {
    toast.success('Chat deleted.')
    if (wasOpen) void router.replace({ name: 'ask' })
  } else {
    toast.error("Couldn't delete the chat.")
  }
  deleting.value = null
}

const currentTitle = computed(
  () => threads.value.find((t) => t.id === chat.threadId.value)?.title ?? 'New chat',
)
const empty = computed(() => messages.value.length === 0 && !chat.messagesLoading.value)
</script>

<template>
  <!--
    Phones: fixed between the top bar and the tab bar; while the keyboard is up
    the tab bar slides away and this sits right on top of the keyboard.
    Desktop: a full-height two-column page.
  -->
  <div
    class="fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top))] flex bg-bg lg:static lg:bottom-auto! lg:h-dvh"
    :style="{
      bottom: keyboardInset ? `${keyboardInset}px` : 'calc(4rem + env(safe-area-inset-bottom))',
    }"
  >
    <!-- Mobile top bar buttons -->
    <Teleport to="#topbar-actions" defer>
      <button
        type="button"
        class="grid size-11 place-items-center rounded-full lg:hidden"
        aria-label="Your chats"
        aria-haspopup="dialog"
        @click="listOpen = true"
      >
        <History class="size-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="grid size-11 place-items-center rounded-full lg:hidden"
        aria-label="New chat"
        @click="startNew"
      >
        <SquarePen class="size-5" aria-hidden="true" />
      </button>
    </Teleport>

    <!-- Desktop thread column -->
    <aside
      class="hidden w-72 shrink-0 flex-col border-r border-line p-4 lg:flex"
      aria-label="Chats"
    >
      <h1 class="mb-4 text-2xl font-black tracking-tight">Ask Tillki</h1>
      <ChatThreadList
        class="min-h-0 flex-1"
        :threads="threads"
        :active-id="chat.threadId.value"
        :loading="chat.threadsLoading.value"
        @open="openChat"
        @new="startNew"
        @rename="startRename"
        @delete="startDelete"
      />
    </aside>

    <!-- Conversation -->
    <section class="relative flex min-w-0 flex-1 flex-col" :aria-label="currentTitle">
      <div
        ref="scroller"
        class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 lg:px-8 lg:pt-8"
        @scroll.passive="onScroll"
      >
        <div class="mx-auto flex min-h-full max-w-3xl flex-col">
          <div v-if="chat.messagesLoading.value" class="space-y-4" aria-busy="true">
            <div class="ml-auto h-10 w-2/3 animate-pulse rounded-2xl bg-surface-2" />
            <div class="h-24 w-full animate-pulse rounded-2xl bg-surface-2" />
          </div>

          <!-- New chat: starter questions -->
          <div v-else-if="empty" class="my-auto py-6 text-center">
            <div
              class="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-surface-2 text-ink-2"
            >
              <MessageCircle class="size-7" aria-hidden="true" />
            </div>
            <h2 class="text-lg font-bold">Ask about the business</h2>
            <p class="mx-auto mt-1 max-w-sm text-sm text-ink-2">
              Answers come from your own inventory, sales and expenses.
            </p>
            <ul class="mt-5 flex flex-wrap justify-center gap-2">
              <li v-for="s in starters" :key="s">
                <button
                  type="button"
                  class="min-h-11 rounded-full border-2 border-line bg-surface px-4 py-2 text-left text-sm font-medium hover:border-ink-2"
                  @click="ask(s)"
                >
                  {{ s }}
                </button>
              </li>
            </ul>
          </div>

          <ol v-else class="space-y-4 pb-4" aria-live="polite" aria-relevant="additions">
            <ChatMessage
              v-for="m in messages"
              :key="m.id"
              :message="m"
              :sets="chat.sets.value"
              @copy="copy"
              @retry="chat.retry(onThread)"
            />
          </ol>
        </div>
      </div>

      <button
        v-if="!pinned && messages.length"
        type="button"
        class="absolute bottom-20 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-semibold shadow-lg"
        @click="jumpToLatest()"
      >
        <ArrowDown class="size-4" aria-hidden="true" /> Jump to latest
      </button>

      <!-- On phones the raised + button pokes ~24px above the tab bar; leave room for it. -->
      <div
        class="border-t border-line bg-bg px-4 pt-2 lg:px-8 lg:py-4"
        :class="keyboardInset ? 'pb-2' : 'pb-8'"
      >
        <ChatComposer
          ref="composer"
          v-model="draft"
          class="mx-auto max-w-3xl"
          :busy="chat.sending.value"
          @send="ask"
          @stop="chat.stop"
        />
      </div>
    </section>

    <!-- Mobile chat list -->
    <BaseSheet v-model:open="listOpen" title="Chats">
      <ChatThreadList
        :threads="threads"
        :active-id="chat.threadId.value"
        :loading="chat.threadsLoading.value"
        @open="openChat"
        @new="startNew"
        @rename="startRename"
        @delete="startDelete"
      />
    </BaseSheet>

    <BaseSheet v-model:open="renameOpen" title="Rename chat">
      <form id="rename-chat" @submit.prevent="saveRename">
        <BaseInput v-model="renameText" label="Name" autocomplete="off" maxlength="80" />
      </form>
      <template #footer>
        <BaseButton type="submit" form="rename-chat" block>Save</BaseButton>
      </template>
    </BaseSheet>

    <ConfirmDialog
      v-model:open="deleteOpen"
      title="Delete this chat?"
      :message="`“${deleting?.title || 'New chat'}” and its messages are removed for good.`"
      confirm-label="Delete"
      danger
      @confirm="confirmDelete"
    />
  </div>
</template>
