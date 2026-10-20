<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import {
  Ban,
  CircleAlert,
  CircleCheck,
  Clapperboard,
  Flame,
  LibraryBig,
  Pause,
  Radar,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  TrendingUp,
} from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseChip from '@/components/ui/BaseChip.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useDataVersion } from '@/composables/useDataChanged'
import {
  latestAniListRun,
  listRadarSets,
  listScores,
  listSnapshots,
  startAniListSync,
  type RadarRun,
} from '@/composables/useRadar'
import { useToast } from '@/composables/useToast'
import { formatDateTime } from '@/lib/dates'
import {
  actionLabels,
  anilistUrl,
  buildRadarRows,
  formatChange,
  isStale,
  type RadarAction,
  type RadarRow,
} from '@/lib/radar'

/**
 * Buy Radar: manga sets ranked by tonight's buy score, with the action and the
 * reasons behind it. See docs/buy-radar-plan.md.
 */
const toast = useToast()
const rows = ref<RadarRow[]>([])
const run = ref<RadarRun | null>(null)
const loading = ref(true)
const error = ref('')
const syncing = ref(false)
const filter = ref<RadarAction | 'all'>('all')
let poll: ReturnType<typeof setInterval> | null = null

async function load() {
  try {
    const sets = await listRadarSets()
    const ids = [
      ...new Set(sets.map((s) => s.anilist_id).filter((id): id is number => id !== null)),
    ]
    const [snapshots, scores, lastRun] = await Promise.all([
      listSnapshots(ids),
      listScores(),
      latestAniListRun(),
    ])
    rows.value = buildRadarRows(sets, snapshots, scores)
    run.value = lastRun
    error.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Couldn't load the radar."
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(useDataVersion(), load)

const running = computed(
  () =>
    !!run.value &&
    !run.value.finished_at &&
    Date.now() - Date.parse(run.value.started_at) < 15 * 60_000,
)

function stopPolling() {
  if (poll) clearInterval(poll)
  poll = null
}
onBeforeUnmount(stopPolling)

function startPolling() {
  stopPolling()
  const started = Date.now()
  poll = setInterval(async () => {
    run.value = await latestAniListRun().catch(() => run.value)
    if (run.value?.finished_at || Date.now() - started > 10 * 60_000) {
      stopPolling()
      syncing.value = false
      await load()
      if (run.value?.finished_at) {
        if (run.value.ok) toast.success('Radar updated.')
        else toast.error('The update finished with errors.')
      }
    }
  }, 5000)
}
watch(running, (r) => {
  if (r && !poll) {
    syncing.value = true
    startPolling()
  }
})

async function refresh() {
  syncing.value = true
  try {
    await startAniListSync()
    run.value = await latestAniListRun()
    startPolling()
  } catch (e) {
    syncing.value = false
    toast.error(e instanceof Error ? e.message : "Couldn't start the update.")
  }
}

const healthy = computed(() => !!run.value?.ok && !isStale(run.value.finished_at, new Date()))
const needsMatch = computed(
  () => rows.value.filter((r) => r.match === 'review' || r.match === 'pending').length,
)

const actionOrder: RadarAction[] = ['buy', 'finish_set', 'hold', 'avoid']
const actionIcons: Record<RadarAction, Component> = {
  buy: ShoppingCart,
  finish_set: LibraryBig,
  hold: Pause,
  avoid: Ban,
}
const actionClasses: Record<RadarAction, string> = {
  buy: 'border-success bg-success/15',
  finish_set: 'border-primary bg-primary/10',
  hold: 'border-line bg-surface-2',
  avoid: 'border-danger bg-danger/10',
}
const counts = computed(() => {
  const c: Record<RadarAction, number> = { buy: 0, finish_set: 0, hold: 0, avoid: 0 }
  for (const r of rows.value) if (r.score) c[r.score.action]++
  return c
})
const shown = computed(() =>
  filter.value === 'all' ? rows.value : rows.value.filter((r) => r.score?.action === filter.value),
)
const anyScores = computed(() => rows.value.some((r) => r.score))

const number = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : new Intl.NumberFormat('en-US').format(n)
const matchNote = (r: RadarRow) =>
  r.match === 'none'
    ? 'Not on AniList, so scored on your own sales and set gaps only.'
    : r.match === 'review'
      ? 'Needs an AniList match for trend data.'
      : r.match === 'pending'
        ? 'Gets matched to AniList on the next update.'
        : 'Trend data arrives with the next update.'
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-4">
    <p class="text-ink-2">
      Your manga sets, scored every night from AniList trends, your own sales and set gaps. Scores
      sharpen after a week of trend history and as sales come in.
    </p>

    <!-- Health line -->
    <div
      class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-surface p-3"
      :class="healthy ? 'border-line' : 'border-accent/40'"
      role="status"
    >
      <p class="flex items-start gap-2 text-sm">
        <CircleCheck
          v-if="healthy"
          class="mt-0.5 size-4 shrink-0 text-success"
          aria-hidden="true"
        />
        <CircleAlert v-else class="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
        <span v-if="syncing || running">Updating from AniList… this takes a minute or two.</span>
        <span v-else-if="!run">No data yet. Run the first update.</span>
        <span v-else>
          {{ run.ok ? 'Updated' : 'Last tried' }}
          {{ formatDateTime(run.finished_at ?? run.started_at) }}
          <template v-if="!run.ok"> with errors</template>
          <template v-else-if="!healthy"> — over 36 hours ago</template>
          <template v-if="run.snapshots !== null">
            · {{ run.snapshots }} series on AniList</template
          >
        </span>
      </p>
      <BaseButton size="sm" variant="secondary" :loading="syncing || running" @click="refresh">
        <RefreshCw class="size-4" aria-hidden="true" /> Refresh now
      </BaseButton>
    </div>

    <RouterLink
      v-if="needsMatch"
      :to="{ name: 'radar-matches' }"
      class="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold hover:border-ink-2"
    >
      <Sparkles class="size-4" aria-hidden="true" />
      {{ needsMatch }} {{ needsMatch === 1 ? 'set needs' : 'sets need' }} an AniList match. Review
      matches
    </RouterLink>

    <p
      v-if="error"
      class="rounded-xl border border-danger/40 bg-danger/10 p-3 text-danger"
      role="alert"
    >
      {{ error }}
    </p>
    <div v-else-if="loading" class="space-y-2" aria-busy="true">
      <div v-for="n in 5" :key="n" class="h-20 animate-pulse rounded-xl bg-surface-2" />
    </div>
    <EmptyState
      v-else-if="rows.length === 0"
      :icon="Radar"
      title="No manga sets yet"
      message="Radar tracks your manga sets. Add a set and it shows up here after the next update."
    />

    <template v-else>
      <div
        v-if="anyScores"
        class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0"
        role="group"
        aria-label="Filter by action"
      >
        <BaseChip :selected="filter === 'all'" @toggle="filter = 'all'"
          >All ({{ rows.length }})</BaseChip
        >
        <BaseChip
          v-for="a in actionOrder"
          :key="a"
          :selected="filter === a"
          :disabled="counts[a] === 0"
          @toggle="filter = filter === a ? 'all' : a"
          >{{ actionLabels[a] }} ({{ counts[a] }})</BaseChip
        >
      </div>

      <p
        v-if="shown.length === 0"
        class="rounded-2xl border border-dashed border-line p-6 text-center text-ink-2"
      >
        Nothing here today.
      </p>
      <ol v-else class="divide-y divide-line rounded-2xl border border-line bg-surface">
        <li v-for="r in shown" :key="r.id" class="flex gap-3 p-3 sm:p-4">
          <div class="flex w-12 shrink-0 flex-col items-center gap-0.5 pt-0.5">
            <span
              v-if="r.score"
              class="text-2xl leading-none font-black tabular-nums"
              :aria-label="`Score ${r.score.total} out of 100`"
              >{{ r.score.total }}</span
            >
            <span v-else class="text-2xl leading-none font-black text-ink-2" aria-label="No score"
              >—</span
            >
          </div>
          <div class="min-w-0 flex-1 space-y-1.5">
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <RouterLink
                :to="{ name: 'template-detail', params: { id: r.id } }"
                class="font-semibold break-words hover:underline"
                >{{ r.name }}</RouterLink
              >
              <span
                v-if="r.score"
                class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold"
                :class="actionClasses[r.score.action]"
              >
                <component :is="actionIcons[r.score.action]" class="size-3.5" aria-hidden="true" />
                {{ actionLabels[r.score.action] }}
              </span>
              <a
                v-if="r.anilist_id"
                :href="anilistUrl(r.anilist_id)"
                target="_blank"
                rel="noopener noreferrer"
                class="ml-auto text-xs font-semibold text-ink-2 hover:underline"
                >AniList</a
              >
            </div>

            <ul v-if="r.score?.reasons.length" class="flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
              <li v-for="reason in r.score.reasons.slice(0, 2)" :key="reason">{{ reason }}</li>
            </ul>

            <template v-if="r.latest">
              <div
                v-if="
                  r.latest.anime_airing ||
                  r.latest.has_upcoming_anime ||
                  (r.latest.trending ?? 0) > 0
                "
                class="flex flex-wrap gap-1.5"
              >
                <span
                  v-if="r.latest.anime_airing"
                  class="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold"
                >
                  <Clapperboard class="size-3.5" aria-hidden="true" /> Anime airing
                </span>
                <span
                  v-if="r.latest.has_upcoming_anime"
                  class="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold"
                >
                  <Sparkles class="size-3.5" aria-hidden="true" /> Anime announced
                </span>
                <span
                  v-if="(r.latest.trending ?? 0) > 0"
                  class="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold"
                >
                  <Flame class="size-3.5" aria-hidden="true" /> Trending {{ r.latest.trending }}
                </span>
              </div>
              <dl class="grid grid-cols-3 gap-x-4 gap-y-1 text-sm">
                <div>
                  <dt class="text-xs text-ink-2">Popularity</dt>
                  <dd class="tabular-nums">{{ number(r.latest.popularity) }}</dd>
                </div>
                <div>
                  <dt class="text-xs text-ink-2">7 days</dt>
                  <dd class="flex items-center gap-1 tabular-nums">
                    <template v-if="r.popularity7d !== null">
                      <TrendingUp v-if="r.popularity7d > 0" class="size-3.5" aria-hidden="true" />
                      {{ formatChange(r.popularity7d) }}
                    </template>
                    <span v-else class="text-ink-2">Collecting</span>
                  </dd>
                </div>
                <div>
                  <dt class="text-xs text-ink-2">In stock</dt>
                  <dd class="tabular-nums">{{ r.units_in_stock }}</dd>
                </div>
              </dl>
            </template>
            <p v-else class="text-sm text-ink-2">{{ matchNote(r) }}</p>

            <p v-if="r.missing_count > 0" class="text-xs text-ink-2">
              Missing {{ r.missing_ranges }}
            </p>
          </div>
        </li>
      </ol>

      <p class="text-xs text-ink-2">
        Updated nightly around 3am New York time.
        <RouterLink :to="{ name: 'radar-matches' }" class="font-semibold underline"
          >AniList matches</RouterLink
        >
      </p>
    </template>
  </div>
</template>
