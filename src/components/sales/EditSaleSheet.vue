<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Trash2 } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSheet from '@/components/ui/BaseSheet.vue'
import BaseTextarea from '@/components/ui/BaseTextarea.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import PlatformChips from './PlatformChips.vue'
import { deleteSale, updateSale, type SaleRow } from '@/composables/useSales'
import { isoFromLocal, localDateTimeValue } from '@/lib/datetime'
import { formatCents, formatSignedCents, parseMoneyToCents } from '@/lib/money'
import { keptCents, saleProfitCents } from '@/lib/sales'
import type { SalesPlatform } from '@/types/inventory'

/** Fix a sale's numbers, or delete it (its copies go back into stock). */
const props = defineProps<{ sale: SaleRow | null }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ changed: [message: string] }>()

const platform = ref<SalesPlatform | null>(null)
const quantity = ref('1')
const price = ref('')
const shippingCharged = ref('')
const shippingPaid = ref('')
const fee = ref('')
const other = ref('')
const soldAt = ref('')
const notes = ref('')
const error = ref('')
const saving = ref(false)
const confirmDelete = ref(false)

const toText = (c: number) => (c ? (c / 100).toFixed(2) : '')
const cents = (t: string) => (t.trim() === '' ? 0 : parseMoneyToCents(t))

watch(open, (isOpen) => {
  const s = props.sale
  if (!isOpen || !s) return
  platform.value = s.platform
  quantity.value = String(s.quantity)
  price.value = (s.sale_price_cents / 100).toFixed(2)
  shippingCharged.value = toText(s.shipping_charged_cents)
  shippingPaid.value = toText(s.shipping_cost_cents)
  fee.value = toText(s.platform_fee_cents)
  other.value = toText(s.other_cost_cents)
  soldAt.value = localDateTimeValue(new Date(s.sold_at))
  notes.value = s.notes ?? ''
  error.value = ''
})

const money = computed(() => {
  const v = {
    salePriceCents: cents(price.value),
    shippingChargedCents: cents(shippingCharged.value),
    shippingCostCents: cents(shippingPaid.value),
    platformFeeCents: cents(fee.value),
    otherCostCents: cents(other.value),
  }
  return Object.values(v).some((x) => x === null) ? null : (v as Record<keyof typeof v, number>)
})

async function save() {
  const s = props.sale
  const qty = Number(quantity.value)
  if (!s || !platform.value) return
  if (!money.value || !Number.isInteger(qty) || qty < 1) {
    error.value = 'Check the amounts and quantity.'
    return
  }
  saving.value = true
  try {
    await updateSale(s.id, {
      quantity: qty,
      platform: platform.value,
      ...money.value,
      soldAt: isoFromLocal(soldAt.value),
      notes: notes.value.trim() || null,
    })
    open.value = false
    emit('changed', 'Sale updated.')
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Couldn't save."
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!props.sale) return
  saving.value = true
  try {
    await deleteSale(props.sale.id)
    confirmDelete.value = false
    open.value = false
    emit('changed', 'Sale deleted. The item is back in stock.')
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Couldn't delete."
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseSheet v-model:open="open" title="Edit sale" :description="sale?.item_name">
    <form v-if="sale" id="edit-sale-form" class="space-y-4" novalidate @submit.prevent="save">
      <PlatformChips v-model="platform" />
      <div class="grid grid-cols-2 gap-3">
        <BaseInput v-model="price" label="Sale price" prefix="$" inputmode="decimal" />
        <BaseInput v-model="quantity" label="Quantity" type="number" inputmode="numeric" min="1" />
        <BaseInput
          v-model="shippingCharged"
          label="Shipping we charged"
          prefix="$"
          inputmode="decimal"
        />
        <BaseInput v-model="shippingPaid" label="Shipping we paid" prefix="$" inputmode="decimal" />
        <BaseInput v-model="fee" label="Platform fee" prefix="$" inputmode="decimal" />
        <BaseInput v-model="other" label="Other costs" prefix="$" inputmode="decimal" />
      </div>
      <BaseInput v-model="soldAt" label="When" type="datetime-local" />
      <BaseTextarea v-model="notes" label="Notes" :rows="2" />
      <p v-if="money" class="rounded-lg bg-surface-2 px-3 py-2 text-sm">
        Kept {{ formatCents(keptCents(money)) }}, profit
        <span class="font-semibold">{{
          formatSignedCents(saleProfitCents(money, sale.unit_cost_cents, Number(quantity) || 1))
        }}</span>
      </p>
      <p v-if="sale.bundle_id" class="text-sm text-ink-2">
        This is one part of a bundle. Editing changes only this item's share.
      </p>
      <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
    </form>
    <template #footer>
      <div class="flex gap-2">
        <BaseButton variant="ghost" class="text-danger" @click="confirmDelete = true">
          <Trash2 class="size-4" aria-hidden="true" /> Delete
        </BaseButton>
        <BaseButton type="submit" form="edit-sale-form" class="flex-1" :loading="saving"
          >Save</BaseButton
        >
      </div>
    </template>
  </BaseSheet>
  <ConfirmDialog
    v-model:open="confirmDelete"
    title="Delete this sale?"
    message="The copies go back into stock and the item's status is restored."
    confirm-label="Delete sale"
    danger
    :loading="saving"
    @confirm="remove"
  />
</template>
