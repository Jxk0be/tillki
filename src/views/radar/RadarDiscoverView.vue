<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { BookmarkPlus, Check, Clapperboard, ExternalLink, Flame, Sparkles } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseChip from '@/components/ui/BaseChip.vue'
import {
  discoverManga,
  watchFromAniList,
  type DiscoverItem,
  type DiscoverSort,
} from '@/composables/useRadar'
import { useToast } from '@/composables/useToast'

/**
 * Discover: AniList's trending manga, including series we don't stock yet.
 * "Watch" creates an empty set linked to AniList and puts it on the watchlist,
 * so the nightly sync starts tracking and scoring it.
 */
const router = useRouter()
const toast = useToast()

const sort = ref<DiscoverSort>('trending')
const includeManhwa = ref(false)
const hideOwned = ref(true)
const animeOnly = ref(false)
const items = ref<DiscoverItem[]>([])
const page = ref(1)
const hasNext = ref(false)
const loading = ref(true)
const loadingMore = ref(false)
const error = ref('')
const watching = ref<number | null>(null)

async function load(reset: boolean) {
  if (reset) {
    page.value = 1
    loading.value = true
  } else {
    loadingMore.value = true
  }
  try {
    const result = await discoverManga({
      sort: sort.value,
      include_manhwa: includeManhwa.value,
      page: page.value,
    })
    items.value = reset ? result.items : [...items.value, ...result.items]
    hasNext.value = result.has_next && page.value < 10
    error.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Couldn't load AniList."
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}
onMounted(() => load(true))
watch([sort, includeManhwa], () => load(true))

function more() {
  page.value++
  void load(false)
}

const shown = computed(() =>
  items.value.filter(
    (i) =>
      (!hideOwned.value || !i.template_id) &&
      (!animeOnly.value || i.anime_upcoming || i.anime_airing),
  ),
)

async function watchItem(item: DiscoverItem) {
  watching.value = item.anilist_id
  try {
    const id = await watchFromAniList(item)
    item.template_id = id
    toast.success(`${item.title} is now a set on your watchlist. It gets scored tonight.`)
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Couldn't add it.")
  } finally {
    watching.value = null
  }
}

const ebayUrl = (title: string) =>
  `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(`${title} manga`)}`
const statusLabel: Record<string, string> = {
  RELEASING: 'Ongoing',
  FINISHED: 'Finished',
  HIATUS: 'On hiatus',
  NOT_YET_RELEASED: 'Not out yet',
  CANCELLED: 'Cancelled',
}
const sorts: { value: DiscoverSort; label: string }[] = [
  { value: 'trending', label: 'Trending now' },
  { value: 'new', label: 'New and rising' },
  { value: 'popular', label: 'Most popular ever' },
]
const number = (n: number) => new Intl.NumberFormat('en-US', { notation: 'compact' }).format(n)
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-4">
    <RouterLink :to="{ name: 'radar' }" class="text-sm font-semibold text-ink-2 hover:underline"
      >Buy Radar</RouterLink
    >
    <p class="text-ink-2">
      What's hot on AniList right now, including series you don't stock yet. Watch one to start
      tracking it: it becomes an empty set on your watchlist and gets scored every night.
    </p>
    <p class="text-xs text-ink-2">
      AniList doesn't say whether a series has an English print. Check eBay before buying.
    </p>

    <div class="space-y-2">
      <div
        class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0"
        role="group"
        aria-label="List"
      >
        <BaseChip
          v-for="s in sorts"
          :key="s.value"
          :selected="sort === s.value"
          @toggle="sort = s.value"
          >{{ s.label }}</BaseChip
        >
      </div>
      <div
        class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0"
        role="group"
        aria-label="Filters"
      >
        <BaseChip :selected="hideOwned" @toggle="hideOwned = !hideOwned">Not in my sets</BaseChip>
        <BaseChip :selected="animeOnly" @toggle="animeOnly = !animeOnly"
          >Anime announced or airing</BaseChip
        >
        <BaseChip :selected="includeManhwa" @toggle="includeManhwa = !includeManhwa"
          >Include manhwa and manhua</BaseChip
        >
      </div>
    </div>

    <p
      v-if="error"
      class="rounded-xl border border-danger/40 bg-danger/10 p-3 text-danger"
      role="alert"
    >
      {{ error }}
    </p>
    <div v-else-if="loading" class="grid gap-3 sm:grid-cols-2" aria-busy="true">
      <div v-for="n in 6" :key="n" class="h-36 animate-pulse rounded-2xl bg-surface-2" />
    </div>

    <template v-else>
      <p
        v-if="shown.length === 0"
        class="rounded-2xl border border-dashed border-line p-6 text-center text-ink-2"
      >
        Nothing new on this page. {{ hasNext ? 'Load more below.' : '' }}
      </p>
      <ol v-else class="grid gap-3 sm:grid-cols-2">
        <li
          v-for="item in shown"
          :key="item.anilist_id"
          class="flex gap-3 rounded-2xl border border-line bg-surface p-3"
        >
          <img
            v-if="item.cover_url"
            :src="item.cover_url"
            :alt="''"
            class="h-28 w-20 shrink-0 rounded-lg bg-surface-2 object-cover"
            loading="lazy"
            referrerpolicy="no-referrer"
          />
          <div v-else class="h-28 w-20 shrink-0 rounded-lg bg-surface-2" aria-hidden="true" />
          <div class="min-w-0 flex-1 space-y-1.5">
            <div>
              <p class="leading-tight font-semibold break-words">{{ item.title }}</p>
              <p v-if="item.alt_title" class="truncate text-xs text-ink-2">{{ item.alt_title }}</p>
              <p class="text-xs text-ink-2">
                {{ statusLabel[item.status ?? ''] ?? item.status ?? '' }}
                <template v-if="item.volumes"> · {{ item.volumes }} vols</template>
                <template v-if="item.start_year"> · since {{ item.start_year }}</template>
                <template v-if="item.country && item.country !== 'JP'">
                  · {{ item.country }}</template
                >
              </p>
            </div>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-if="item.anime_airing"
                class="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold"
              >
                <Clapperboard class="size-3.5" aria-hidden="true" /> Anime airing
              </span>
              <span
                v-if="item.anime_upcoming"
                class="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold"
              >
                <Sparkles class="size-3.5" aria-hidden="true" /> Anime announced
              </span>
              <span
                v-if="item.trending > 0"
                class="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold"
              >
                <Flame class="size-3.5" aria-hidden="true" /> {{ item.trending }}
              </span>
              <span class="rounded-full bg-surface-2 px-2 py-0.5 text-xs">
                {{ number(item.popularity) }} readers<template v-if="item.mean_score">
                  · {{ item.mean_score }}%</template
                >
              </span>
            </div>
            <div class="flex flex-wrap items-center gap-x-2">
              <BaseButton
                v-if="!item.template_id"
                size="sm"
                :loading="watching === item.anilist_id"
                @click="watchItem(item)"
              >
                <BookmarkPlus class="size-4" aria-hidden="true" /> Watch
              </BaseButton>
              <BaseButton
                v-else
                size="sm"
                variant="ghost"
                @click="router.push({ name: 'template-detail', params: { id: item.template_id } })"
              >
                <Check class="size-4" aria-hidden="true" /> In your sets
              </BaseButton>
              <a
                :href="ebayUrl(item.title)"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold hover:underline"
                >eBay <ExternalLink class="size-3.5" aria-hidden="true"
              /></a>
              <a
                :href="item.url"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold hover:underline"
                >AniList <ExternalLink class="size-3.5" aria-hidden="true"
              /></a>
            </div>
          </div>
        </li>
      </ol>

      <div v-if="hasNext" class="flex justify-center">
        <BaseButton variant="secondary" :loading="loadingMore" @click="more">Load more</BaseButton>
      </div>
      <p class="text-xs text-ink-2">
        Data from
        <a href="https://anilist.co" target="_blank" rel="noopener noreferrer" class="underline"
          >AniList</a
        >.
      </p>
    </template>
  </div>
</template>
