<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Download, Printer } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import {
  exportExpenses,
  exportItems,
  exportLots,
  exportSales,
  loadTaxYear,
  type TaxYear,
  type YearExport,
} from '@/composables/useTaxes'
import { useToast } from '@/composables/useToast'
import { downloadCsv, toCsv } from '@/lib/csv'
import { formatDate, todayIso } from '@/lib/dates'
import { formatCents } from '@/lib/money'

/** A yearly bookkeeping summary and CSV exports, printable for a tax professional. */
const route = useRoute()
const router = useRouter()
const toast = useToast()
const today = todayIso()
const thisYear = Number(today.slice(0, 4))

const yearOptions = Array.from({ length: 6 }, (_, i) => String(thisYear - i)).map((y) => ({
  value: y,
  label: y,
}))
const year = computed({
  get: () => {
    const q = Number(route.query.year)
    return Number.isInteger(q) && q > 2000 && q <= thisYear ? String(q) : String(thisYear)
  },
  set: (y: string) => void router.replace({ query: y === String(thisYear) ? {} : { year: y } }),
})

const data = ref<TaxYear | null>(null)
const loading = ref(true)
const error = ref('')
watch(
  year,
  async (y) => {
    loading.value = true
    try {
      data.value = await loadTaxYear(Number(y), today)
      error.value = ''
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Couldn't load the year."
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

const lines = computed(() => {
  const t = data.value?.totals
  if (!t) return []
  return [
    {
      label: 'Gross receipts (sales + shipping charged)',
      cents: t.gross_receipts_cents,
      strong: true,
    },
    { label: 'Platform fees', cents: -t.fees_cents },
    { label: 'Shipping paid', cents: -t.shipping_paid_cents },
    ...(t.other_sale_costs_cents
      ? [{ label: 'Other costs on sales', cents: -t.other_sale_costs_cents }]
      : []),
    { label: 'Cost of goods sold', cents: -t.cogs_cents },
    { label: 'Profit from sales', cents: t.sales_profit_cents, strong: true },
  ]
})

const printPage = () => window.print()

const exporting = ref<string | null>(null)
async function download(kind: string, build: (y: number) => Promise<YearExport>) {
  exporting.value = kind
  try {
    const e = await build(Number(year.value))
    downloadCsv(e.filename, toCsv(e.rows, e.columns))
    toast.success(`Downloaded ${e.rows.length} ${kind}.`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : `Couldn't export ${kind}.`)
  } finally {
    exporting.value = null
  }
}
const exports: { kind: string; build: (y: number) => Promise<YearExport> }[] = [
  { kind: 'items', build: exportItems },
  { kind: 'sales', build: exportSales },
  { kind: 'expenses', build: exportExpenses },
  { kind: 'lots', build: exportLots },
]

function inventoryNote(v: { date: string; computed: boolean } | null) {
  if (!v) return 'No record'
  return v.computed ? `today's stock (no snapshot yet)` : `as of ${formatDate(v.date)}`
}
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-5">
    <p
      class="rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-ink-2 print:border-0 print:bg-transparent print:p-0"
      role="note"
    >
      This is a bookkeeping summary to bring to a tax professional, not tax advice.
    </p>

    <div class="flex flex-wrap items-end gap-3 print:hidden">
      <BaseSelect v-model="year" label="Year" :options="yearOptions" class="w-32" />
      <BaseButton variant="secondary" @click="printPage">
        <Printer class="size-4" aria-hidden="true" /> Print
      </BaseButton>
    </div>

    <h2 class="hidden text-2xl font-black print:block">Tillki · {{ year }} summary</h2>

    <p
      v-if="error"
      class="rounded-xl border border-danger/40 bg-danger/10 p-3 text-danger"
      role="alert"
    >
      {{ error }}
    </p>
    <div v-else-if="loading" class="h-80 animate-pulse rounded-2xl bg-surface-2" aria-busy="true" />

    <template v-else-if="data">
      <section class="rounded-2xl border border-line bg-surface p-4 print:border-0 print:p-0">
        <h2 class="mb-2 text-lg font-bold">Income, {{ year }}</h2>
        <dl class="divide-y divide-line">
          <div v-for="l in lines" :key="l.label" class="flex justify-between gap-4 py-2">
            <dt :class="l.strong ? 'font-semibold' : 'text-ink-2'">{{ l.label }}</dt>
            <dd class="tabular-nums" :class="l.strong ? 'font-semibold' : ''">
              {{ formatCents(l.cents) }}
            </dd>
          </div>
        </dl>
        <p class="mt-1 text-xs text-muted">
          {{ data.totals.units_sold }} units sold. Shipping charged ({{
            formatCents(data.totals.shipping_charged_cents)
          }}) is included in gross receipts.
        </p>
      </section>

      <section class="rounded-2xl border border-line bg-surface p-4 print:border-0 print:p-0">
        <h2 class="mb-2 text-lg font-bold">Other expenses</h2>
        <p v-if="data.expenses.length === 0" class="text-sm text-ink-2">
          No expenses logged this year.
        </p>
        <dl v-else class="divide-y divide-line">
          <div v-for="e in data.expenses" :key="e.category" class="flex justify-between gap-4 py-2">
            <dt class="text-ink-2">{{ e.label }}</dt>
            <dd class="tabular-nums">{{ formatCents(e.amount_cents) }}</dd>
          </div>
          <div class="flex justify-between gap-4 py-2 font-semibold">
            <dt>Total expenses</dt>
            <dd class="tabular-nums">{{ formatCents(data.totals.expenses_cents) }}</dd>
          </div>
        </dl>
      </section>

      <section class="rounded-2xl border-2 border-ink/80 bg-surface p-4 print:p-3">
        <div class="flex items-baseline justify-between gap-4">
          <h2 class="text-lg font-black">Net profit</h2>
          <p
            class="text-2xl font-black tabular-nums"
            :class="data.totals.net_profit_cents >= 0 ? 'text-success' : 'text-danger'"
          >
            {{ formatCents(data.totals.net_profit_cents) }}
          </p>
        </div>
        <p class="mt-1 text-sm text-ink-2">
          Profit from sales minus expenses. The dashboard's "Net profit" tile for {{ year }} shows
          profit from sales ({{ formatCents(data.totals.sales_profit_cents) }}), with this figure in
          its "after expenses" line.
        </p>
      </section>

      <section class="rounded-2xl border border-line bg-surface p-4 print:border-0 print:p-0">
        <h2 class="mb-2 text-lg font-bold">Inventory at cost</h2>
        <dl class="divide-y divide-line">
          <div class="flex justify-between gap-4 py-2">
            <dt class="text-ink-2">
              Start of {{ year }} <span class="text-xs">({{ inventoryNote(data.starting) }})</span>
            </dt>
            <dd class="tabular-nums">
              {{ data.starting ? formatCents(data.starting.cost_basis_cents) : '—' }}
            </dd>
          </div>
          <div class="flex justify-between gap-4 py-2">
            <dt class="text-ink-2">
              End of {{ year }} <span class="text-xs">({{ inventoryNote(data.ending) }})</span>
            </dt>
            <dd class="tabular-nums">
              {{ data.ending ? formatCents(data.ending.cost_basis_cents) : '—' }}
            </dd>
          </div>
        </dl>
        <p class="mt-1 text-xs text-muted">
          From the nightly inventory snapshots: copies on hand times average cost.
        </p>
      </section>

      <section class="rounded-2xl border border-line bg-surface p-4 print:hidden">
        <h2 class="mb-1 text-lg font-bold">Download CSVs for {{ year }}</h2>
        <p class="mb-3 text-sm text-ink-2">
          Money is in dollars with 2 decimals; opens in Excel or Sheets.
        </p>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <BaseButton
            v-for="e in exports"
            :key="e.kind"
            variant="secondary"
            :loading="exporting === e.kind"
            :disabled="exporting !== null"
            @click="download(e.kind, e.build)"
          >
            <Download class="size-4" aria-hidden="true" />
            {{ e.kind[0]?.toUpperCase() + e.kind.slice(1) }}
          </BaseButton>
        </div>
      </section>
    </template>
  </div>
</template>
