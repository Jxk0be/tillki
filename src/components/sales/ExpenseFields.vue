<script setup lang="ts">
import { ref } from 'vue'
import { Camera, FileText, X } from 'lucide-vue-next'
import BaseInput from '@/components/ui/BaseInput.vue'
import ChipSelect from '@/components/ui/ChipSelect.vue'
import {
  expenseCategories,
  expenseCategoryLabels,
  type ExpenseCategory,
} from '@/composables/useExpenses'

export interface ExpenseDraft {
  amount: string
  category: ExpenseCategory | null
  date: string
  vendor: string
  note: string
  receipt: File | null
}

/** The expense fields, shared by quick-add and edit. */
defineProps<{ errors: Partial<Record<'amount' | 'category', string>>; existingReceipt?: boolean }>()
const draft = defineModel<ExpenseDraft>({ required: true })
const emit = defineEmits<{ removeReceipt: [] }>()

const fileInput = ref<HTMLInputElement | null>(null)
const options = expenseCategories.map((c) => ({ value: c, label: expenseCategoryLabels[c] }))

function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  draft.value = { ...draft.value, receipt: input.files?.[0] ?? null }
  input.value = ''
}
</script>

<template>
  <div class="space-y-4">
    <div class="grid grid-cols-2 gap-3">
      <BaseInput
        :model-value="draft.amount"
        label="Amount"
        prefix="$"
        inputmode="decimal"
        autocomplete="off"
        :error="errors.amount"
        @update:model-value="draft = { ...draft, amount: $event }"
      />
      <BaseInput
        :model-value="draft.date"
        label="Date"
        type="date"
        @update:model-value="draft = { ...draft, date: $event }"
      />
    </div>
    <ChipSelect
      :model-value="draft.category"
      label="Category"
      :options="options"
      :error="errors.category"
      required
      @update:model-value="draft = { ...draft, category: $event }"
    />
    <div class="grid gap-3 sm:grid-cols-2">
      <BaseInput
        :model-value="draft.vendor"
        label="Vendor"
        placeholder="e.g. Uline"
        autocomplete="off"
        @update:model-value="draft = { ...draft, vendor: $event }"
      />
      <BaseInput
        :model-value="draft.note"
        label="Note"
        autocomplete="off"
        @update:model-value="draft = { ...draft, note: $event }"
      />
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="inline-flex min-h-11 items-center gap-2 rounded-lg border-2 border-line bg-surface px-3 text-sm font-semibold"
        @click="fileInput?.click()"
      >
        <Camera class="size-4" aria-hidden="true" />
        {{ draft.receipt || existingReceipt ? 'Replace receipt' : 'Add receipt photo' }}
      </button>
      <span v-if="draft.receipt" class="inline-flex items-center gap-1 text-sm text-ink-2">
        <FileText class="size-4" aria-hidden="true" /> {{ draft.receipt.name }}
        <button
          type="button"
          class="grid size-8 place-items-center rounded-full hover:bg-surface-2"
          aria-label="Remove the chosen receipt"
          @click="draft = { ...draft, receipt: null }"
        >
          <X class="size-4" aria-hidden="true" />
        </button>
      </span>
      <button
        v-else-if="existingReceipt"
        type="button"
        class="min-h-11 px-2 text-sm font-semibold text-danger"
        @click="emit('removeReceipt')"
      >
        Remove receipt
      </button>
      <input
        ref="fileInput"
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        class="sr-only"
        tabindex="-1"
        aria-hidden="true"
        @change="onFile"
      />
    </div>
  </div>
</template>
