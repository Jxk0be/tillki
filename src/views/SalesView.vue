<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { ChevronRight, Package, Receipt, Trash2 } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import EditSaleSheet from '@/components/sales/EditSaleSheet.vue'
import { useDataVersion } from '@/composables/useDataChanged'
import { deleteBundle, listSales, type SaleRow } from '@/composables/useSales'
import { useToast } from '@/composables/useToast'
import { formatDate } from '@/lib/dates'
import { platformLabels } from '@/lib/labels'
import { formatCents, formatSignedCents } from '@/lib/money'
import { bundleTitle, monthKey, totalsFor } from '@/lib/sales'
import type { SalesPlatform } from '@/types/inventory'

const toast = useToast()
const isDesktop = useMediaQuery('(min-width: 1024px)')

const platform = ref<SalesPlatform | ''>('')
const from = ref('')
const to = ref('')
const rows = ref<SaleRow[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    rows.value = await listSales({
      platform: platform.value || null,
      from: from.value || null,
      to: to.value || null,
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong.'
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch([platform, from, to], load)
watch(useDataVersion(), load)

/** A single sale, or a bundle (several rows sharing a bundle_id) shown as one entry. */
interface Entry {
  key: string
  title: string
  soldAt: string
  platform: SalesPlatform
  rows: SaleRow[]
  bundleId: string | null
}

const months = computed(() => {
  const entries: Entry[] = []
  const bundles = new Map<string, Entry>()
  for (const r of rows.value) {
    if (r.bundle_id) {
      const existing = bundles.get(r.bundle_id)
      if (existing) {
        existing.rows.push(r)
        continue
      }
      const entry: Entry = {
        key: r.bundle_id,
        title: '',
        soldAt: r.sold_at,
        platform: r.platform,
        rows: [r],
        bundleId: r.bundle_id,
      }
      bundles.set(r.bundle_id, entry)
      entries.push(entry)
    } else {
      entries.push({
        key: r.id,
        title: r.item_name,
        soldAt: r.sold_at,
        platform: r.platform,
        rows: [r],
        bundleId: null,
      })
    }
  }
  for (const e of bundles.values()) {
    e.rows.sort((a, b) => (a.volume_number ?? 0) - (b.volume_number ?? 0))
    e.title = bundleTitle(e.rows)
  }

  const byMonth = new Map<string, Entry[]>()
  for (const e of entries) {
    const key = monthKey(e.soldAt)
    byMonth.set(key, [...(byMonth.get(key) ?? []), e])
  }
  return [...byMonth.entries()].map(([key, list]) => ({
    key,
    label: new Date(`${key}-01T12:00:00`).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    }),
    entries: list,
    totals: totalsFor(list.flatMap((e) => e.rows)),
  }))
})
const overall = computed(() => totalsFor(rows.value))

const expanded = ref(new Set<string>())
function toggle(key: string) {
  const next = new Set(expanded.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expanded.value = next
}

const entryTotals = (e: Entry) => totalsFor(e.rows)

// ---------------------------------------------------------------- edit / delete
const editing = ref<SaleRow | null>(null)
const editOpen = ref(false)
function edit(row: SaleRow) {
  editing.value = row
  editOpen.value = true
}
function onChanged(message: string) {
  toast.success(message)
}

const bundleToDelete = ref<Entry | null>(null)
const deleting = ref(false)
async function removeBundle() {
  const e = bundleToDelete.value
  if (!e?.bundleId) return
  deleting.value = true
  try {
    await deleteBundle(e.bundleId)
    toast.success('Bundle deleted. Its items are back in stock.')
  } catch {
    toast.error("Couldn't delete the bundle.")
  } finally {
    deleting.value = false
    bundleToDelete.value = null
  }
}

const platformOptions = [
  { value: '' as const, label: 'All platforms' },
  ...(Object.keys(platformLabels) as SalesPlatform[]).map((p) => ({
    value: p,
    label: platformLabels[p],
  })),
]
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-[1fr_10rem_10rem] sm:items-end">
      <BaseSelect
        v-model="platform"
        label="Platform"
        class="col-span-2 sm:col-span-1"
        :options="platformOptions"
      />
      <BaseInput v-model="from" label="From" type="date" />
      <BaseInput v-model="to" label="To" type="date" />
    </div>

    <dl
      v-if="rows.length"
      class="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4"
    >
      <div class="bg-surface px-3 py-2">
        <dt class="text-xs text-ink-2">Revenue</dt>
        <dd class="text-lg font-bold tabular-nums">{{ formatCents(overall.revenueCents) }}</dd>
      </div>
      <div class="bg-surface px-3 py-2">
        <dt class="text-xs text-ink-2">Fees</dt>
        <dd class="text-lg font-bold tabular-nums">{{ formatCents(overall.feesCents) }}</dd>
      </div>
      <div class="bg-surface px-3 py-2">
        <dt class="text-xs text-ink-2">Shipping paid</dt>
        <dd class="text-lg font-bold tabular-nums">{{ formatCents(overall.shippingCents) }}</dd>
      </div>
      <div class="bg-surface px-3 py-2">
        <dt class="text-xs text-ink-2">Net profit</dt>
        <dd
          class="text-lg font-bold tabular-nums"
          :class="overall.netProfitCents >= 0 ? 'text-success' : 'text-danger'"
        >
          {{ formatSignedCents(overall.netProfitCents) }}
        </dd>
      </div>
    </dl>

    <p
      v-if="error"
      class="rounded-xl border border-danger/40 bg-danger/10 p-3 text-danger"
      role="alert"
    >
      {{ error }}
    </p>
    <div v-else-if="loading && rows.length === 0" class="space-y-2" aria-busy="true">
      <div v-for="n in 6" :key="n" class="h-14 animate-pulse rounded-xl bg-surface-2" />
    </div>
    <EmptyState
      v-else-if="rows.length === 0"
      :icon="Receipt"
      :title="platform || from || to ? 'No sales match' : 'No sales yet'"
      :message="
        platform || from || to
          ? 'Try a different platform or dates.'
          : 'Mark an item sold from the inventory and it shows up here.'
      "
      :action-label="platform || from || to ? undefined : 'Go to inventory'"
      :to="{ name: 'inventory' }"
    />

    <section
      v-for="month in months"
      :key="month.key"
      class="mb-6"
      :aria-labelledby="`m-${month.key}`"
    >
      <div
        class="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-1"
      >
        <h2 :id="`m-${month.key}`" class="text-lg font-bold">{{ month.label }}</h2>
        <p class="text-xs text-ink-2 tabular-nums">
          {{ month.totals.units }} sold · revenue {{ formatCents(month.totals.revenueCents) }} ·
          fees {{ formatCents(month.totals.feesCents) }} · shipping
          {{ formatCents(month.totals.shippingCents) }} ·
          <span
            class="font-semibold"
            :class="month.totals.netProfitCents >= 0 ? 'text-success' : 'text-danger'"
          >
            net {{ formatSignedCents(month.totals.netProfitCents) }}
          </span>
        </p>
      </div>

      <div
        v-if="isDesktop"
        class="grid grid-cols-[6rem_1fr_9rem_6rem_6rem_6rem_7rem] gap-x-3 px-2 pb-1 text-xs font-semibold text-ink-2"
        aria-hidden="true"
      >
        <span>Date</span><span>Item</span><span>Platform</span
        ><span class="text-right">Revenue</span> <span class="text-right">Fees</span
        ><span class="text-right">Shipping</span><span class="text-right">Net profit</span>
      </div>
      <ul class="divide-y divide-line">
        <li v-for="e in month.entries" :key="e.key">
          <!-- Entry header: a sale (opens the editor) or a bundle (expands) -->
          <button
            type="button"
            class="grid min-h-14 w-full items-center gap-x-3 py-2 text-left hover:bg-surface-2/60 lg:grid-cols-[6rem_1fr_9rem_6rem_6rem_6rem_7rem] lg:px-2"
            :class="isDesktop ? '' : 'grid-cols-[1fr_auto]'"
            :aria-expanded="e.bundleId ? expanded.has(e.key) : undefined"
            @click="e.bundleId ? toggle(e.key) : e.rows[0] && edit(e.rows[0])"
          >
            <span v-if="isDesktop" class="text-sm text-ink-2">{{ formatDate(e.soldAt) }}</span>
            <span class="min-w-0">
              <span class="flex items-center gap-1 font-semibold">
                <ChevronRight
                  v-if="e.bundleId"
                  class="size-4 shrink-0 transition-transform"
                  :class="{ 'rotate-90': expanded.has(e.key) }"
                  aria-hidden="true"
                />
                <Package v-if="e.bundleId" class="size-4 shrink-0 text-ink-2" aria-hidden="true" />
                <span class="truncate">{{ e.title }}</span>
              </span>
              <span v-if="!isDesktop" class="block text-xs text-ink-2">
                {{ formatDate(e.soldAt) }} · {{ platformLabels[e.platform] }}
                <template v-if="entryTotals(e).units > 1">
                  · {{ entryTotals(e).units }} copies</template
                >
              </span>
            </span>
            <template v-if="isDesktop">
              <span class="text-sm">{{ platformLabels[e.platform] }}</span>
              <span class="text-right text-sm tabular-nums">{{
                formatCents(entryTotals(e).revenueCents)
              }}</span>
              <span class="text-right text-sm text-ink-2 tabular-nums">{{
                formatCents(entryTotals(e).feesCents)
              }}</span>
              <span class="text-right text-sm text-ink-2 tabular-nums">{{
                formatCents(entryTotals(e).shippingCents)
              }}</span>
            </template>
            <span class="text-right tabular-nums">
              <span v-if="!isDesktop" class="block font-semibold">{{
                formatCents(entryTotals(e).revenueCents)
              }}</span>
              <span
                class="text-sm font-semibold"
                :class="entryTotals(e).netProfitCents >= 0 ? 'text-success' : 'text-danger'"
              >
                {{ formatSignedCents(entryTotals(e).netProfitCents) }}
              </span>
            </span>
          </button>

          <!-- Bundle parts -->
          <div
            v-if="e.bundleId && expanded.has(e.key)"
            class="mb-2 rounded-xl bg-surface-2/50 p-2 lg:ml-24"
          >
            <ul class="divide-y divide-line">
              <li v-for="r in e.rows" :key="r.id">
                <button
                  type="button"
                  class="flex min-h-11 w-full items-center justify-between gap-3 px-2 text-left text-sm hover:bg-surface-2"
                  @click="edit(r)"
                >
                  <span class="truncate"
                    >{{ r.item_name
                    }}<template v-if="r.quantity > 1"> ×{{ r.quantity }}</template></span
                  >
                  <span class="shrink-0 tabular-nums">
                    {{ formatCents(r.sale_price_cents) }}
                    <span :class="r.net_profit_cents >= 0 ? 'text-success' : 'text-danger'">{{
                      formatSignedCents(r.net_profit_cents)
                    }}</span>
                  </span>
                </button>
              </li>
            </ul>
            <BaseButton
              size="sm"
              variant="ghost"
              class="mt-1 text-danger"
              @click="bundleToDelete = e"
            >
              <Trash2 class="size-4" aria-hidden="true" /> Delete whole bundle
            </BaseButton>
          </div>
        </li>
      </ul>
    </section>

    <EditSaleSheet v-model:open="editOpen" :sale="editing" @changed="onChanged" />
    <ConfirmDialog
      :open="bundleToDelete !== null"
      :title="`Delete ${bundleToDelete?.title ?? 'bundle'}?`"
      message="Every item in it goes back into stock."
      confirm-label="Delete bundle"
      danger
      :loading="deleting"
      @update:open="(v) => !v && (bundleToDelete = null)"
      @confirm="removeBundle"
    />
  </div>
</template>
