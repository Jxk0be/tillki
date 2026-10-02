<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseSheet from '@/components/ui/BaseSheet.vue'
import { formatCents, parseMoneyToCents } from '@/lib/money'
import { todayIso } from '@/lib/dates'
import type { AddCopiesInput } from '@/composables/useItemDetail'

/** More copies of the same item came in: how many, what each cost, from where. */
const props = defineProps<{
  itemName: string
  lots: { id: string; name: string }[]
  saving: boolean
  defaultCostCents: number
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ submit: [input: AddCopiesInput] }>()

const quantity = ref('1')
const cost = ref('')
const lotId = ref('')
const source = ref('')
const purchasedAt = ref(todayIso())
const errors = ref<{ quantity?: string; cost?: string }>({})

watch(open, (isOpen) => {
  if (!isOpen) return
  quantity.value = '1'
  cost.value = props.defaultCostCents ? (props.defaultCostCents / 100).toFixed(2) : ''
  lotId.value = ''
  source.value = ''
  purchasedAt.value = todayIso()
  errors.value = {}
})

function submit() {
  const qty = Number(quantity.value)
  const cents = parseMoneyToCents(cost.value)
  errors.value = {}
  if (!Number.isInteger(qty) || qty < 1) errors.value.quantity = 'Enter a whole number, 1 or more.'
  if (cents === null) errors.value.cost = 'Enter what each copy cost, like 4 or 4.50.'
  if (errors.value.quantity || errors.value.cost || cents === null) return
  emit('submit', {
    quantity: qty,
    unitCostCents: cents,
    lotId: lotId.value || null,
    source: source.value.trim() || null,
    purchasedAt: purchasedAt.value || todayIso(),
  })
}
</script>

<template>
  <BaseSheet v-model:open="open" title="Add copies" :description="itemName">
    <form id="add-copies-form" class="space-y-4" novalidate @submit.prevent="submit">
      <div class="grid grid-cols-2 gap-3">
        <BaseInput
          v-model="quantity"
          label="How many"
          type="number"
          inputmode="numeric"
          min="1"
          step="1"
          :error="errors.quantity"
        />
        <BaseInput
          v-model="cost"
          label="Cost each"
          prefix="$"
          inputmode="decimal"
          autocomplete="off"
          :error="errors.cost"
        />
      </div>
      <BaseSelect
        v-model="lotId"
        label="Lot (optional)"
        :options="[
          { value: '', label: 'Not part of a lot' },
          ...lots.map((l) => ({ value: l.id, label: l.name })),
        ]"
      />
      <BaseInput
        v-model="source"
        label="Where we bought them"
        placeholder="e.g. Half Price Books"
      />
      <BaseInput v-model="purchasedAt" label="Purchase date" type="date" />
      <p v-if="parseMoneyToCents(cost) !== null && Number(quantity) > 0" class="text-sm text-ink-2">
        {{ quantity }} × {{ formatCents(parseMoneyToCents(cost) ?? 0) }} =
        <span class="font-semibold text-ink">{{
          formatCents((parseMoneyToCents(cost) ?? 0) * Number(quantity))
        }}</span>
      </p>
    </form>
    <template #footer>
      <BaseButton type="submit" form="add-copies-form" block :loading="saving"
        >Add copies</BaseButton
      >
    </template>
  </BaseSheet>
</template>
