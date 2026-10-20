<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import {
  Ban,
  CircleAlert,
  CircleCheck,
  CircleMinus,
  Clapperboard,
  Flame,
  LibraryBig,
  Pause,
  PackageSearch,
  Radar,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  TrendingUp,
} from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseChip from '@/components/ui/BaseChip.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import RadarDetailSheet from '@/components/radar/RadarDetailSheet.vue'
import RadarDigestCard from '@/components/radar/RadarDigestCard.vue'
import { useDataVersion } from '@/composables/useDataChanged'
import {
  latestAniListRun,
  latestDigest,
  latestRun,
  listRadarSets,
  listScores,
  listSnapshots,
  listWatchlist,
  runDigest,
  startAniListSync,
  type RadarDigest,
  type RadarRun,
  type WatchEntry,
} from '@/composables/useRadar'
import { useToast } from '@/composables/useToast'
import { formatDateTime } from '@/lib/dates'
import {
  actionLabels,
  buildRadarRows,
  defaultRadarFilters,
  filterRadarRows,
  formatChange,
  isStale,
  type RadarAction,
  type RadarFilters,
  type RadarRow,
  type RadarSort,
} from '@/lib/radar'

/**
 * Buy Radar: manga sets ranked by tonight's buy score, with the action and the
 * reasons behind it, the weekly Claude buy list, and a detail sheet per set.
 * See docs/buy-radar-plan.md.
 */
const toast = useToast()
const rows = ref<RadarRow[]>([])
const run = ref<RadarRun | null>(null)
const ebayRun = ref<RadarRun | null>(null)
const digestRun = ref<RadarRun | null>(null)
const digest = ref<RadarDigest | null>(null)
const watchlist = ref<WatchEntry[]>([])
const loading = ref(true)
const error = ref('')
const syncing = ref(false)
const digesting = ref(false)
const filters = ref<RadarFilters>({ ...defaultRadarFilters })
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
    // The extras (eBay, buy list, watchlist) shouldn't take the list down if one fails.
    const [lastEbay, lastDigestRun, lastDigest, watch] = await Promise.allSettled([
      latestRun('ebay'),
      latestRun('digest'),
      latestDigest(),
      listWatchlist(),
    ])
    ebayRun.value = lastEbay.status === 'fulfilled' ? lastEbay.value : null
    digestRun.value = lastDigestRun.status === 'fulfilled' ? lastDigestRun.value : null
    digest.value = lastDigest.status === 'fulfilled' ? lastDigest.value : null
    watchlist.value = watch.status === 'fulfilled' ? watch.value : []
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Couldn't load the radar."
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(useDataVersion(), load)

// ---------------------------------------------------------------- refresh
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

async function writeDigest() {
  digesting.value = true
  try {
    await runDigest()
    toast.success('New buy list written.')
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Couldn't write the buy list.")
  } finally {
    digesting.value = false
  }
}

// ---------------------------------------------------------------- health
type Health = 'ok' | 'stale' | 'off'
interface HealthLine {
  label: string
  state: Health
  text: string
}
function healthOf(r: RadarRun | null, hours: number, never: string): HealthLine['state'] {
  if (!r) return never === 'off' ? 'off' : 'stale'
  if (r.skipped) return 'off'
  return r.ok && !isStale(r.finished_at, new Date(), hours) ? 'ok' : 'stale'
}
const health = computed<HealthLine[]>(() => {
  const when = (r: RadarRun | null) => (r ? formatDateTime(r.finished_at ?? r.started_at) : 'never')
  return [
    {
      label: 'AniList and scores',
      state: healthOf(run.value, 36, 'stale'),
      text:
        syncing.value || running.value
          ? 'Updating now…'
          : `${run.value?.ok === false ? 'Failed' : 'Updated'} ${when(run.value)}${run.value?.snapshots !== null && run.value?.snapshots !== undefined ? ` · ${run.value.snapshots} series` : ''}`,
    },
    {
      label: 'eBay prices',
      state: healthOf(ebayRun.value, 36, 'off'),
      text:
        !ebayRun.value || ebayRun.value.skipped
          ? 'Not set up yet'
          : `Updated ${when(ebayRun.value)}`,
    },
    {
      label: 'Weekly buy list',
      state: healthOf(digestRun.value, 24 * 8, 'off'),
      text: digestRun.value
        ? `${digestRun.value.ok === false ? 'Failed' : 'Written'} ${when(digestRun.value)}`
        : 'Not written yet',
    },
  ]
})
const healthIcon: Record<Health, Component> = {
  ok: CircleCheck,
  stale: CircleAlert,
  off: CircleMinus,
}
const healthColor: Record<Health, string> = {
  ok: 'text-success',
  stale: 'text-accent',
  off: 'text-ink-2',
}

// ---------------------------------------------------------------- list
const needsMatch = computed(
  () => rows.value.filter((r) => r.match === 'review' || r.match === 'pending').length,
)
const watched = computed(() => new Set(watchlist.value.map((w) => w.template_id)))
const names = computed(() => new Map(rows.value.map((r) => [r.id, r.name])))
const publishers = computed(() =>
  [...new Set(rows.value.map((r) => r.publisher).filter((p): p is string => !!p))].sort(),
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
const shown = computed(() => filterRadarRows(rows.value, filters.value, watched.value))
const anyScores = computed(() => rows.value.some((r) => r.score))
const filtering = computed(
  () =>
    filters.value.publisher !== null ||
    filters.value.animeOnly ||
    filters.value.watchOnly ||
    filters.value.action !== 'all',
)

const sortOptions: { value: RadarSort; label: string }[] = [
  { value: 'score', label: 'Score' },
  { value: 'momentum', label: 'AniList momentum' },
  { value: 'velocity', label: 'How fast we sell it' },
  { value: 'margin', label: 'Our margin' },
]
const sortModel = computed<RadarSort | ''>({
  get: () => filters.value.sort,
  set: (v) => (filters.value = { ...filters.value, sort: v || 'score' }),
})
const publisherModel = computed<string>({
  get: () => filters.value.publisher ?? '',
  set: (v) => (filters.value = { ...filters.value, publisher: v || null }),
})

// ---------------------------------------------------------------- detail
const detailRow = ref<RadarRow | null>(null)
const detailOpen = ref(false)
function openDetail(id: string) {
  const r = rows.value.find((x) => x.id === id)
  if (!r) return
  detailRow.value = r
  detailOpen.value = true
}
const detailWatch = computed(
  () => watchlist.value.find((w) => w.template_id === detailRow.value?.id) ?? null,
)
watch(rows, () => {
  if (detailRow.value)
    detailRow.value = rows.value.find((r) => r.id === detailRow.value?.id) ?? null
})

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
    <div class="rounded-2xl border border-line bg-surface p-3" role="status">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <ul class="space-y-1 text-sm">
          <li v-for="h in health" :key="h.label" class="flex items-start gap-2">
            <component
              :is="healthIcon[h.state]"
              class="mt-0.5 size-4 shrink-0"
              :class="healthColor[h.state]"
              aria-hidden="true"
            />
            <span
              ><span class="font-semibold">{{ h.label }}:</span> {{ h.text
              }}<span v-if="h.state === 'stale'" class="sr-only"> (needs attention)</span></span
            >
          </li>
        </ul>
        <BaseButton size="sm" variant="secondary" :loading="syncing || running" @click="refresh">
          <RefreshCw class="size-4" aria-hidden="true" /> Refresh now
        </BaseButton>
      </div>
    </div>

    <div class="flex flex-wrap gap-2">
      <RouterLink
        :to="{ name: 'radar-lot' }"
        class="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold hover:border-ink-2"
      >
        <PackageSearch class="size-4" aria-hidden="true" /> Check a lot
      </RouterLink>
      <RouterLink
        v-if="needsMatch"
        :to="{ name: 'radar-matches' }"
        class="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold hover:border-ink-2"
      >
        <Sparkles class="size-4" aria-hidden="true" />
        {{ needsMatch }} {{ needsMatch === 1 ? 'set needs' : 'sets need' }} an AniList match
      </RouterLink>
    </div>

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
      <RadarDigestCard
        v-if="anyScores"
        :digest="digest"
        :names="names"
        :running="digesting"
        @open="openDetail"
        @run="writeDigest"
      />

      <!-- Filters -->
      <div v-if="anyScores" class="space-y-3">
        <div
          class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0"
          role="group"
          aria-label="Filter by action"
        >
          <BaseChip
            :selected="filters.action === 'all'"
            @toggle="filters = { ...filters, action: 'all' }"
            >All ({{ rows.length }})</BaseChip
          >
          <BaseChip
            v-for="a in actionOrder"
            :key="a"
            :selected="filters.action === a"
            :disabled="counts[a] === 0"
            @toggle="filters = { ...filters, action: filters.action === a ? 'all' : a }"
            >{{ actionLabels[a] }} ({{ counts[a] }})</BaseChip
          >
          <BaseChip
            :selected="filters.animeOnly"
            @toggle="filters = { ...filters, animeOnly: !filters.animeOnly }"
            >Anime announced or airing</BaseChip
          >
          <BaseChip
            :selected="filters.watchOnly"
            :disabled="watchlist.length === 0"
            @toggle="filters = { ...filters, watchOnly: !filters.watchOnly }"
            >On watchlist ({{ watchlist.length }})</BaseChip
          >
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <BaseSelect v-model="sortModel" label="Sort by" :options="sortOptions" />
          <BaseSelect
            v-model="publisherModel"
            label="Publisher"
            placeholder="All publishers"
            :options="[
              { value: '', label: 'All publishers' },
              ...publishers.map((p) => ({ value: p, label: p })),
            ]"
          />
        </div>
      </div>

      <p
        v-if="shown.length === 0"
        class="rounded-2xl border border-dashed border-line p-6 text-center text-ink-2"
      >
        {{ filtering ? 'Nothing matches these filters.' : 'Nothing here today.' }}
      </p>
      <ol v-else class="divide-y divide-line rounded-2xl border border-line bg-surface">
        <li v-for="r in shown" :key="r.id">
          <button
            type="button"
            class="flex w-full gap-3 p-3 text-left hover:bg-surface-2 sm:p-4"
            :aria-label="`${r.name}${r.score ? `, score ${r.score.total}, ${actionLabels[r.score.action]}` : ''}. Show details`"
            @click="openDetail(r.id)"
          >
            <span
              class="flex w-12 shrink-0 flex-col items-center gap-0.5 pt-0.5"
              aria-hidden="true"
            >
              <span class="text-2xl leading-none font-black tabular-nums">{{
                r.score ? r.score.total : '—'
              }}</span>
            </span>
            <span class="min-w-0 flex-1 space-y-1.5">
              <span class="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span class="font-semibold break-words">{{ r.name }}</span>
                <span
                  v-if="r.score"
                  class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold"
                  :class="actionClasses[r.score.action]"
                >
                  <component
                    :is="actionIcons[r.score.action]"
                    class="size-3.5"
                    aria-hidden="true"
                  />
                  {{ actionLabels[r.score.action] }}
                </span>
                <span v-if="watched.has(r.id)" class="text-xs font-semibold text-ink-2"
                  >Watching</span
                >
              </span>

              <span v-if="r.score?.reasons.length" class="flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
                <span v-for="reason in r.score.reasons.slice(0, 2)" :key="reason">{{
                  reason
                }}</span>
              </span>

              <template v-if="r.latest">
                <span
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
                </span>
                <span class="grid grid-cols-3 gap-x-4 gap-y-1 text-sm">
                  <span>
                    <span class="block text-xs text-ink-2">Popularity</span>
                    <span class="tabular-nums">{{ number(r.latest.popularity) }}</span>
                  </span>
                  <span>
                    <span class="block text-xs text-ink-2">7 days</span>
                    <span class="flex items-center gap-1 tabular-nums">
                      <template v-if="r.popularity7d !== null">
                        <TrendingUp v-if="r.popularity7d > 0" class="size-3.5" aria-hidden="true" />
                        {{ formatChange(r.popularity7d) }}
                      </template>
                      <span v-else class="text-ink-2">Collecting</span>
                    </span>
                  </span>
                  <span>
                    <span class="block text-xs text-ink-2">In stock</span>
                    <span class="tabular-nums">{{ r.units_in_stock }}</span>
                  </span>
                </span>
              </template>
              <span v-else class="block text-sm text-ink-2">{{ matchNote(r) }}</span>

              <span v-if="r.missing_count > 0" class="block text-xs text-ink-2">
                Missing {{ r.missing_ranges }}
              </span>
            </span>
          </button>
        </li>
      </ol>

      <p class="text-xs text-ink-2">
        Updated nightly around 3am New York time.
        <RouterLink :to="{ name: 'radar-matches' }" class="font-semibold underline"
          >AniList matches</RouterLink
        >
        ·
        <a href="https://anilist.co" target="_blank" rel="noopener noreferrer" class="underline"
          >Trend data from AniList</a
        >
      </p>
    </template>

    <RadarDetailSheet v-model:open="detailOpen" :row="detailRow" :watch-entry="detailWatch" />
  </div>
</template>
