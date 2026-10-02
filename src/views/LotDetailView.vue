<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Info, Layers, Pencil, Scissors } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import ChipSelect from '@/components/ui/ChipSelect.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import LotSheet from '@/components/sales/LotSheet.vue'
import {
  getLot,
  splitLotCost,
  type LotAcquisition,
  type LotRow,
  type LotSplitMode,
  type SplitPreviewRow,
} from '@/composables/useLots'
import { useToast } from '@/composables/useToast'
import { formatDate } from '@/lib/dates'
import { formatCents } from '@/lib/money'

const props = defineProps<{ id: string }>()
const toast = useToast()

const lot = ref<LotRow | null>(null)
const acquisitions = ref<LotAcquisition[]>([])
const loading = ref(true)
const notFound = ref(false)
const editOpen = ref(false)

async function load() {
  try {
    const result = await getLot(props.id)
    if (!result) {
      notFound.value = true
      return
    }
    lot.value = result.lot
    acquisitions.value = result.acquisitions
  } catch {
    toast.error("Couldn't load this lot.")
  } finally {
    loading.value = false
  }
}
watch(() => props.id, load, { immediate: true })

const recordedTotal = computed(() =>
  acquisitions.value.reduce((s, a) => s + a.quantity * a.unit_cost_cents, 0),
)
const copies = computed(() => acquisitions.value.reduce((s, a) => s + a.quantity, 0))

// ---------------------------------------------------------------- split
const mode = ref<LotSplitMode | null>('even')
const preview = ref<SplitPreviewRow[] | null>(null)
const previewing = ref(false)
const confirmOpen = ref(false)
const applying = ref(false)
const splitError = ref('')

watch(mode, () => (preview.value = null))

async function showPreview() {
  splitError.value = ''
  previewing.value = true
  try {
    preview.value = await splitLotCost(props.id, mode.value ?? 'even', true)
  } catch (e) {
    splitError.value = e instanceof Error ? e.message : "Couldn't preview the split."
  } finally {
    previewing.value = false
  }
}

const previewTotal = computed(() => preview.value?.reduce((s, r) => s + r.total_cents, 0) ?? 0)

async function apply() {
  applying.value = true
  try {
    await splitLotCost(props.id, mode.value ?? 'even', false)
    confirmOpen.value = false
    preview.value = null
    toast.success('Lot cost split. Item costs are updated.')
    await load()
  } catch (e) {
    splitError.value = e instanceof Error ? e.message : "Couldn't split the cost."
  } finally {
    applying.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <div
      v-if="loading && !lot"
      class="h-40 animate-pulse rounded-2xl bg-surface-2"
      aria-busy="true"
    />
    <EmptyState
      v-else-if="notFound || !lot"
      :icon="Layers"
      title="Lot not found"
      action-label="All lots"
      :to="{ name: 'lots' }"
    />

    <div v-else class="space-y-6">
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <RouterLink
            :to="{ name: 'lots' }"
            class="text-sm font-semibold text-ink-2 hover:underline"
            >Lots</RouterLink
          >
          <h2 class="text-2xl font-black">{{ lot.name }}</h2>
          <p class="text-ink-2">
            {{ [formatDate(lot.purchased_at), lot.source].filter(Boolean).join(' · ') }}
          </p>
        </div>
        <BaseButton variant="secondary" @click="editOpen = true"
          ><Pencil class="size-4" aria-hidden="true" /> Edit lot</BaseButton
        >
      </header>

      <dl
        class="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4"
      >
        <div class="bg-surface px-3 py-2">
          <dt class="text-xs text-ink-2">Lot total</dt>
          <dd class="text-lg font-bold tabular-nums">{{ formatCents(lot.total_cost_cents) }}</dd>
        </div>
        <div class="bg-surface px-3 py-2">
          <dt class="text-xs text-ink-2">Copies</dt>
          <dd class="text-lg font-bold tabular-nums">{{ lot.units_bought }}</dd>
        </div>
        <div class="bg-surface px-3 py-2">
          <dt class="text-xs text-ink-2">Back so far</dt>
          <dd class="text-lg font-bold tabular-nums">{{ formatCents(lot.net_revenue_cents) }}</dd>
        </div>
        <div class="bg-surface px-3 py-2">
          <dt class="text-xs text-ink-2">Paid back</dt>
          <dd class="text-lg font-bold tabular-nums">{{ lot.paid_back_percent ?? 0 }}%</dd>
        </div>
      </dl>

      <p
        v-if="copies && recordedTotal !== lot.total_cost_cents"
        class="rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm"
        role="status"
      >
        Item costs in this lot add up to {{ formatCents(recordedTotal) }}, not the lot's
        {{ formatCents(lot.total_cost_cents) }}. Split the cost below to fix that.
      </p>

      <!-- Split -->
      <section
        class="space-y-3 rounded-2xl border border-line bg-surface p-4"
        aria-labelledby="split-heading"
      >
        <h3 id="split-heading" class="font-bold">Split the cost</h3>
        <ChipSelect
          v-model="mode"
          label="How"
          :options="[
            { value: 'even', label: 'Even (every copy costs the same)' },
            { value: 'by_list_price', label: 'By asking price' },
          ]"
        />
        <div class="flex flex-wrap gap-2">
          <BaseButton
            variant="secondary"
            :loading="previewing"
            :disabled="!copies"
            @click="showPreview"
            >Preview</BaseButton
          >
          <BaseButton v-if="preview" @click="confirmOpen = true"
            ><Scissors class="size-4" aria-hidden="true" /> Apply this split</BaseButton
          >
        </div>
        <p v-if="splitError" class="text-sm text-danger" role="alert">{{ splitError }}</p>

        <div v-if="preview" class="overflow-hidden rounded-xl border border-line">
          <table class="w-full text-sm">
            <caption class="sr-only">
              Cost per copy after the split
            </caption>
            <thead class="bg-surface-2 text-left text-xs text-ink-2">
              <tr>
                <th class="px-3 py-2">Item</th>
                <th class="px-2 py-2 text-right">Copies</th>
                <th class="px-3 py-2 text-right">Each</th>
                <th class="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in preview" :key="r.item_id" class="border-t border-line">
                <td class="px-3 py-2">{{ r.item_name }}</td>
                <td class="px-2 py-2 text-right tabular-nums">{{ r.quantity }}</td>
                <td class="px-3 py-2 text-right tabular-nums">
                  {{ formatCents(r.unit_cost_cents) }}
                </td>
                <td class="px-3 py-2 text-right tabular-nums">{{ formatCents(r.total_cents) }}</td>
              </tr>
            </tbody>
            <tfoot class="border-t-2 border-line font-semibold">
              <tr>
                <td class="px-3 py-2" colspan="3">Adds up to</td>
                <td class="px-3 py-2 text-right tabular-nums">{{ formatCents(previewTotal) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <!-- Acquisitions -->
      <section aria-labelledby="acq-heading">
        <h3 id="acq-heading" class="mb-2 font-bold">What came in this lot</h3>
        <p
          v-if="acquisitions.length === 0"
          class="rounded-2xl border border-dashed border-line p-6 text-center text-ink-2"
        >
          Nothing yet. Choose this lot when adding items or volumes.
        </p>
        <ul v-else class="divide-y divide-line rounded-2xl border border-line bg-surface">
          <li
            v-for="a in acquisitions"
            :key="a.id"
            class="flex flex-wrap items-center justify-between gap-x-3 px-4 py-2"
          >
            <RouterLink
              :to="{ name: 'item-detail', params: { id: a.item_id } }"
              class="font-medium hover:underline"
              >{{ a.item_name }}</RouterLink
            >
            <span class="text-sm tabular-nums">
              {{ a.quantity }} × {{ formatCents(a.unit_cost_cents) }}
              <span class="text-ink-2"> · {{ formatDate(a.purchased_at) }}</span>
            </span>
          </li>
        </ul>
        <p class="mt-3 flex items-start gap-2 text-sm text-ink-2">
          <Info class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          When a volume has copies from two lots, its sales are shared between them by copy count.
          Copies of the same volume are interchangeable, so there's no telling which one actually
          sold.
        </p>
      </section>
    </div>

    <LotSheet v-model:open="editOpen" :lot="lot" @saved="load" />
    <ConfirmDialog
      v-model:open="confirmOpen"
      title="Apply this split?"
      :message="`Every copy's cost in this lot is rewritten so they add up to ${lot ? formatCents(lot.total_cost_cents) : ''}. Average costs and profits update to match.`"
      confirm-label="Apply split"
      :loading="applying"
      @confirm="apply"
    />
  </div>
</template>
