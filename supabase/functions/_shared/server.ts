// Shared by every Kura Edge Function: env and keys, CORS, JSON responses, the
// signed-in admin check (queries then run as that user, under RLS), AI error
// messages and ai_usage logging.
import Anthropic from '@anthropic-ai/sdk'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const DEFAULT_MODEL = 'claude-sonnet-5-5'

export function env(name: string): string | undefined {
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

// ----------------------------------------------------------------------------- http
const allowedOrigins = new Set(
  ['http://localhost:5173', ...(env('ALLOWED_ORIGIN') ?? '').split(',')]
    .map((o) => o.trim())
    .filter(Boolean),
)

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin')
  return {
    ...(origin && allowedOrigins.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' },
  })
}

/** Lets a promise finish after the response is sent. */
export function background(promise: Promise<unknown>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } })
    .EdgeRuntime
  const safe = promise.catch((e) => console.error('background task failed', e))
  if (runtime) runtime.waitUntil(safe)
}

// ----------------------------------------------------------------------------- auth
export interface Caller {
  db: SupabaseClient
  userId: string
  token: string
}

/**
 * Handles preflight and method, then checks the bearer token and is_admin().
 * Returns the caller (with a client that runs as them) or the Response to send.
 */
export async function requireAdmin(req: Request): Promise<Caller | Response> {
  if (req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, 405, { error: 'Use POST.' })
  const token = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return json(req, 401, { error: 'Sign in first.' })
  const db = createClient(SUPABASE_URL, PUBLIC_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await db.auth.getUser(token)
  if (error || !data?.user)
    return json(req, 401, { error: 'Your session has expired. Sign in again.' })
  const { data: isAdmin } = await db.rpc('is_admin')
  if (isAdmin !== true) return json(req, 403, { error: "You don't have access to Kura." })
  return { db, userId: data.user.id, token }
}

/** The Anthropic client and model, or a Response explaining the missing secret. */
export function anthropicFor(req: Request): { anthropic: Anthropic; model: string } | Response {
  const apiKey = env('ANTHROPIC_API_KEY')
  if (!apiKey)
    return json(req, 500, {
      error: "Kura's AI isn't set up yet: the ANTHROPIC_API_KEY secret is missing.",
    })
  return { anthropic: new Anthropic({ apiKey }), model: env('CLAUDE_MODEL') ?? DEFAULT_MODEL }
}

/** A readable message for an Anthropic failure. Never includes keys or stack traces. */
export function aiErrorMessage(e: unknown, fn = 'kura'): string {
  if (e instanceof Anthropic.APIError) {
    console.error(`${fn}: anthropic error`, e.status, e.name)
    if (e.status === 401 || e.status === 403)
      return "Kura's AI key isn't valid. Check the ANTHROPIC_API_KEY secret."
    if (e.status === 429) return 'The AI service is rate limited right now. Try again in a minute.'
    if (e.status === 529 || e.status === 503)
      return 'The AI service is busy right now. Try again shortly.'
    if (e.status === 400) return 'The AI service rejected the request. Try rephrasing.'
    return "Couldn't reach the AI service. Try again."
  }
  console.error(`${fn}: failure`, e instanceof Error ? e.message : e)
  return 'Something went wrong. Try again.'
}

/** Records token usage (ai_usage is written server-side only, with the service key). */
export async function logUsage(
  userId: string,
  functionName: string,
  model: string,
  usage: { input_tokens: number; output_tokens: number },
) {
  if (!SERVICE_KEY) {
    console.warn('No service key; skipping ai_usage logging.')
    return
  }
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { error } = await admin.from('ai_usage').insert({
    user_id: userId,
    function_name: functionName,
    model,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
  })
  if (error) console.error('ai_usage insert failed', error.message)
}

/** Pulls the first JSON object out of a model reply (tolerates ```json fences or stray text). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced?.[1] ?? text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('No JSON object in the reply.')
  return JSON.parse(body.slice(start, end + 1))
}
