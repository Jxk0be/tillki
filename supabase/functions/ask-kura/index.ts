// Ask Kura: answers questions about the business by letting Claude call
// read-only tools (SQL functions and selects) as the signed-in user, under RLS.
//
// POST { message, threadId?, stream? = true } with the user's bearer token.
//   stream: true  -> text/event-stream with events: tool, delta, done, error
//   stream: false -> JSON { answer, threadId, messageId }
import Anthropic from '@anthropic-ai/sdk'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
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

const DEFAULT_MODEL = 'claude-sonnet-5-5'
const TITLE_MODEL = 'claude-haiku-4-5-20251001'

// ----------------------------------------------------------------------------- env
function env(name: string): string | undefined {
  return Deno.env.get(name) || undefined
}

/** Newer projects expose keys as JSON maps ({"default": "sb_..."}); older ones as single values. */
function key(single: string, map: string): string | undefined {
  const direct = env(single)
  if (direct) return direct
  try {
    const parsed = JSON.parse(env(map) ?? '{}') as Record<string, string>
    return parsed.default ?? Object.values(parsed)[0]
  } catch {
    return undefined
  }
}

const SUPABASE_URL = env('SUPABASE_URL') ?? ''
const PUBLIC_KEY = key('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEYS') ?? ''
const SERVICE_KEY = key('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS')

// ----------------------------------------------------------------------------- http helpers
const allowedOrigins = new Set(
  ['http://localhost:5173', ...(env('ALLOWED_ORIGIN') ?? '').split(',')]
    .map((o) => o.trim())
    .filter(Boolean),
)

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin')
  return {
    ...(origin && allowedOrigins.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' },
  })
}

/** Lets a promise finish after the response is sent (title, usage logging). */
function background(promise: Promise<unknown>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } })
    .EdgeRuntime
  const safe = promise.catch((e) => console.error('background task failed', e))
  if (runtime) runtime.waitUntil(safe)
}

/** A readable message for an Anthropic failure. Never includes keys or stack traces. */
function aiErrorMessage(e: unknown): string {
  if (e instanceof Anthropic.APIError) {
    console.error('anthropic error', e.status, e.name)
    if (e.status === 401 || e.status === 403)
      return "Ask Kura's AI key isn't valid. Check the ANTHROPIC_API_KEY secret."
    if (e.status === 429) return 'The AI service is rate limited right now. Try again in a minute.'
    if (e.status === 529 || e.status === 503)
      return 'The AI service is busy right now. Try again shortly.'
    if (e.status === 400) return 'The AI service rejected the request. Try rephrasing.'
    return "Couldn't reach the AI service. Try again."
  }
  console.error('ask-kura failure', e instanceof Error ? e.message : e)
  return 'Something went wrong answering that. Try again.'
}

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
  if (req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, 405, { error: 'Use POST.' })

  // ---- auth: run everything as the caller so RLS applies
  const token = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return json(req, 401, { error: 'Sign in first.' })
  const db = createClient(SUPABASE_URL, PUBLIC_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await db.auth.getUser(token)
  const user = userData?.user
  if (userError || !user)
    return json(req, 401, { error: 'Your session has expired. Sign in again.' })
  const userId = user.id
  const { data: isAdmin } = await db.rpc('is_admin')
  if (isAdmin !== true) return json(req, 403, { error: "You don't have access to Kura." })

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

  const apiKey = env('ANTHROPIC_API_KEY')
  if (!apiKey)
    return json(req, 500, {
      error: "Ask Kura isn't set up yet: the ANTHROPIC_API_KEY secret is missing.",
    })
  const model = env('CLAUDE_MODEL') ?? DEFAULT_MODEL

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
  const isNewThread = !threadId
  if (threadId) {
    const { data: thread } = await db
      .from('chat_threads')
      .select('id')
      .eq('id', threadId)
      .maybeSingle()
    if (!thread) return json(req, 404, { error: "That chat doesn't exist." })
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

  const { error: saveError } = await db
    .from('chat_messages')
    .insert({ thread_id: threadId, role: 'user', content: body.message })
  if (saveError) return json(req, 500, { error: "Couldn't save your message." })

  const { data: overview } = await db.rpc('rpc_overview', { p_tz: 'America/New_York' })
  const system = systemPrompt({ today: todayNY(), overview: overview?.[0] ?? null })
  const messages: Anthropic.MessageParam[] = [...history]
  if (messages.at(-1)?.role === 'user') {
    // An earlier question never got an answer; fold it into this one.
    const last = messages.pop() as { content: string }
    messages.push({ role: 'user', content: `${last.content}\n\n${body.message}` })
  } else {
    messages.push({ role: 'user', content: body.message })
  }

  const anthropic = new Anthropic({ apiKey })
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
    background(logUsage(userId, model, result.inputTokens, result.outputTokens))
    if (isNewThread) background(nameThread(anthropic, db, currentThread, body.message, userId))
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
      return json(req, 502, { error: aiErrorMessage(e), threadId: currentThread })
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
        send('error', { message: aiErrorMessage(e), threadId: currentThread })
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
async function logUsage(userId: string, model: string, input: number, output: number) {
  if (!SERVICE_KEY) {
    console.warn('No service key; skipping ai_usage logging.')
    return
  }
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { error } = await admin.from('ai_usage').insert({
    user_id: userId,
    function_name: 'ask-kura',
    model,
    input_tokens: input,
    output_tokens: output,
  })
  if (error) console.error('ai_usage insert failed', error.message)
}

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
  await logUsage(userId, TITLE_MODEL, reply.usage.input_tokens, reply.usage.output_tokens)
}
