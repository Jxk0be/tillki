<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSheet from '@/components/ui/BaseSheet.vue'
import BaseTextarea from '@/components/ui/BaseTextarea.vue'
import LotItemsPicker from '@/components/sales/LotItemsPicker.vue'
import {
  createLotRecord,
  listLotCandidates,
  setLotItems,
  splitLotCost,
  updateLot,
  type LotRow,
} from '@/composables/useLots'
import { todayIso } from '@/lib/dates'
import { copiesOf, itemsInLot, lotMembershipChanges, type LotCandidate } from '@/lib/lotItems'
import { formatCents, parseMoneyToCents } from '@/lib/money'

/**
 * Create or edit a lot: a bulk buy whose cost is split across its items.
 * The items that came in it are ticked in an inventory table below the fields.
 */
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

const candidates = ref<LotCandidate[]>([])
const candidatesLoading = ref(false)
/** Items in the lot when the sheet opened, to work out what changed. */
const initialItems = ref(new Set<string>())
const selectedItems = ref(new Set<string>())
const splitEvenly = ref(true)

const selectedCopies = computed(() =>
  candidates.value
    .filter((c) => selectedItems.value.has(c.id))
    .reduce((s, c) => s + copiesOf(c), 0),
)
const totalCents = computed(() => parseMoneyToCents(total.value))

async function loadCandidates(lotId: string | null) {
  candidatesLoading.value = true
  try {
    candidates.value = await listLotCandidates()
    initialItems.value = itemsInLot(candidates.value, lotId)
    selectedItems.value = new Set(initialItems.value)
  } catch (e) {
    errors.value.form = e instanceof Error ? e.message : "Couldn't load your inventory."
  } finally {
    candidatesLoading.value = false
  }
}

watch(open, (isOpen) => {
  if (!isOpen) return
  const l = props.lot
  name.value = l?.name ?? ''
  total.value = l ? (l.total_cost_cents / 100).toFixed(2) : ''
  date.value = l?.purchased_at ?? todayIso()
  source.value = l?.source ?? ''
  notes.value = l?.notes ?? ''
  errors.value = {}
  // New lots usually want their total spread over the copies straight away.
  // For an existing lot that would overwrite costs that may have been split by price.
  splitEvenly.value = !l
  candidates.value = []
  initialItems.value = new Set()
  selectedItems.value = new Set()
  void loadCandidates(l?.id ?? null)
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
    const { add, remove } = lotMembershipChanges(initialItems.value, selectedItems.value)
    await setLotItems(id, add, remove)
    if (splitEvenly.value && selectedCopies.value > 0) await splitLotCost(id, 'even', false)
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
  <BaseSheet v-model:open="open" :title="lot ? 'Edit lot' : 'New lot'" wide>
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

      <LotItemsPicker
        v-model="selectedItems"
        :candidates="candidates"
        :lot-id="lot?.id ?? null"
        :loading="candidatesLoading"
      />
    </form>
    <template #footer>
      <label
        v-if="selectedCopies > 0"
        class="mb-3 flex min-h-11 cursor-pointer items-center gap-3 text-sm"
      >
        <input v-model="splitEvenly" type="checkbox" class="size-5 shrink-0" />
        <span>
          Split
          {{ totalCents !== null ? formatCents(totalCents) : 'the total' }}
          evenly over {{ selectedCopies }} {{ selectedCopies === 1 ? 'copy' : 'copies' }}
          <span v-if="lot && !splitEvenly" class="block text-ink-2"
            >Item costs stay as they are. You can split later from the lot page.</span
          >
        </span>
      </label>
      <p v-if="errors.form" class="mb-3 text-sm text-danger" role="alert">{{ errors.form }}</p>
      <BaseButton type="submit" form="lot-form" block :loading="saving">{{
        lot ? 'Save lot' : 'Create lot'
      }}</BaseButton>
    </template>
  </BaseSheet>
</template>
