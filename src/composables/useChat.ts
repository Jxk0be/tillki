import { ref, shallowRef } from 'vue'
import { supabase } from '@/lib/supabase'
import type { LinkableSet } from '@/lib/chatMarkdown'
import { readSse } from '@/lib/sse'

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-kura`

export interface ChatThread {
  id: string
  title: string | null
  updated_at: string
}

export type MessageStatus = 'done' | 'streaming' | 'error' | 'stopped'

export interface ChatMessage {
  /** Database id once saved; a temporary id while streaming. */
  id: string
  role: 'user' | 'assistant'
  content: string
  status: MessageStatus
  /** What the assistant is doing right now ("Checking sales"), while streaming. */
  toolLabel: string | null
  error: string | null
}

let tempId = 0
const temp = () => `tmp-${++tempId}`

/** Reads the error message out of a non-stream response. */
async function errorFrom(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string }
    if (body.error) return body.error
  } catch {
    // not JSON
  }
  return `Ask Tillki answered with an error (${response.status}).`
}

/** Chat threads and messages for /ask, and streaming answers from the ask-kura function. */
export function useChat() {
  const threads = ref<ChatThread[]>([])
  const threadsLoading = ref(true)
  const messages = ref<ChatMessage[]>([])
  const messagesLoading = ref(false)
  /** The thread the messages on screen belong to (null = a new, unsaved chat). */
  const threadId = ref<string | null>(null)
  const sending = ref(false)
  const sets = shallowRef<LinkableSet[]>([])
  let controller: AbortController | null = null

  async function loadThreads() {
    const { data, error } = await supabase
      .from('chat_threads')
      .select('id, title, updated_at')
      .order('updated_at', { ascending: false })
      .limit(200)
    if (!error) threads.value = data ?? []
    threadsLoading.value = false
  }

  async function loadSets() {
    const { data } = await supabase
      .from('item_templates')
      .select('id, name')
      .is('archived_at', null)
    sets.value = data ?? []
  }

  function newChat() {
    stop()
    threadId.value = null
    messages.value = []
  }

  async function openThread(id: string) {
    if (id === threadId.value) return
    stop()
    threadId.value = id
    messages.value = []
    messagesLoading.value = true
    const { data, error } = await supabase
      .from('chat_messages')
      .select('id, role, content')
      .eq('thread_id', id)
      .order('created_at')
    if (threadId.value !== id) return
    messagesLoading.value = false
    if (error) {
      messages.value = []
      return
    }
    messages.value = (data ?? []).map((m) => ({
      id: m.id,
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
      status: 'done',
      toolLabel: null,
      error: null,
    }))
    // A question that never got an answer (the connection dropped): offer a retry.
    if (messages.value.at(-1)?.role === 'user') {
      messages.value.push({
        id: temp(),
        role: 'assistant',
        content: '',
        status: 'error',
        toolLabel: null,
        error: "This question didn't get an answer.",
      })
    }
  }

  /**
   * Sends a question and streams the answer into the last message. `onThread`
   * fires as soon as the server says which thread this is (new chats included).
   */
  async function send(
    text: string,
    opts: { retry?: boolean; onThread?: (id: string) => void } = {},
  ) {
    const question = text.trim()
    if (!question || sending.value) return
    if (!opts.retry) {
      messages.value.push({
        id: temp(),
        role: 'user',
        content: question,
        status: 'done',
        toolLabel: null,
        error: null,
      })
    }
    messages.value.push({
      id: temp(),
      role: 'assistant',
      content: '',
      status: 'streaming',
      toolLabel: null,
      error: null,
    })
    // Always edit through the reactive array so the screen updates.
    const answer = messages.value[messages.value.length - 1] as ChatMessage

    sending.value = true
    controller = new AbortController()
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Your session has expired. Sign in again.')
      const response = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: question,
          threadId: threadId.value ?? undefined,
          stream: true,
        }),
        signal: controller.signal,
      })
      if (!response.ok || !response.body) throw new Error(await errorFrom(response))

      for await (const { event, data: payload } of readSse(response.body)) {
        const d = (payload ?? {}) as Record<string, unknown>
        if (event === 'thread' && typeof d.threadId === 'string') {
          if (threadId.value !== d.threadId) {
            threadId.value = d.threadId
            opts.onThread?.(d.threadId)
          }
        } else if (event === 'tool') {
          answer.toolLabel = typeof d.label === 'string' ? d.label : 'Checking'
        } else if (event === 'delta' && typeof d.text === 'string') {
          answer.toolLabel = null
          answer.content += d.text
        } else if (event === 'done') {
          if (typeof d.messageId === 'string') answer.id = d.messageId
          answer.status = 'done'
        } else if (event === 'error') {
          throw new Error(typeof d.message === 'string' ? d.message : 'Something went wrong.')
        }
      }
      if (answer.status === 'streaming') throw new Error('The answer was cut off.')
    } catch (e) {
      if (controller?.signal.aborted) {
        answer.status = 'stopped'
      } else {
        answer.status = 'error'
        answer.error =
          e instanceof TypeError
            ? "Couldn't reach Ask Tillki. Check your connection."
            : e instanceof Error
              ? e.message
              : 'Something went wrong.'
      }
    } finally {
      answer.toolLabel = null
      sending.value = false
      controller = null
      void loadThreads()
    }
  }

  /** Cancels the answer being streamed (what's arrived so far stays on screen). */
  function stop() {
    controller?.abort()
  }

  /** Asks the last question again after an error. */
  async function retry(onThread?: (id: string) => void) {
    const failed = messages.value.at(-1)
    const question = [...messages.value].reverse().find((m) => m.role === 'user')
    if (!failed || failed.role !== 'assistant' || !question) return
    messages.value.pop()
    await send(question.content, { retry: true, onThread })
  }

  async function rename(id: string, title: string) {
    const clean = title.trim().slice(0, 80)
    if (!clean) return false
    const { error } = await supabase.from('chat_threads').update({ title: clean }).eq('id', id)
    if (error) return false
    const t = threads.value.find((x) => x.id === id)
    if (t) t.title = clean
    return true
  }

  async function remove(id: string) {
    const { error } = await supabase.from('chat_threads').delete().eq('id', id)
    if (error) return false
    threads.value = threads.value.filter((t) => t.id !== id)
    if (threadId.value === id) newChat()
    return true
  }

  return {
    threads,
    threadsLoading,
    messages,
    messagesLoading,
    threadId,
    sending,
    sets,
    loadThreads,
    loadSets,
    newChat,
    openThread,
    send,
    stop,
    retry,
    rename,
    remove,
  }
}
