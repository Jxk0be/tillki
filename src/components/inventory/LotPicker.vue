<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { Check, Plus, X } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { parseMoneyToCents } from '@/lib/money'
import type { LotOption } from '@/types/inventory'

/** Searchable lot picker with "New lot" inline. */
const props = defineProps<{
  lots: LotOption[]
  createLot: (name: string, totalCents: number) => Promise<LotOption | null>
}>()
const model = defineModel<string | null>({ default: null })

const id = useId()
const query = ref('')
const creating = ref(false)
const newName = ref('')
const newTotal = ref('')
const totalError = ref('')
const saving = ref(false)

const selected = computed(() => props.lots.find((l) => l.id === model.value) ?? null)
const matches = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = q ? props.lots.filter((l) => l.name.toLowerCase().includes(q)) : props.lots
  return list.slice(0, 6)
})

function startCreate() {
  creating.value = true
  newName.value = query.value.trim()
  newTotal.value = ''
  totalError.value = ''
}

async function create() {
  const cents = parseMoneyToCents(newTotal.value)
  if (!newName.value.trim()) return
  if (cents === null) {
    totalError.value = 'Enter what the whole lot cost, like 60.'
    return
  }
  saving.value = true
  const lot = await props.createLot(newName.value.trim(), cents)
  saving.value = false
  if (lot) {
    model.value = lot.id
    creating.value = false
    query.value = ''
  }
}
</script>

<template>
  <div>
    <p :id="id" class="mb-1.5 text-sm font-semibold text-ink-2">Lot (optional)</p>

    <div
      v-if="selected"
      class="flex min-h-11 items-center justify-between gap-2 rounded-lg border-2 border-primary bg-surface px-3"
    >
      <span class="truncate font-medium">{{ selected.name }}</span>
      <button
        type="button"
        class="grid size-9 place-items-center rounded-full hover:bg-surface-2"
        :aria-label="`Remove lot ${selected.name}`"
        @click="model = null"
      >
        <X class="size-4" aria-hidden="true" />
      </button>
    </div>

    <div v-else-if="creating" class="space-y-3 rounded-xl border border-line p-3">
      <BaseInput v-model="newName" label="Lot name" placeholder="e.g. Half Price Books haul" />
      <BaseInput
        v-model="newTotal"
        label="Total paid for the lot"
        prefix="$"
        inputmode="decimal"
        :error="totalError"
      />
      <div class="flex gap-2">
        <BaseButton size="sm" :loading="saving" :disabled="!newName.trim()" @click="create">
          <Check class="size-4" aria-hidden="true" /> Create lot
        </BaseButton>
        <BaseButton size="sm" variant="ghost" @click="creating = false">Cancel</BaseButton>
      </div>
    </div>

    <div v-else>
      <input
        v-model="query"
        type="search"
        class="min-h-11 w-full rounded-lg border-2 border-line bg-surface px-3 text-base outline-none focus:border-primary"
        placeholder="Search lots"
        :aria-labelledby="id"
        autocomplete="off"
      />
      <ul class="mt-1 space-y-1">
        <li v-for="lot in matches" :key="lot.id">
          <button
            type="button"
            class="min-h-10 w-full rounded-lg px-3 text-left hover:bg-surface-2"
            @click="model = lot.id"
          >
            {{ lot.name }}
          </button>
        </li>
        <li>
          <button
            type="button"
            class="inline-flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left font-semibold text-primary hover:bg-surface-2"
            @click="startCreate"
          >
            <Plus class="size-4" aria-hidden="true" />
            New lot{{ query.trim() ? `: "${query.trim()}"` : '' }}
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
