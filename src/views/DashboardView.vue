<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LayoutDashboard, RefreshCw } from 'lucide-vue-next'
import AgingChart from '@/components/charts/AgingChart.vue'
import ChartCard from '@/components/charts/ChartCard.vue'
import InventoryValueChart from '@/components/charts/InventoryValueChart.vue'
import ItemsAddedChart from '@/components/charts/ItemsAddedChart.vue'
import KpiTile from '@/components/charts/KpiTile.vue'
import MoneyFlowChart from '@/components/charts/MoneyFlowChart.vue'
import PlatformChart from '@/components/charts/PlatformChart.vue'
import RevenueProfitChart from '@/components/charts/RevenueProfitChart.vue'
import TopSetsChart from '@/components/charts/TopSetsChart.vue'
import BaseChip from '@/components/ui/BaseChip.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useDashboard, type AgingBucket } from '@/composables/useDashboard'
import {
  daysInRange,
  describeRange,
  parseRangeQuery,
  percentChange,
  previousRange,
  rangePresetLabels,
  rangePresets,
  resolveRange,
  shortDay,
  toRangeQuery,
  type RangePreset,
  type RangeSelection,
} from '@/lib/dateRange'
import { todayIso } from '@/lib/dates'
import { defaultFilters, toInventoryQuery } from '@/lib/inventoryQuery'
import { formatCents, formatCompactCents } from '@/lib/money'

const route = useRoute()
const router = useRouter()

// ---------------------------------------------------------------- range (in the URL)
const selection = computed(() => parseRangeQuery(route.query))
const range = computed(() => resolveRange(selection.value, todayIso()))
const previous = computed(() => previousRange(selection.value, range.value))

function setSelection(next: RangeSelection) {
  void router.replace({ query: toRangeQuery(next) })
}
function pickPreset(preset: RangePreset) {
  if (preset === 'custom') {
    setSelection({
      preset,
      from: range.value.start === '2000-01-01' ? null : range.value.start,
      to: range.value.end,
    })
  } else {
    setSelection({ preset, from: null, to: null })
  }
}
function setCustom(field: 'from' | 'to', value: string) {
  setSelection({ ...selection.value, preset: 'custom', [field]: value || null })
}

const { data, loading, error, reload } = useDashboard(range, previous)
const firstLoad = computed(() => loading.value && !data.value)

// ---------------------------------------------------------------- KPI tiles
const vsLabel = computed(() =>
  previous.value ? `vs previous ${daysInRange(previous.value)} days` : '',
)
const stockSince = computed(() => {
  const snap = data.value?.snapshotAtStart
  return snap ? `since ${shortDay(snap.snapshot_date)}` : ''
})

const kpis = computed(() => {
  const d = data.value
  const s = d?.summary
  const p = d?.previous
  const o = d?.overview
  const snap = d?.snapshotAtStart
  const days = s?.avg_days_to_sell ?? null
  // Potential profit's trend: asking value minus cost, now vs the start of the range.
  const marginNow = o ? o.list_value_cents - o.cost_basis_cents : 0
  const marginThen = snap ? snap.list_value_cents - snap.cost_basis_cents : null
  return [
    {
      label: 'Revenue',
      value: formatCents(s?.revenue_cents ?? 0),
      change: p ? percentChange(s?.revenue_cents ?? 0, p.revenue_cents) : null,
      changeLabel: vsLabel.value,
      hint: undefined as string | undefined,
      upIsGood: true,
    },
    {
      label: 'Net profit',
      value: formatCents(s?.sales_profit_cents ?? 0),
      change: p ? percentChange(s?.sales_profit_cents ?? 0, p.sales_profit_cents) : null,
      changeLabel: vsLabel.value,
      hint: s?.expenses_cents
        ? `${formatCents(s.net_profit_cents)} after ${formatCents(s.expenses_cents)} expenses`
        : 'No expenses in this range',
      upIsGood: true,
    },
    {
      label: 'Units sold',
      value: String(s?.units_sold ?? 0),
      change: p ? percentChange(s?.units_sold ?? 0, p.units_sold) : null,
      changeLabel: vsLabel.value,
      hint: undefined,
      upIsGood: true,
    },
    {
      label: 'Avg days to sell',
      value: days === null ? '—' : `${days} days`,
      change: p && days !== null ? percentChange(days, p.avg_days_to_sell ?? null) : null,
      changeLabel: vsLabel.value,
      hint: undefined,
      upIsGood: false,
    },
    {
      label: 'Stock cost basis',
      value: formatCents(o?.cost_basis_cents ?? 0),
      change: snap ? percentChange(o?.cost_basis_cents ?? 0, snap.cost_basis_cents) : null,
      changeLabel: stockSince.value,
      hint: o ? `${o.units_in_stock} copies on the shelves` : undefined,
      upIsGood: true,
    },
    {
      label: 'Potential profit',
      value: formatCents(o?.potential_profit_cents ?? 0),
      change: snap ? percentChange(marginNow, marginThen) : null,
      changeLabel: stockSince.value,
      hint: o
        ? `If it all sells at ${formatCompactCents(o.list_value_cents)} asking, after fees`
        : undefined,
      upIsGood: true,
    },
  ]
})

// ---------------------------------------------------------------- charts
const rangeText = computed(() => describeRange(selection.value, range.value))
const monthWidth = (n: number) => (n > 6 ? n * 56 : 0)

const hasSales = computed(() => (data.value?.summary?.sale_count ?? 0) > 0)
const pnlEmpty = computed(
  () => !data.value?.pnl.some((m) => m.revenue_cents !== 0 || m.expenses_cents !== 0),
)
const spendEmpty = computed(
  () =>
    !data.value?.spend.some(
      (m) => m.revenue_cents !== 0 || m.purchased_cents !== 0 || m.expenses_cents !== 0,
    ),
)
const agingEmpty = computed(() => !data.value?.aging.some((b) => b.item_count > 0))
const addedEmpty = computed(() => !data.value?.added.some((r) => r.item_count > 0))
const addedPeriods = computed(() => new Set(data.value?.added.map((r) => r.period)).size)
const nothingAtAll = computed(() => {
  const o = data.value?.overview
  return !!o && o.one_off_count + o.set_volume_count === 0 && o.revenue_cents === 0
})

function openBucket(b: AgingBucket) {
  void router.push({
    name: 'inventory',
    query: toInventoryQuery({
      ...defaultFilters,
      status: ['in_stock', 'listed'],
      age: { min: b.min_days, max: b.max_days },
      sort: 'days_in_stock',
      dir: 'desc',
    }),
  })
}
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-4">
    <!-- Range picker -->
    <div class="space-y-2">
      <div
        class="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0"
        role="group"
        aria-label="Date range"
      >
        <BaseChip
          v-for="p in rangePresets"
          :key="p"
          :selected="selection.preset === p"
          @toggle="pickPreset(p)"
          >{{ rangePresetLabels[p] }}</BaseChip
        >
      </div>
      <div v-if="selection.preset === 'custom'" class="grid max-w-md grid-cols-2 gap-3">
        <BaseInput
          :model-value="range.start"
          label="From"
          type="date"
          @update:model-value="setCustom('from', $event)"
        />
        <BaseInput
          :model-value="range.end"
          label="To"
          type="date"
          @update:model-value="setCustom('to', $event)"
        />
      </div>
    </div>

    <p
      v-if="error"
      class="flex flex-wrap items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-danger"
      role="alert"
    >
      Couldn't load the dashboard: {{ error }}
      <button
        type="button"
        class="inline-flex min-h-11 items-center gap-1 font-semibold underline"
        @click="reload"
      >
        <RefreshCw class="size-4" aria-hidden="true" /> Try again
      </button>
    </p>

    <EmptyState
      v-if="nothingAtAll"
      :icon="LayoutDashboard"
      title="Nothing to chart yet"
      message="Add some inventory and record a sale, and this page fills in with how the business is doing."
      action-label="Go to inventory"
      :to="{ name: 'inventory' }"
    />

    <template v-else>
      <!-- KPI tiles -->
      <div
        class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
        :aria-busy="firstLoad"
        aria-label="Key numbers"
        role="group"
      >
        <KpiTile
          v-for="k in kpis"
          :key="k.label"
          :label="k.label"
          :value="k.value"
          :change="k.change"
          :change-label="k.changeLabel"
          :up-is-good="k.upIsGood"
          :hint="k.hint"
          :loading="firstLoad"
        />
      </div>

      <!-- Charts -->
      <div
        class="grid grid-cols-1 gap-4 lg:grid-cols-2"
        :class="{ 'opacity-60 transition-opacity': loading && !firstLoad }"
      >
        <ChartCard
          title="Revenue and profit"
          subtitle="By month. Profit after expenses is the dashed line."
          :loading="firstLoad"
          :empty="pnlEmpty"
          :min-width="monthWidth(data?.pnl.length ?? 0)"
          :ask="`How did revenue and net profit change month to month over ${rangeText}? What drove the best and worst months?`"
        >
          <RevenueProfitChart :months="data?.pnl ?? []" />
        </ChartCard>

        <ChartCard
          title="Inventory value"
          subtitle="What the stock on the shelves cost vs what we're asking"
          :loading="firstLoad"
          :empty="(data?.snapshots.length ?? 0) < 2"
          empty-text="Not enough daily snapshots in this range yet. One is saved every night."
          :ask="`How has our inventory value (cost basis vs asking value) changed over ${rangeText}?`"
        >
          <InventoryValueChart :snapshots="data?.snapshots ?? []" />
        </ChartCard>

        <ChartCard
          title="Money in vs money out"
          subtitle="Revenue vs stock bought and expenses, by month"
          :loading="firstLoad"
          :empty="spendEmpty"
          :min-width="monthWidth(data?.spend.length ?? 0)"
          :ask="`Compare what we spent on stock and expenses with what we earned each month over ${rangeText}. Are we buying faster than we sell?`"
        >
          <MoneyFlowChart :months="data?.spend ?? []" />
        </ChartCard>

        <ChartCard
          title="Sales by platform"
          :subtitle="`Revenue share, ${rangeText}`"
          :loading="firstLoad"
          :empty="!hasSales"
          :height="200"
          :ask="`Which platform worked best for us over ${rangeText}, counting fees and days to sell?`"
        >
          <PlatformChart :platforms="data?.platforms ?? []" />
        </ChartCard>

        <ChartCard
          title="Top sets and series"
          subtitle="By net profit in this range"
          :loading="firstLoad"
          :empty="!data?.sets.some((r) => r.units_sold > 0)"
          :height="Math.max(160, (data?.sets.length ?? 0) * 34 + 40)"
          :ask="`Which sets and series made the most net profit over ${rangeText}, and which should we buy more of?`"
        >
          <TopSetsChart :rows="data?.sets ?? []" />
        </ChartCard>

        <ChartCard
          title="Aging stock"
          subtitle="In stock or listed, by days since we bought it. Tap a bar to see the items."
          :loading="firstLoad"
          :empty="agingEmpty"
          empty-text="Nothing in stock right now."
          :ask="`Which items have been sitting in stock the longest, and what should we do with them?`"
        >
          <AgingChart :buckets="data?.aging ?? []" @select="openBucket" />
        </ChartCard>

        <ChartCard
          class="lg:col-span-2"
          :title="data?.addedGrain === 'month' ? 'Items added per month' : 'Items added per week'"
          subtitle="Split by who added them"
          :loading="firstLoad"
          :empty="addedEmpty"
          :min-width="addedPeriods > 12 ? addedPeriods * 36 : 0"
          :ask="`How many items did each of us add over ${rangeText}, and is the pace going up or down?`"
        >
          <ItemsAddedChart :rows="data?.added ?? []" :grain="data?.addedGrain ?? 'week'" />
        </ChartCard>
      </div>
    </template>
  </div>
</template>
