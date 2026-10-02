<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSheet from '@/components/ui/BaseSheet.vue'
import BaseTextarea from '@/components/ui/BaseTextarea.vue'
import { createLotRecord, updateLot, type LotRow } from '@/composables/useLots'
import { todayIso } from '@/lib/dates'
import { parseMoneyToCents } from '@/lib/money'

/** Create or edit a lot: a bulk buy whose cost is split across its items. */
const props = defineProps<{ lot: LotRow | null }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [id: string] }>()

const name = ref('')
const total = ref('')
const date = ref(todayIso())
const source = ref('')
const notes = ref('')
const errors = ref<{ name?: string; total?: string; form?: string }>({})
const saving = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  const l = props.lot
  name.value = l?.name ?? ''
  total.value = l ? (l.total_cost_cents / 100).toFixed(2) : ''
  date.value = l?.purchased_at ?? todayIso()
  source.value = l?.source ?? ''
  notes.value = l?.notes ?? ''
  errors.value = {}
})

async function save() {
  const cents = parseMoneyToCents(total.value)
  errors.value = {}
  if (!name.value.trim()) errors.value.name = 'Give the lot a name.'
  if (cents === null) errors.value.total = 'Enter what the whole lot cost, like 60.'
  if (errors.value.name || errors.value.total || cents === null) return
  const fields = {
    name: name.value.trim(),
    total_cost_cents: cents,
    purchased_at: date.value || null,
    source: source.value.trim() || null,
    notes: notes.value.trim() || null,
  }
  saving.value = true
  try {
    const id = props.lot
      ? (await updateLot(props.lot.id, fields), props.lot.id)
      : await createLotRecord(fields)
    open.value = false
    emit('saved', id)
  } catch (e) {
    errors.value.form = e instanceof Error ? e.message : "Couldn't save the lot."
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseSheet v-model:open="open" :title="lot ? 'Edit lot' : 'New lot'">
    <form id="lot-form" class="space-y-4" novalidate @submit.prevent="save">
      <BaseInput
        v-model="name"
        label="Name"
        placeholder="e.g. Facebook manga bundle"
        :error="errors.name"
      />
      <div class="grid grid-cols-2 gap-3">
        <BaseInput
          v-model="total"
          label="Total paid"
          prefix="$"
          inputmode="decimal"
          :error="errors.total"
        />
        <BaseInput v-model="date" label="Bought on" type="date" />
      </div>
      <BaseInput v-model="source" label="Where" placeholder="e.g. Half Price Books" />
      <BaseTextarea v-model="notes" label="Notes" :rows="2" />
      <p v-if="lot" class="text-sm text-ink-2">
        Changing the total doesn't change item costs until you split the cost again.
      </p>
      <p v-if="errors.form" class="text-sm text-danger" role="alert">{{ errors.form }}</p>
    </form>
    <template #footer>
      <BaseButton type="submit" form="lot-form" block :loading="saving">{{
        lot ? 'Save lot' : 'Create lot'
      }}</BaseButton>
    </template>
  </BaseSheet>
</template>
