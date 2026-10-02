<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSheet from '@/components/ui/BaseSheet.vue'
import ChipSelect from '@/components/ui/ChipSelect.vue'
import PlatformChips from './PlatformChips.vue'
import { useAppSettings } from '@/composables/useAppSettings'
import { recordBundleSale } from '@/composables/useSales'
import { estimateFeeCents } from '@/lib/fees'
import { isoFromLocal, localDateTimeValue } from '@/lib/datetime'
import { formatCents, formatSignedCents, parseMoneyToCents } from '@/lib/money'
import { bundleShares, lastPlatform, rememberPlatform, type BundleSplitMode } from '@/lib/sales'
import type { InventoryItem, SalesPlatform } from '@/types/inventory'

/** Several items sold as one listing: one price, split across them. */
const props = defineProps<{ items: InventoryItem[] }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ sold: [bundleId: string, count: number] }>()

const settings = useAppSettings()

const sellable = computed(() => props.items.filter((i) => i.units_left > 0))
const skipped = computed(() => props.items.length - sellable.value.length)

const quantities = ref<Record<string, number>>({})
const platform = ref<SalesPlatform | null>(null)
const mode = ref<BundleSplitMode | null>('even')
const total = ref('')
const totalEdited = ref(false)
const shippingCharged = ref('')
const shippingPaid = ref('')
const fee = ref('')
const feeEdited = ref(false)
const soldAt = ref(localDateTimeValue())
const notes = ref('')
const error = ref('')
const saving = ref(false)

const cents = (t: string) => (t.trim() === '' ? 0 : parseMoneyToCents(t))
const toText = (c: number) => (c / 100).toFixed(2)
const askingTotal = computed(() =>
  sellable.value.reduce(
    (sum, i) => sum + (i.list_price_cents ?? 0) * (quantities.value[i.id] ?? 1),
    0,
  ),
)

watch(open, (isOpen) => {
  if (!isOpen) return
  quantities.value = Object.fromEntries(sellable.value.map((i) => [i.id, 1]))
  platform.value = lastPlatform() ?? settings.defaultPlatform.value
  mode.value = 'even'
  totalEdited.value = false
  feeEdited.value = false
  total.value = askingTotal.value ? toText(askingTotal.value) : ''
  shippingCharged.value = ''
  shippingPaid.value = ''
  soldAt.value = localDateTimeValue()
  notes.value = ''
  error.value = ''
  updateFee()
})

watch(askingTotal, (c) => {
  if (!totalEdited.value) total.value = c ? toText(c) : ''
})

function updateFee() {
  if (feeEdited.value || !platform.value) return
  const rule = settings.feeRules.value[platform.value] ?? { percent: 0, fixed_cents: 0 }
  const base = (cents(total.value) ?? 0) + (cents(shippingCharged.value) ?? 0)
  fee.value = base > 0 ? toText(estimateFeeCents(base, rule)) : ''
}
watch([total, shippingCharged, platform], updateFee)

const shares = computed(() => {
  const totals = {
    salePriceCents: cents(total.value),
    shippingChargedCents: cents(shippingCharged.value),
    shippingCostCents: cents(shippingPaid.value),
    platformFeeCents: cents(fee.value),
  }
  if (Object.values(totals).some((v) => v === null)) return null
  return bundleShares(
    sellable.value.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: quantities.value[i.id] ?? 1,
      listPriceCents: i.list_price_cents,
      unitCostCents: i.cost_cents,
    })),
    totals as Record<keyof typeof totals, number>,
    mode.value ?? 'even',
  )
})
const totalProfit = computed(() => shares.value?.reduce((sum, s) => sum + s.profitCents, 0) ?? 0)
const noPrices = computed(
  () => mode.value === 'by_list_price' && sellable.value.every((i) => !i.list_price_cents),
)

async function save() {
  error.value = ''
  if (!platform.value) error.value = 'Pick where it sold.'
  else if (!total.value.trim() || cents(total.value) === null)
    error.value = 'Enter the total price, like 36.'
  else if (!shares.value) error.value = 'Check the amounts; use numbers like 4.50.'
  else if (noPrices.value)
    error.value = 'None of these have an asking price, so split evenly instead.'
  if (error.value || !platform.value || !shares.value) return

  saving.value = true
  try {
    const bundleId = await recordBundleSale({
      items: sellable.value.map((i) => ({ item_id: i.id, quantity: quantities.value[i.id] ?? 1 })),
      platform: platform.value,
      totalPriceCents: cents(total.value) ?? 0,
      shippingChargedCents: cents(shippingCharged.value) ?? 0,
      shippingCostCents: cents(shippingPaid.value) ?? 0,
      platformFeeCents: cents(fee.value) ?? 0,
      soldAt: isoFromLocal(soldAt.value),
      mode: mode.value ?? 'even',
      notes: notes.value.trim() || null,
    })
    rememberPlatform(platform.value)
    open.value = false
    emit('sold', bundleId, sellable.value.length)
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Couldn't record the bundle."
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseSheet
    v-model:open="open"
    title="Sell as a bundle"
    :description="`${sellable.length} items in one sale`"
  >
    <form id="bundle-form" class="space-y-4" novalidate @submit.prevent="save">
      <p v-if="skipped" class="rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-2">
        {{ skipped }} selected item{{ skipped === 1 ? ' has' : 's have' }} nothing left to sell and
        won't be included.
      </p>

      <PlatformChips v-model="platform" />

      <div class="grid grid-cols-2 gap-3">
        <BaseInput
          v-model="total"
          label="Total price"
          prefix="$"
          inputmode="decimal"
          :hint="askingTotal ? `Asking prices add up to ${formatCents(askingTotal)}` : undefined"
          @input="totalEdited = true"
        />
        <BaseInput
          v-model="fee"
          label="Platform fee"
          prefix="$"
          inputmode="decimal"
          :hint="feeEdited ? undefined : 'Estimated'"
          @input="feeEdited = true"
        />
        <BaseInput
          v-model="shippingCharged"
          label="Shipping we charged"
          prefix="$"
          inputmode="decimal"
        />
        <BaseInput v-model="shippingPaid" label="Shipping we paid" prefix="$" inputmode="decimal" />
      </div>

      <ChipSelect
        v-model="mode"
        label="Split the money"
        :options="[
          { value: 'even', label: 'Evenly' },
          { value: 'by_list_price', label: 'By asking price' },
        ]"
      />

      <div class="overflow-hidden rounded-xl border border-line">
        <table class="w-full text-sm">
          <caption class="sr-only">
            Each item's share
          </caption>
          <thead class="bg-surface-2 text-left text-xs text-ink-2">
            <tr>
              <th class="px-3 py-2">Item</th>
              <th class="px-2 py-2 text-right">Qty</th>
              <th class="px-3 py-2 text-right">Share</th>
              <th class="px-3 py-2 text-right">Profit</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(i, idx) in sellable" :key="i.id" class="border-t border-line">
              <td class="px-3 py-2">
                <span class="line-clamp-2">{{ i.name }}</span>
              </td>
              <td class="px-2 py-2 text-right">
                <select
                  v-if="i.units_left > 1"
                  v-model.number="quantities[i.id]"
                  class="min-h-9 rounded-lg border border-line bg-surface px-1"
                  :aria-label="`How many of ${i.name}`"
                >
                  <option v-for="n in i.units_left" :key="n" :value="n">{{ n }}</option>
                </select>
                <span v-else>1</span>
              </td>
              <td class="px-3 py-2 text-right tabular-nums">
                {{ shares ? formatCents(shares[idx]?.salePriceCents ?? 0) : '—' }}
              </td>
              <td
                class="px-3 py-2 text-right tabular-nums"
                :class="(shares?.[idx]?.profitCents ?? 0) >= 0 ? 'text-success' : 'text-danger'"
              >
                {{ shares ? formatSignedCents(shares[idx]?.profitCents ?? 0) : '—' }}
              </td>
            </tr>
          </tbody>
          <tfoot v-if="shares" class="border-t-2 border-line font-semibold">
            <tr>
              <td class="px-3 py-2" colspan="2">Total</td>
              <td class="px-3 py-2 text-right tabular-nums">
                {{ formatCents(cents(total) ?? 0) }}
              </td>
              <td
                class="px-3 py-2 text-right tabular-nums"
                :class="totalProfit >= 0 ? 'text-success' : 'text-danger'"
              >
                {{ formatSignedCents(totalProfit) }}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <BaseInput v-model="soldAt" label="When" type="datetime-local" />
      <BaseInput v-model="notes" label="Notes" autocomplete="off" />
      <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
    </form>
    <template #footer>
      <BaseButton
        type="submit"
        form="bundle-form"
        block
        :loading="saving"
        :disabled="sellable.length === 0"
      >
        Record bundle sale
      </BaseButton>
    </template>
  </BaseSheet>
</template>
