// AniList sync for Buy Radar: matches manga sets to AniList, then saves today's
// trend snapshot for every matched series, then scores every manga set
// (buy_scores). See docs/buy-radar-plan.md.
//
// Called nightly by pg_cron (x-radar-cron header, checked against the secret in
// Vault) or by an admin from the Radar page (bearer token). Responds right away
// and finishes in the background; progress is logged in radar_runs.
import type { SupabaseClient } from '@supabase/supabase-js'
import { background, json, requireAdminOrCron } from '../_shared/server.ts'
import { scoreSets } from './scoring.ts'
import {
  ANILIST_URL,
  BATCH_QUERY,
  MAX_MATCHES_PER_RUN,
  REQUEST_SPACING_MS,
  SEARCH_QUERY,
  SNAPSHOT_BATCH,
  chunk,
  newYorkDate,
  pageMedia,
  pickMatch,
  retryDelayMs,
  searchTexts,
  toSnapshot,
  type AniListMedia,
  type PageResponse,
} from './lib.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** One paced AniList request, retrying 429 and 5xx. */
let lastRequestAt = 0
async function anilist(query: string, variables: Record<string, unknown>): Promise<PageResponse> {
  for (let attempt = 0; ; attempt++) {
    const wait = lastRequestAt + REQUEST_SPACING_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastRequestAt = Date.now()
    const res = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
    if (res.ok) return (await res.json()) as PageResponse
    const delay = retryDelayMs(res.status, res.headers.get('Retry-After'), attempt)
    if (delay === null) throw new Error(`AniList returned ${res.status}`)
    await sleep(delay)
  }
}

interface SetRow {
  id: string
  name: string
  anilist_id: number | null
  anilist_match: string | null
  anilist_candidates: unknown
}

async function run(db: SupabaseClient, runId: string) {
  const detail: Record<string, unknown> = { matched: 0, needs_review: 0, snapshots: 0, errors: [] }
  const errors = detail.errors as string[]
  try {
    const { data: sets, error } = await db
      .from('item_templates')
      .select('id, name, anilist_id, anilist_match, anilist_candidates')
      .eq('category', 'manga')
      .is('archived_at', null)
    if (error) throw error
    const rows = (sets ?? []) as SetRow[]

    // ---- match sets never tried before
    const neverTried = (s: SetRow) =>
      s.anilist_id === null && s.anilist_match === null && s.anilist_candidates === null
    const allUntried = rows.filter(neverTried)
    const untried = allUntried.slice(0, MAX_MATCHES_PER_RUN)
    detail.unmatched_left = allUntried.length - untried.length
    for (const set of untried) {
      try {
        let media: AniListMedia[] = []
        for (const search of searchTexts(set.name)) {
          media = pageMedia(await anilist(SEARCH_QUERY, { search }))
          if (media.length) break
        }
        const result = pickMatch(set.name, media)
        if (result.kind === 'match') {
          await db
            .from('item_templates')
            .update({
              anilist_id: result.anilist_id,
              anilist_match: 'auto',
              anilist_candidates: null,
            })
            .eq('id', set.id)
          set.anilist_id = result.anilist_id
          detail.matched = (detail.matched as number) + 1
        } else {
          await db
            .from('item_templates')
            .update({ anilist_candidates: result.candidates })
            .eq('id', set.id)
          detail.needs_review = (detail.needs_review as number) + 1
        }
      } catch (e) {
        errors.push(`match "${set.name}": ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    // ---- snapshot every matched series
    const ids = [
      ...new Set(rows.map((s) => s.anilist_id).filter((id): id is number => id !== null)),
    ]
    const today = newYorkDate(new Date())
    for (const batch of chunk(ids, SNAPSHOT_BATCH)) {
      try {
        const media = pageMedia(await anilist(BATCH_QUERY, { ids: batch }))
        const snapshots = media.map((m) => toSnapshot(m, today))
        if (snapshots.length) {
          const { error: upsertError } = await db
            .from('anilist_snapshots')
            .upsert(snapshots, { onConflict: 'anilist_id,captured_on' })
          if (upsertError) throw upsertError
        }
        detail.snapshots = (detail.snapshots as number) + snapshots.length
      } catch (e) {
        errors.push(`snapshot batch: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }
  // ---- score every manga set with today's data
  try {
    const result = await scoreSets(db, newYorkDate(new Date()))
    detail.scored = result.scored
    detail.actions = result.actions
  } catch (e) {
    errors.push(`scoring: ${e instanceof Error ? e.message : String(e)}`)
  }

  await db
    .from('radar_runs')
    .update({ finished_at: new Date().toISOString(), ok: errors.length === 0, detail })
    .eq('id', runId)
}

Deno.serve(async (req) => {
  const auth = await requireAdminOrCron(req)
  if (auth instanceof Response) return auth
  const { db, trigger } = auth

  // One run at a time: skip if another started in the last 15 minutes and hasn't finished.
  const { data: running } = await db
    .from('radar_runs')
    .select('id')
    .eq('kind', 'anilist')
    .is('finished_at', null)
    .gte('started_at', new Date(Date.now() - 15 * 60_000).toISOString())
    .limit(1)
  if (running?.length) return json(req, 202, { run_id: running[0]!.id, already_running: true })

  const { data: runRow, error } = await db
    .from('radar_runs')
    .insert({ kind: 'anilist', detail: { trigger } })
    .select('id')
    .single()
  if (error || !runRow) return json(req, 500, { error: "Couldn't start the sync." })

  background(run(db, runRow.id))
  return json(req, 202, { run_id: runRow.id, already_running: false })
})
