// Ask Kura: answers questions about the business by letting Claude call
// read-only tools (SQL functions and selects) as the signed-in user, under RLS.
//
// POST { message, threadId?, stream? = true } with the user's bearer token.
//   stream: true  -> text/event-stream with events: thread, tool, delta, done, error
//   stream: false -> JSON { answer, threadId, messageId }
import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import {
  aiErrorMessage,
  anthropicFor,
  background,
  corsHeaders,
  json,
  logUsage,
  requireAdmin,
} from '../_shared/server.ts'
import {
  HISTORY_LIMIT,
  MAX_ROUNDS,
  RATE_LIMIT_PER_HOUR,
  cleanTitle,
  isToolName,
  todayNY,
  toHistory,
  toolLabels,
} from './lib.ts'
import { TITLE_PROMPT, systemPrompt } from './prompts/system.ts'
import { executeTool, tools } from './tools.ts'

const TITLE_MODEL = 'claude-haiku-4-5-20251001'

// ----------------------------------------------------------------------------- conversation
interface ToolCallSummary {
  name: string
  input: unknown
}

interface ConversationResult {
  text: string
  toolCalls: ToolCallSummary[]
  inputTokens: number
  outputTokens: number
}

async function converse(opts: {
  anthropic: Anthropic
  db: SupabaseClient
  model: string
  system: string
  messages: Anthropic.MessageParam[]
  onTool: (name: string, label: string) => void
  onDelta: (text: string) => void
}): Promise<ConversationResult> {
  const { anthropic, db, model, system, messages } = opts
  const result: ConversationResult = { text: '', toolCalls: [], inputTokens: 0, outputTokens: 0 }

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const lastRound = round === MAX_ROUNDS - 1
    let startedRound = false
    const stream = anthropic.messages.stream({
      model,
      max_tokens: 1024,
      system,
      messages,
      tools,
      // On the last round, answer with what's been gathered instead of asking for more.
      ...(lastRound ? { tool_choice: { type: 'none' as const } } : {}),
    })
    stream.on('text', (delta) => {
      // Separate text from different rounds ("Let me check..." then the answer).
      if (!startedRound && result.text) {
        result.text += '\n\n'
        opts.onDelta('\n\n')
      }
      startedRound = true
      result.text += delta
      opts.onDelta(delta)
    })
    const message = await stream.finalMessage()
    result.inputTokens += message.usage.input_tokens
    result.outputTokens += message.usage.output_tokens

    const toolUses = message.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    )
    if (message.stop_reason !== 'tool_use' || toolUses.length === 0) break

    messages.push({ role: 'assistant', content: message.content })
    const results = await Promise.all(
      toolUses.map(async (block): Promise<Anthropic.ToolResultBlockParam> => {
        opts.onTool(block.name, isToolName(block.name) ? toolLabels[block.name] : 'Checking')
        result.toolCalls.push({ name: block.name, input: block.input })
        const r = await executeTool(db, block.name, block.input)
        return {
          type: 'tool_result',
          tool_use_id: block.id,
          content: r.content,
          is_error: r.isError,
        }
      }),
    )
    messages.push({ role: 'user', content: results })
  }

  if (!result.text.trim()) {
    result.text = "I couldn't put an answer together from your data. Try asking another way."
    opts.onDelta(result.text)
  }
  return result
}

// ----------------------------------------------------------------------------- handler
const Body = z.object({
  message: z.string().trim().min(1, 'Type a question.').max(4000, 'That question is too long.'),
  threadId: z.uuid().optional(),
  stream: z.boolean().optional().default(true),
})

Deno.serve(async (req) => {
  // ---- auth: run everything as the caller so RLS applies
  const caller = await requireAdmin(req)
  if (caller instanceof Response) return caller
  const { db, userId } = caller

  // ---- input
  let body: z.infer<typeof Body>
  try {
    const parsed = Body.safeParse(await req.json())
    if (!parsed.success)
      return json(req, 400, { error: parsed.error.issues[0]?.message ?? 'Bad request.' })
    body = parsed.data
  } catch {
    return json(req, 400, { error: 'Send JSON like {"message": "..."}.' })
  }

  const ai = anthropicFor(req)
  if (ai instanceof Response) return ai
  const { anthropic, model } = ai

  // ---- rate limit: messages this user sent in the last hour (RLS limits to their threads)
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: recent } = await db
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'user')
    .gte('created_at', since)
  if ((recent ?? 0) >= RATE_LIMIT_PER_HOUR)
    return json(req, 429, {
      error: `That's ${RATE_LIMIT_PER_HOUR} questions in the last hour, the limit. Try again a bit later.`,
    })

  // ---- thread and history
  let threadId = body.threadId
  let needsTitle = !threadId
  if (threadId) {
    const { data: thread } = await db
      .from('chat_threads')
      .select('id, title')
      .eq('id', threadId)
      .maybeSingle()
    if (!thread) return json(req, 404, { error: "That chat doesn't exist." })
    needsTitle = !thread.title
  } else {
    const { data: created, error } = await db.from('chat_threads').insert({}).select('id').single()
    if (error || !created) return json(req, 500, { error: "Couldn't start a new chat." })
    threadId = created.id as string
  }

  const { data: past } = await db
    .from('chat_messages')
    .select('role, content')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT)
  const history = toHistory([...(past ?? [])].reverse() as { role: string; content: string }[])

  const unanswered = history.at(-1)?.role === 'user' ? (history.at(-1)?.content ?? '') : null
  // Retry: the same question is already saved and unanswered, so don't save it twice.
  const isRetry = unanswered !== null && unanswered.trim().endsWith(body.message)
  if (!isRetry) {
    const { error: saveError } = await db
      .from('chat_messages')
      .insert({ thread_id: threadId, role: 'user', content: body.message })
    if (saveError) return json(req, 500, { error: "Couldn't save your message." })
  }

  const { data: overview } = await db.rpc('rpc_overview', { p_tz: 'America/New_York' })
  const system = systemPrompt({ today: todayNY(), overview: overview?.[0] ?? null })
  const messages: Anthropic.MessageParam[] = [...history]
  if (isRetry) {
    // The question is already the last message.
  } else if (unanswered !== null) {
    // An earlier question never got an answer; fold it into this one.
    messages.pop()
    messages.push({ role: 'user', content: `${unanswered}\n\n${body.message}` })
  } else {
    messages.push({ role: 'user', content: body.message })
  }

  const currentThread = threadId

  /** Saves the answer, bumps the thread, logs usage, and names a new thread. */
  async function finish(result: ConversationResult): Promise<string | null> {
    const { data: saved } = await db
      .from('chat_messages')
      .insert({
        thread_id: currentThread,
        role: 'assistant',
        content: result.text,
        tool_calls: result.toolCalls.length ? result.toolCalls : null,
      })
      .select('id')
      .single()
    await db
      .from('chat_threads')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', currentThread)
    background(
      logUsage(userId, 'ask-kura', model, {
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
      }),
    )
    if (needsTitle) background(nameThread(anthropic, db, currentThread, body.message, userId))
    return (saved?.id as string | undefined) ?? null
  }

  // ---- plain REST
  if (!body.stream) {
    try {
      const result = await converse({
        anthropic,
        db,
        model,
        system,
        messages,
        onTool: () => {},
        onDelta: () => {},
      })
      const messageId = await finish(result)
      return json(req, 200, { answer: result.text, threadId: currentThread, messageId })
    } catch (e) {
      return json(req, 502, { error: aiErrorMessage(e, 'ask-kura'), threadId: currentThread })
    }
  }

  // ---- streaming
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true
      const send = (event: string, data: unknown) => {
        if (!open) return
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {
          open = false // the browser went away; keep going so the answer is still saved
        }
      }
      // Lets the app put a new chat in the list and the URL right away.
      send('thread', { threadId: currentThread })
      try {
        const result = await converse({
          anthropic,
          db,
          model,
          system,
          messages,
          onTool: (name, label) => send('tool', { name, label }),
          onDelta: (text) => send('delta', { text }),
        })
        const messageId = await finish(result)
        send('done', { threadId: currentThread, messageId })
      } catch (e) {
        send('error', { message: aiErrorMessage(e, 'ask-kura'), threadId: currentThread })
      } finally {
        if (open) controller.close()
      }
    },
  })
  return new Response(stream, {
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
})

// ----------------------------------------------------------------------------- side tasks
async function nameThread(
  anthropic: Anthropic,
  db: SupabaseClient,
  threadId: string,
  question: string,
  userId: string,
) {
  const reply = await anthropic.messages.create({
    model: TITLE_MODEL,
    max_tokens: 24,
    system: TITLE_PROMPT,
    messages: [{ role: 'user', content: question.slice(0, 500) }],
  })
  const text = reply.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? ''
  await db
    .from('chat_threads')
    .update({ title: cleanTitle(text, question) })
    .eq('id', threadId)
  await logUsage(userId, 'ask-kura', TITLE_MODEL, reply.usage)
}
