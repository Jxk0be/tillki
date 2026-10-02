<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSheet from '@/components/ui/BaseSheet.vue'
import BaseTextarea from '@/components/ui/BaseTextarea.vue'
import QuantityStepper from '@/components/ui/QuantityStepper.vue'
import PlatformChips from './PlatformChips.vue'
import { useAppSettings } from '@/composables/useAppSettings'
import { recordSale } from '@/composables/useSales'
import { estimateFeeCents } from '@/lib/fees'
import { isoFromLocal, localDateTimeValue } from '@/lib/datetime'
import { formatCents, formatSignedCents, parseMoneyToCents } from '@/lib/money'
import { keptCents, lastPlatform, rememberPlatform, saleProfitCents } from '@/lib/sales'
import type { InventoryItem, SalesPlatform } from '@/types/inventory'

/** Two taps and a price: record that an item sold. */
const props = defineProps<{ item: InventoryItem | null }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ sold: [saleId: string, item: InventoryItem] }>()

const settings = useAppSettings()

const platform = ref<SalesPlatform | null>(null)
const quantity = ref(1)
const price = ref('')
const priceEdited = ref(false)
const shippingCharged = ref('')
const shippingPaid = ref('')
const fee = ref('')
const feeEdited = ref(false)
const other = ref('')
const soldAt = ref(localDateTimeValue())
const notes = ref('')
const errors = ref<Record<string, string>>({})
const saving = ref(false)

const toText = (cents: number) => (cents / 100).toFixed(2)
const cents = (text: string) => (text.trim() === '' ? 0 : parseMoneyToCents(text))

watch(open, (isOpen) => {
  if (!isOpen || !props.item) return
  platform.value = lastPlatform() ?? settings.defaultPlatform.value
  quantity.value = 1
  priceEdited.value = false
  feeEdited.value = false
  price.value = props.item.list_price_cents === null ? '' : toText(props.item.list_price_cents)
  shippingCharged.value = ''
  shippingPaid.value = ''
  other.value = ''
  soldAt.value = localDateTimeValue()
  notes.value = ''
  errors.value = {}
  updateFee()
})

// Price follows quantity until you type your own.
watch(quantity, (q) => {
  if (!priceEdited.value && props.item?.list_price_cents != null)
    price.value = toText(props.item.list_price_cents * q)
})

function updateFee() {
  if (feeEdited.value || !platform.value) return
  const rule = settings.feeRules.value[platform.value] ?? { percent: 0, fixed_cents: 0 }
  const base = (cents(price.value) ?? 0) + (cents(shippingCharged.value) ?? 0)
  fee.value = base > 0 ? toText(estimateFeeCents(base, rule)) : ''
}
watch([price, shippingCharged, platform], updateFee)

const money = computed(() => {
  const values = {
    salePriceCents: cents(price.value),
    shippingChargedCents: cents(shippingCharged.value),
    shippingCostCents: cents(shippingPaid.value),
    platformFeeCents: cents(fee.value),
    otherCostCents: cents(other.value),
  }
  if (Object.values(values).some((v) => v === null)) return null
  return values as Record<keyof typeof values, number>
})

async function save() {
  const item = props.item
  if (!item) return
  errors.value = {}
  if (!platform.value) errors.value.platform = 'Pick where it sold.'
  if (cents(price.value) === null || price.value.trim() === '')
    errors.value.price = 'Enter the sale price, like 12.'
  for (const [key, text] of Object.entries({ shippingCharged, shippingPaid, fee, other })) {
    if (cents(text.value) === null) errors.value[key] = 'Use an amount like 4.50.'
  }
  if (Object.keys(errors.value).length || !money.value || !platform.value) return

  saving.value = true
  try {
    const id = await recordSale({
      itemId: item.id,
      quantity: quantity.value,
      platform: platform.value,
      ...money.value,
      soldAt: isoFromLocal(soldAt.value),
      notes: notes.value.trim() || null,
    })
    rememberPlatform(platform.value)
    open.value = false
    emit('sold', id, item)
  } catch (e) {
    errors.value.form = e instanceof Error ? e.message : "Couldn't record the sale."
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseSheet v-model:open="open" title="Mark sold" :description="item?.name">
    <form v-if="item" id="mark-sold-form" class="space-y-4" novalidate @submit.prevent="save">
      <PlatformChips v-model="platform" />
      <p v-if="errors.platform" class="-mt-2 text-sm text-danger">{{ errors.platform }}</p>

      <div class="grid grid-cols-2 gap-3">
        <BaseInput
          v-model="price"
          :label="quantity > 1 ? `Sale price (all ${quantity})` : 'Sale price'"
          prefix="$"
          inputmode="decimal"
          autocomplete="off"
          :error="errors.price"
          @input="priceEdited = true"
        />
        <QuantityStepper
          v-if="item.units_left > 1"
          v-model="quantity"
          label="How many"
          :max="item.units_left"
        />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <BaseInput
          v-model="shippingCharged"
          label="Shipping we charged"
          prefix="$"
          inputmode="decimal"
          :error="errors.shippingCharged"
        />
        <BaseInput
          v-model="shippingPaid"
          label="Shipping we paid"
          prefix="$"
          inputmode="decimal"
          :error="errors.shippingPaid"
        />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <BaseInput
          v-model="fee"
          label="Platform fee"
          prefix="$"
          inputmode="decimal"
          :hint="
            feeEdited ? undefined : 'Estimated from your fee rules. Change it to the real fee.'
          "
          :error="errors.fee"
          @input="feeEdited = true"
        />
        <BaseInput
          v-model="other"
          label="Other costs"
          prefix="$"
          inputmode="decimal"
          :error="errors.other"
        />
      </div>
      <BaseInput v-model="soldAt" label="When" type="datetime-local" />
      <BaseTextarea v-model="notes" label="Notes" :rows="2" />

      <p v-if="money" class="rounded-lg bg-surface-2 px-3 py-2 text-sm" aria-live="polite">
        You keep <span class="font-semibold">{{ formatCents(keptCents(money)) }}</span
        >, profit
        <span
          class="font-semibold"
          :class="
            saleProfitCents(money, item.cost_cents, quantity) >= 0 ? 'text-success' : 'text-danger'
          "
          >{{ formatSignedCents(saleProfitCents(money, item.cost_cents, quantity)) }}</span
        >
        <span class="text-ink-2"> (cost {{ formatCents(item.cost_cents * quantity) }})</span>
      </p>
      <p v-if="errors.form" class="text-sm text-danger" role="alert">{{ errors.form }}</p>
    </form>
    <template #footer>
      <BaseButton type="submit" form="mark-sold-form" block :loading="saving"
        >Record sale</BaseButton
      >
    </template>
  </BaseSheet>
</template>
