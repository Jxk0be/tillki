<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Archive, Clock, Heart, Layers, TrendingDown } from 'lucide-vue-next'
import ItemThumb from '@/components/inventory/ItemThumb.vue'
import StatusChip from '@/components/inventory/StatusChip.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useAppSettings } from '@/composables/useAppSettings'
import { useSignedUrls } from '@/composables/useSignedUrls'
import {
  BUNDLE_TAG,
  droppedPrice,
  dropPrices,
  listStale,
  setStatus,
  tagForBundle,
  useStaleBadge,
  type StaleItem,
} from '@/composables/useStale'
import { useToast } from '@/composables/useToast'
import { formatCents } from '@/lib/money'

/** Stock that's been sitting too long, with quick ways to move it. */
const settings = useAppSettings()
const toast = useToast()
const badge = useStaleBadge()
const { request: requestPhotos } = useSignedUrls()

const items = ref<StaleItem[]>([])
const loading = ref(true)
const error = ref('')
const selected = ref(new Set<string>())
const busy = ref(false)

async function load() {
  await settings.ready
  try {
    items.value = await listStale(settings.staleDays.value)
    error.value = ''
    void requestPhotos(items.value.map((i) => i.cover_path))
    void badge.refresh(settings.staleDays.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Couldn't load stale stock."
  } finally {
    loading.value = false
  }
}
onMounted(async () => {
  await load()
  badge.dismiss() // you've seen them; the badge comes back if more go stale
})
watch(items, () => {
  const ids = new Set(items.value.map((i) => i.id))
  selected.value = new Set([...selected.value].filter((id) => ids.has(id)))
})

const daysListed = (i: StaleItem) =>
  i.listed_at
    ? Math.max(0, Math.floor((Date.now() - new Date(i.listed_at).getTime()) / 86_400_000))
    : null

function toggle(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}
const allSelected = computed(
  () => items.value.length > 0 && selected.value.size === items.value.length,
)
function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(items.value.map((i) => i.id))
}
const chosen = computed(() => items.value.filter((i) => selected.value.has(i.id)))

async function act(task: () => Promise<string>) {
  busy.value = true
  try {
    toast.success(await task())
    selected.value = new Set()
    await load()
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Something went wrong.')
  } finally {
    busy.value = false
  }
}

const drop = (list: StaleItem[], percent: number) =>
  act(async () => {
    const n = await dropPrices(list, percent)
    const skipped = list.length - n
    return `Dropped ${n} price${n === 1 ? '' : 's'} by ${percent}%.${skipped ? ` ${skipped} had no asking price.` : ''}`
  })
const bundle = (list: StaleItem[]) =>
  act(async () => {
    await tagForBundle(list)
    return `Tagged ${list.length} "${BUNDLE_TAG}". They show the tag here and on each item's page.`
  })

const statusConfirm = ref<{ list: StaleItem[]; status: 'kept' | 'written_off' } | null>(null)
const statusOpen = computed({
  get: () => statusConfirm.value !== null,
  set: (v) => {
    if (!v) statusConfirm.value = null
  },
})
function confirmStatus() {
  const c = statusConfirm.value
  if (!c) return
  statusConfirm.value = null
  void act(async () => {
    await setStatus(
      c.list.map((i) => i.id),
      c.status,
    )
    return `Marked ${c.list.length} as ${c.status === 'kept' ? 'kept' : 'written off'}.`
  })
}
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-4">
    <p class="text-ink-2">
      In stock or listed for more than <strong>{{ settings.staleDays.value }} days</strong> (change
      this in Settings), oldest first.
    </p>

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
      v-else-if="items.length === 0"
      :icon="Clock"
      title="Nothing stale"
      message="Everything in stock has been here less time than your stale limit. Nice."
    />

    <template v-else>
      <div
        class="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 -mx-4 flex flex-wrap items-center gap-2 border-b border-line bg-bg/95 px-4 py-2 backdrop-blur lg:top-0 lg:mx-0 lg:rounded-xl lg:border lg:px-3"
      >
        <label class="flex min-h-11 items-center gap-2 px-1 text-sm font-semibold">
          <input type="checkbox" class="size-5" :checked="allSelected" @change="toggleAll" />
          {{ selected.size ? `${selected.size} selected` : `Select all ${items.length}` }}
        </label>
        <template v-if="selected.size">
          <BaseButton size="sm" variant="secondary" :disabled="busy" @click="drop(chosen, 10)"
            >−10%</BaseButton
          >
          <BaseButton size="sm" variant="secondary" :disabled="busy" @click="drop(chosen, 20)"
            >−20%</BaseButton
          >
          <BaseButton size="sm" variant="ghost" :disabled="busy" @click="bundle(chosen)">
            <Layers class="size-4" aria-hidden="true" /> Bundle
          </BaseButton>
          <BaseButton
            size="sm"
            variant="ghost"
            :disabled="busy"
            @click="statusConfirm = { list: chosen, status: 'kept' }"
          >
            <Heart class="size-4" aria-hidden="true" /> Kept
          </BaseButton>
          <BaseButton
            size="sm"
            variant="ghost"
            class="text-danger"
            :disabled="busy"
            @click="statusConfirm = { list: chosen, status: 'written_off' }"
          >
            <Archive class="size-4" aria-hidden="true" /> Write off
          </BaseButton>
        </template>
      </div>

      <ul class="divide-y divide-line rounded-2xl border border-line bg-surface">
        <li v-for="i in items" :key="i.id" class="flex flex-wrap items-center gap-3 p-3">
          <input
            type="checkbox"
            class="size-5 shrink-0"
            :checked="selected.has(i.id)"
            :aria-label="`Select ${i.name}`"
            @change="toggle(i.id)"
          />
          <ItemThumb :path="i.cover_path" :source="i.cover_source" :alt="i.name" size="sm" />
          <div class="min-w-0 flex-1">
            <RouterLink
              :to="{ name: 'item-detail', params: { id: i.id } }"
              class="block truncate font-semibold hover:underline"
              >{{ i.name }}</RouterLink
            >
            <p class="flex flex-wrap items-center gap-x-2 text-sm text-ink-2">
              <span class="font-mono text-xs">{{ i.sku }}</span>
              <StatusChip :status="i.status" />
              <span class="font-semibold text-danger">{{ i.days_in_stock }} days in stock</span>
              <span v-if="daysListed(i) !== null">· listed {{ daysListed(i) }} days</span>
              <span v-if="i.tags.includes(BUNDLE_TAG)">· tagged bundle</span>
            </p>
          </div>
          <div class="text-right text-sm">
            <p class="font-semibold tabular-nums">
              {{ i.list_price_cents === null ? 'No price' : formatCents(i.list_price_cents) }}
            </p>
            <p class="text-xs text-muted">cost {{ formatCents(i.cost_cents) }}</p>
          </div>
          <div class="flex w-full gap-1 sm:w-auto">
            <BaseButton
              v-if="i.list_price_cents !== null"
              size="sm"
              variant="ghost"
              :disabled="busy"
              :aria-label="`Drop ${i.name} 10% to ${formatCents(droppedPrice(i.list_price_cents, 10))}`"
              @click="drop([i], 10)"
            >
              <TrendingDown class="size-4" aria-hidden="true" /> −10%
            </BaseButton>
            <BaseButton
              v-if="i.list_price_cents !== null"
              size="sm"
              variant="ghost"
              :disabled="busy"
              :aria-label="`Drop ${i.name} 20% to ${formatCents(droppedPrice(i.list_price_cents, 20))}`"
              @click="drop([i], 20)"
              >−20%</BaseButton
            >
            <BaseButton
              size="sm"
              variant="ghost"
              :disabled="busy || i.tags.includes(BUNDLE_TAG)"
              @click="bundle([i])"
              >Bundle</BaseButton
            >
          </div>
        </li>
      </ul>
    </template>

    <ConfirmDialog
      v-model:open="statusOpen"
      :title="statusConfirm?.status === 'kept' ? 'Mark as kept?' : 'Write these off?'"
      :message="
        statusConfirm?.status === 'kept'
          ? `${statusConfirm?.list.length} item(s) leave the for-sale stock but stay in your records.`
          : `${statusConfirm?.list.length} item(s) are counted as lost stock. You can change the status later.`
      "
      :confirm-label="statusConfirm?.status === 'kept' ? 'Mark kept' : 'Write off'"
      :danger="statusConfirm?.status === 'written_off'"
      @confirm="confirmStatus"
    />
  </div>
</template>
