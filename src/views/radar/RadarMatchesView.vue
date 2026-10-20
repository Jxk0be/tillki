<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ExternalLink, Link2, RotateCcw, Search } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import { listRadarSets, resetAniListMatch, setAniListMatch } from '@/composables/useRadar'
import { useToast } from '@/composables/useToast'
import { anilistUrl, matchState, parseAniListId, type RadarSet } from '@/lib/radar'

/** Confirm or fix which AniList series each manga set is. */
const toast = useToast()
const sets = ref<RadarSet[]>([])
const loading = ref(true)
const error = ref('')
const links = ref<Record<string, string>>({})
const linkErrors = ref<Record<string, string>>({})
const busy = ref<string | null>(null)
const showMatched = ref(false)

async function load() {
  try {
    sets.value = (await listRadarSets()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    )
    error.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Couldn't load your sets."
  } finally {
    loading.value = false
  }
}
onMounted(load)

const order = { review: 0, pending: 1, none: 2, matched: 3 } as const
const toReview = computed(() =>
  sets.value
    .filter((s) => matchState(s) !== 'matched')
    .sort((a, b) => order[matchState(a)] - order[matchState(b)]),
)
const matchedSets = computed(() => sets.value.filter((s) => matchState(s) === 'matched'))

async function save(set: RadarSet, anilistId: number | null) {
  busy.value = set.id
  try {
    await setAniListMatch(set.id, anilistId)
    toast.success(
      anilistId === null ? `${set.name} marked not on AniList.` : `${set.name} matched.`,
    )
    links.value[set.id] = ''
    await load()
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Couldn't save the match.")
  } finally {
    busy.value = null
  }
}

function saveLink(set: RadarSet) {
  const id = parseAniListId(links.value[set.id] ?? '')
  if (id === null) {
    linkErrors.value[set.id] = 'Paste a link like anilist.co/manga/30002/Berserk.'
    return
  }
  linkErrors.value[set.id] = ''
  void save(set, id)
}

async function reset(set: RadarSet) {
  busy.value = set.id
  try {
    await resetAniListMatch(set.id)
    toast.success(`${set.name} will be searched again on the next sync.`)
    await load()
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Couldn't reset the match.")
  } finally {
    busy.value = null
  }
}

const searchUrl = (name: string) =>
  `https://anilist.co/search/manga?search=${encodeURIComponent(name)}`
const stateLabel = {
  review: 'No confident match',
  pending: 'Not searched yet',
  none: 'Not on AniList',
  matched: 'Matched',
} as const
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-4">
    <RouterLink :to="{ name: 'radar' }" class="text-sm font-semibold text-ink-2 hover:underline"
      >Buy Radar</RouterLink
    >
    <p class="text-ink-2">
      The nightly sync matches sets to AniList when it's sure. Pick the right series for the rest,
      or paste its AniList link. Deluxe and omnibus editions use the original series.
    </p>

    <p
      v-if="error"
      class="rounded-xl border border-danger/40 bg-danger/10 p-3 text-danger"
      role="alert"
    >
      {{ error }}
    </p>
    <div v-else-if="loading" class="space-y-2" aria-busy="true">
      <div v-for="n in 4" :key="n" class="h-28 animate-pulse rounded-xl bg-surface-2" />
    </div>

    <template v-else>
      <p
        v-if="toReview.length === 0"
        class="rounded-2xl border border-dashed border-line p-6 text-center text-ink-2"
      >
        Every manga set is matched.
      </p>

      <ul v-else class="space-y-3">
        <li
          v-for="s in toReview"
          :key="s.id"
          class="space-y-3 rounded-2xl border border-line bg-surface p-4"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-x-3">
            <h3 class="font-bold break-words">{{ s.name }}</h3>
            <span class="text-sm text-ink-2">{{ stateLabel[matchState(s)] }}</span>
          </div>

          <div v-if="s.anilist_candidates?.length" class="space-y-1">
            <p class="text-sm font-semibold text-ink-2">Closest results</p>
            <ul class="space-y-1">
              <li
                v-for="c in s.anilist_candidates"
                :key="c.anilist_id"
                class="flex flex-wrap items-center justify-between gap-2"
              >
                <a
                  :href="c.url ?? anilistUrl(c.anilist_id)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex min-h-11 items-center gap-1 hover:underline"
                >
                  {{ c.title }}
                  <span class="text-xs text-ink-2"
                    >{{ c.format ? `${c.format.toLowerCase()} · ` : ''
                    }}{{ Math.round(c.score * 100) }}% match</span
                  >
                  <ExternalLink class="size-3.5" aria-hidden="true" />
                </a>
                <BaseButton
                  size="sm"
                  variant="secondary"
                  :disabled="busy === s.id"
                  @click="save(s, c.anilist_id)"
                  >Use this</BaseButton
                >
              </li>
            </ul>
          </div>

          <form class="space-y-1" novalidate @submit.prevent="saveLink(s)">
            <label :for="`link-${s.id}`" class="text-sm font-semibold text-ink-2"
              >AniList link</label
            >
            <div class="flex gap-2">
              <input
                :id="`link-${s.id}`"
                v-model="links[s.id]"
                type="url"
                inputmode="url"
                class="min-h-11 min-w-0 flex-1 rounded-lg border-2 border-line bg-surface px-3 text-base outline-none focus:border-primary"
                placeholder="anilist.co/manga/…"
                autocomplete="off"
                :aria-invalid="!!linkErrors[s.id]"
              />
              <BaseButton type="submit" size="sm" :disabled="busy === s.id || !links[s.id]">
                <Link2 class="size-4" aria-hidden="true" /> Save
              </BaseButton>
            </div>
            <p v-if="linkErrors[s.id]" class="text-sm text-danger" role="alert">
              {{ linkErrors[s.id] }}
            </p>
          </form>

          <div class="flex flex-wrap gap-2">
            <a
              :href="searchUrl(s.name)"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-surface-2"
            >
              <Search class="size-4" aria-hidden="true" /> Search AniList
            </a>
            <BaseButton
              v-if="matchState(s) !== 'none'"
              size="sm"
              variant="ghost"
              :disabled="busy === s.id"
              @click="save(s, null)"
              >Not on AniList</BaseButton
            >
            <BaseButton v-else size="sm" variant="ghost" :disabled="busy === s.id" @click="reset(s)"
              ><RotateCcw class="size-4" aria-hidden="true" /> Search again</BaseButton
            >
          </div>
        </li>
      </ul>

      <section v-if="matchedSets.length" class="space-y-2">
        <BaseButton variant="ghost" size="sm" @click="showMatched = !showMatched">
          {{ showMatched ? 'Hide' : 'Show' }} {{ matchedSets.length }} matched
          {{ matchedSets.length === 1 ? 'set' : 'sets' }}
        </BaseButton>
        <ul
          v-if="showMatched"
          class="divide-y divide-line rounded-2xl border border-line bg-surface"
        >
          <li
            v-for="s in matchedSets"
            :key="s.id"
            class="flex flex-wrap items-center justify-between gap-2 px-4 py-2"
          >
            <span class="font-medium">{{ s.name }}</span>
            <span class="flex items-center gap-2 text-sm">
              <span class="text-ink-2">{{
                s.anilist_match === 'confirmed' ? 'by hand' : 'auto'
              }}</span>
              <a
                :href="anilistUrl(s.anilist_id!)"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex min-h-11 items-center gap-1 font-semibold hover:underline"
                >AniList <ExternalLink class="size-3.5" aria-hidden="true"
              /></a>
              <BaseButton size="sm" variant="ghost" :disabled="busy === s.id" @click="reset(s)"
                >Change</BaseButton
              >
            </span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
