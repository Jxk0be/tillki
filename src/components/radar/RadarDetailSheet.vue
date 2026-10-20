<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { BookmarkMinus, BookmarkPlus, ExternalLink, MessageCircle } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSheet from '@/components/ui/BaseSheet.vue'
import BaseTextarea from '@/components/ui/BaseTextarea.vue'
import PopularityChart from '@/components/radar/PopularityChart.vue'
import {
  getSeriesDetail,
  removeWatch,
  saveWatch,
  type SeriesDetail,
  type WatchEntry,
} from '@/composables/useRadar'
import { useToast } from '@/composables/useToast'
import { formatDate } from '@/lib/dates'
import { platformLabels } from '@/lib/labels'
import { formatCents, parseMoneyToCents } from '@/lib/money'
import {
  actionLabels,
  anilistUrl,
  componentLabels,
  type RadarRow,
  type ScoreComponents,
} from '@/lib/radar'
import type { SalesPlatform } from '@/types/inventory'

/** Everything behind one set's score: breakdown, trend, our sales, prices, gaps and the watchlist. */
const props = defineProps<{ row: RadarRow | null; watchEntry: WatchEntry | null }>()
const open = defineModel<boolean>('open', { required: true })

const router = useRouter()
const toast = useToast()
const detail = ref<SeriesDetail | null>(null)
const loading = ref(false)
const error = ref('')
const maxBuy = ref('')
const note = ref('')
const maxBuyError = ref('')
const saving = ref(false)

watch(open, async (isOpen) => {
  if (!isOpen || !props.row) return
  maxBuy.value =
    props.watchEntry?.max_buy_cents != null ? (props.watchEntry.max_buy_cents / 100).toFixed(2) : ''
  note.value = props.watchEntry?.note ?? ''
  maxBuyError.value = ''
  detail.value = null
  error.value = ''
  loading.value = true
  try {
    detail.value = await getSeriesDetail(props.row.id, props.row.anilist_id)
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Couldn't load this series."
  } finally {
    loading.value = false
  }
})

const components = computed(() => {
  const c = props.row?.score?.components
  if (!c) return []
  return (Object.keys(componentLabels) as (keyof ScoreComponents)[]).map((k) => ({
    key: k,
    label: componentLabels[k],
    value: c[k],
  }))
})

const perf = computed(() => detail.value?.performance ?? null)
const thin = computed(() => !perf.value || perf.value.sample_size === 0)

const priceLabel = (source: string) =>
  source === 'ebay_sold'
    ? 'eBay sold, last 90 days'
    : source === 'ebay_browse'
      ? 'eBay asking, not sold'
      : 'Entered by hand'

async function saveWatchlist() {
  if (!props.row) return
  maxBuyError.value = ''
  let cents: number | null = null
  if (maxBuy.value.trim()) {
    cents = parseMoneyToCents(maxBuy.value)
    if (cents === null) {
      maxBuyError.value = 'Enter a price like 4.50, or leave it empty.'
      return
    }
  }
  saving.value = true
  try {
    await saveWatch({
      template_id: props.row.id,
      max_buy_cents: cents,
      note: note.value.trim() || null,
    })
    toast.success(
      props.watchEntry ? 'Watchlist updated.' : `${props.row.name} is on your watchlist.`,
    )
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Couldn't save.")
  } finally {
    saving.value = false
  }
}

async function unwatch() {
  if (!props.row) return
  saving.value = true
  try {
    await removeWatch(props.row.id)
    toast.success('Removed from your watchlist.')
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Couldn't remove it.")
  } finally {
    saving.value = false
  }
}

/** Opens Ask with this set's numbers, so the answer is based on our data. */
function ask() {
  const r = props.row
  if (!r) return
  const p = perf.value
  const facts = [
    r.score
      ? `Buy Radar score ${r.score.total}/100 (${actionLabels[r.score.action]}). Reasons: ${r.score.reasons.join('; ')}.`
      : null,
    p
      ? `Our sales: ${p.units_sold} sold, ${p.units_on_hand} on hand, ${p.sold_last_30d} sold in 30 days, ${p.stale_count} stale${p.margin_pct !== null ? `, ${p.margin_pct}% margin` : ''}.`
      : null,
    r.missing_count ? `Missing volumes: ${r.missing_ranges}.` : null,
  ].filter(Boolean)
  open.value = false
  void router.push({
    name: 'ask',
    query: { q: `Should we buy more ${r.name}? ${facts.join(' ')}` },
  })
}
</script>

<template>
  <BaseSheet v-model:open="open" :title="row?.name ?? 'Series'" wide>
    <div v-if="row" class="space-y-5">
      <!-- Score -->
      <section v-if="row.score" class="space-y-3" aria-labelledby="score-heading">
        <div class="flex items-baseline gap-3">
          <h3 id="score-heading" class="sr-only">Score</h3>
          <span class="text-4xl font-black tabular-nums">{{ row.score.total }}</span>
          <span class="font-bold">{{ actionLabels[row.score.action] }}</span>
          <span class="ml-auto text-xs text-ink-2"
            >Scored {{ formatDate(row.score.scored_on) }}</span
          >
        </div>
        <ul class="space-y-1 text-sm">
          <li v-for="reason in row.score.reasons" :key="reason">• {{ reason }}</li>
        </ul>
        <dl v-if="components.length" class="space-y-1.5">
          <div
            v-for="c in components"
            :key="c.key"
            class="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-2 text-sm"
          >
            <dt class="text-ink-2">{{ c.label }}</dt>
            <dd class="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
              <div
                class="h-full rounded-full bg-ink"
                :style="{ width: `${Math.round(c.value * 100)}%` }"
              />
            </dd>
            <dd class="text-right tabular-nums">{{ Math.round(c.value * 100) }}</dd>
          </div>
        </dl>
        <p class="text-xs text-ink-2">50 means neutral or not enough data.</p>
      </section>
      <p v-else class="text-sm text-ink-2">Not scored yet. It gets a score on the next update.</p>

      <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
      <div v-else-if="loading" class="space-y-2" aria-busy="true">
        <div v-for="n in 3" :key="n" class="h-16 animate-pulse rounded-xl bg-surface-2" />
      </div>

      <template v-else-if="detail">
        <!-- Trend -->
        <section aria-labelledby="trend-heading" class="space-y-2">
          <div class="flex items-baseline justify-between gap-2">
            <h3 id="trend-heading" class="font-bold">AniList popularity</h3>
            <a
              v-if="row.anilist_id"
              :href="anilistUrl(row.anilist_id)"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex min-h-11 items-center gap-1 text-sm font-semibold hover:underline"
              >AniList <ExternalLink class="size-3.5" aria-hidden="true"
            /></a>
          </div>
          <PopularityChart v-if="detail.history.length" :history="detail.history" />
          <p v-else class="text-sm text-ink-2">
            {{
              row.anilist_id
                ? 'No trend history yet.'
                : 'Not matched to AniList, so there is no trend data.'
            }}
          </p>
          <p v-if="detail.history.length && detail.history.length < 7" class="text-xs text-ink-2">
            {{ detail.history.length }} {{ detail.history.length === 1 ? 'night' : 'nights' }} of
            history so far. Momentum needs a week.
          </p>
        </section>

        <!-- Our sales -->
        <section aria-labelledby="sales-heading" class="space-y-2">
          <h3 id="sales-heading" class="font-bold">Our sales</h3>
          <p v-if="thin" class="rounded-xl bg-surface-2 p-3 text-sm">
            No sales yet for this series, so its score uses trend data and set gaps only.
          </p>
          <dl v-if="perf" class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt class="text-xs text-ink-2">Bought / sold</dt>
              <dd class="tabular-nums">{{ perf.units_bought }} / {{ perf.units_sold }}</dd>
            </div>
            <div>
              <dt class="text-xs text-ink-2">On hand</dt>
              <dd class="tabular-nums">
                {{ perf.units_on_hand
                }}<span v-if="perf.stale_count" class="text-ink-2">
                  ({{ perf.stale_count }} stale)</span
                >
              </dd>
            </div>
            <div>
              <dt class="text-xs text-ink-2">Average cost</dt>
              <dd class="tabular-nums">
                {{ perf.avg_cost_cents !== null ? formatCents(perf.avg_cost_cents) : '—' }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-ink-2">Average sale</dt>
              <dd class="tabular-nums">
                {{ perf.avg_sale_cents !== null ? formatCents(perf.avg_sale_cents) : '—' }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-ink-2">Kept after fees</dt>
              <dd class="tabular-nums">
                {{ perf.avg_net_cents !== null ? formatCents(perf.avg_net_cents) : '—' }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-ink-2">Margin</dt>
              <dd class="tabular-nums">
                {{ perf.margin_pct !== null ? `${perf.margin_pct}%` : '—' }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-ink-2">Days to sell</dt>
              <dd class="tabular-nums">
                {{ perf.median_days_to_sell !== null ? Math.round(perf.median_days_to_sell) : '—' }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-ink-2">Sold 30 / 90 days</dt>
              <dd class="tabular-nums">{{ perf.sold_last_30d }} / {{ perf.sold_last_90d }}</dd>
            </div>
          </dl>
          <ul
            v-if="detail.platforms.length"
            class="divide-y divide-line rounded-xl border border-line text-sm"
          >
            <li
              v-for="p in detail.platforms"
              :key="p.platform"
              class="flex flex-wrap justify-between gap-x-3 px-3 py-2"
            >
              <span class="font-medium">{{
                platformLabels[p.platform as SalesPlatform] ?? p.platform
              }}</span>
              <span class="tabular-nums text-ink-2">
                {{ p.units_sold }} sold
                <template v-if="p.avg_net_cents !== null">
                  · {{ formatCents(p.avg_net_cents) }} kept each</template
                >
                <template v-if="p.margin_pct !== null"> · {{ p.margin_pct }}%</template>
              </span>
            </li>
          </ul>
        </section>

        <!-- Prices -->
        <section aria-labelledby="price-heading" class="space-y-2">
          <h3 id="price-heading" class="font-bold">Market prices</h3>
          <p v-if="detail.prices.length === 0" class="text-sm text-ink-2">
            No price data yet. eBay prices appear here once the eBay sync is set up.
          </p>
          <ul v-else class="divide-y divide-line rounded-xl border border-line text-sm">
            <li
              v-for="p in detail.prices"
              :key="`${p.item_scope}:${p.source}`"
              class="space-y-0.5 px-3 py-2"
            >
              <p class="flex flex-wrap justify-between gap-x-3">
                <span class="font-medium">{{
                  p.item_scope === 'set' ? 'Lots and sets' : 'Single volumes'
                }}</span>
                <span class="tabular-nums">
                  {{ p.min_cents !== null ? formatCents(p.min_cents) : '—' }} –
                  {{ p.max_cents !== null ? formatCents(p.max_cents) : '—' }}
                  <span class="text-ink-2"
                    >(median
                    {{ p.median_cents !== null ? formatCents(p.median_cents) : '—' }})</span
                  >
                </span>
              </p>
              <p class="text-xs text-ink-2">
                {{ priceLabel(p.source) }} · {{ p.listing_count ?? 0 }} listings ·
                {{ formatDate(p.captured_on) }}
              </p>
            </li>
          </ul>
        </section>

        <!-- Gaps -->
        <section v-if="row.missing_count > 0" aria-labelledby="gap-heading" class="space-y-1">
          <h3 id="gap-heading" class="font-bold">Missing volumes</h3>
          <p class="text-sm">
            {{ row.missing_ranges }}
            <span class="text-ink-2"
              >({{ row.missing_count }} of {{ row.total_volumes ?? '?' }})</span
            >
          </p>
        </section>

        <!-- Watchlist -->
        <section
          aria-labelledby="watch-heading"
          class="space-y-3 rounded-2xl border border-line p-4"
        >
          <h3 id="watch-heading" class="font-bold">
            {{ watchEntry ? 'On your watchlist' : 'Watchlist' }}
          </h3>
          <BaseInput
            v-model="maxBuy"
            label="Most we'd pay per volume (optional)"
            prefix="$"
            inputmode="decimal"
            :error="maxBuyError"
          />
          <BaseTextarea v-model="note" label="Note (optional)" :rows="2" />
          <div class="flex flex-wrap gap-2">
            <BaseButton :loading="saving" @click="saveWatchlist">
              <BookmarkPlus class="size-4" aria-hidden="true" />
              {{ watchEntry ? 'Save' : 'Add to watchlist' }}
            </BaseButton>
            <BaseButton v-if="watchEntry" variant="ghost" :disabled="saving" @click="unwatch">
              <BookmarkMinus class="size-4" aria-hidden="true" /> Remove
            </BaseButton>
          </div>
        </section>
      </template>
    </div>
    <template #footer>
      <div class="flex flex-wrap gap-2">
        <BaseButton variant="secondary" @click="ask">
          <MessageCircle class="size-4" aria-hidden="true" /> Ask about this series
        </BaseButton>
        <RouterLink
          v-if="row"
          :to="{ name: 'template-detail', params: { id: row.id } }"
          class="inline-flex min-h-11 items-center rounded-lg px-4 font-semibold hover:bg-surface-2"
          @click="open = false"
          >Open set</RouterLink
        >
      </div>
    </template>
  </BaseSheet>
</template>
