<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { FileText, Pencil, Trash2, Wallet } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSheet from '@/components/ui/BaseSheet.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ExpenseFields, { type ExpenseDraft } from '@/components/sales/ExpenseFields.vue'
import {
  RECEIPT_BUCKET,
  createExpense,
  deleteExpense,
  expenseCategoryLabels,
  listExpenses,
  updateExpense,
  type ExpenseInput,
  type ExpenseRow,
} from '@/composables/useExpenses'
import { useSignedUrls } from '@/composables/useSignedUrls'
import { useToast } from '@/composables/useToast'
import { formatDate, todayIso } from '@/lib/dates'
import { formatCents, parseMoneyToCents } from '@/lib/money'

const toast = useToast()
const receipts = useSignedUrls(RECEIPT_BUCKET)

const expenses = ref<ExpenseRow[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

async function load() {
  try {
    expenses.value = await listExpenses()
    error.value = null
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong.'
  } finally {
    loading.value = false
  }
}
onMounted(load)

const blank = (): ExpenseDraft => ({
  amount: '',
  category: null,
  date: todayIso(),
  vendor: '',
  note: '',
  receipt: null,
})

function toInput(
  d: ExpenseDraft,
  errors: { amount?: string; category?: string },
): ExpenseInput | null {
  const cents = parseMoneyToCents(d.amount)
  if (cents === null || cents <= 0) errors.amount = 'Enter the amount, like 24.99.'
  if (!d.category) errors.category = 'Pick a category.'
  if (cents === null || cents <= 0 || !d.category) return null
  return {
    amount_cents: cents,
    category: d.category,
    incurred_at: d.date || todayIso(),
    vendor: d.vendor.trim() || null,
    note: d.note.trim() || null,
  }
}

// ---------------------------------------------------------------- quick add
const draft = ref<ExpenseDraft>(blank())
const addErrors = ref<{ amount?: string; category?: string }>({})
const adding = ref(false)

async function add() {
  addErrors.value = {}
  const input = toInput(draft.value, addErrors.value)
  if (!input) return
  adding.value = true
  try {
    const result = await createExpense(input, draft.value.receipt)
    toast.success(
      result.receiptFailed
        ? `Saved ${formatCents(input.amount_cents)}, but the receipt didn't upload. Add it again by editing.`
        : `Saved ${formatCents(input.amount_cents)} for ${expenseCategoryLabels[input.category].toLowerCase()}.`,
    )
    draft.value = { ...blank(), category: input.category, date: input.incurred_at }
    await load()
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Couldn't save the expense.")
  } finally {
    adding.value = false
  }
}

// ---------------------------------------------------------------- list
const months = computed(() => {
  const groups = new Map<string, ExpenseRow[]>()
  for (const e of expenses.value) {
    const key = e.incurred_at.slice(0, 7)
    groups.set(key, [...(groups.get(key) ?? []), e])
  }
  return [...groups.entries()].map(([key, rows]) => ({
    key,
    label: new Date(`${key}-01T12:00:00`).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    }),
    rows,
    total: rows.reduce((s, r) => s + r.amount_cents, 0),
  }))
})

async function openReceipt(path: string) {
  await receipts.request([path])
  const url = receipts.urlFor(path)
  if (url) window.open(url, '_blank', 'noopener')
  else toast.error("Couldn't open the receipt.")
}

// ---------------------------------------------------------------- edit / delete
const editing = ref<ExpenseRow | null>(null)
const editOpen = ref(false)
const editDraft = ref<ExpenseDraft>(blank())
const editErrors = ref<{ amount?: string; category?: string }>({})
const removeReceipt = ref(false)
const savingEdit = ref(false)

function startEdit(row: ExpenseRow) {
  editing.value = row
  editDraft.value = {
    amount: (row.amount_cents / 100).toFixed(2),
    category: row.category,
    date: row.incurred_at,
    vendor: row.vendor ?? '',
    note: row.note ?? '',
    receipt: null,
  }
  editErrors.value = {}
  removeReceipt.value = false
  editOpen.value = true
}

async function saveEdit() {
  const row = editing.value
  if (!row) return
  editErrors.value = {}
  const input = toInput(editDraft.value, editErrors.value)
  if (!input) return
  savingEdit.value = true
  try {
    const result = await updateExpense(
      row.id,
      input,
      editDraft.value.receipt,
      row.receipt_path,
      removeReceipt.value,
    )
    editOpen.value = false
    toast.success(
      result.receiptFailed ? "Saved, but the receipt didn't upload." : 'Expense updated.',
    )
    await load()
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Couldn't save.")
  } finally {
    savingEdit.value = false
  }
}

const toDelete = ref<ExpenseRow | null>(null)
const deleting = ref(false)
async function confirmDelete() {
  if (!toDelete.value) return
  deleting.value = true
  try {
    await deleteExpense(toDelete.value)
    toast.success('Expense deleted.')
    toDelete.value = null
    editOpen.value = false
    await load()
  } catch {
    toast.error("Couldn't delete the expense.")
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6">
    <form class="rounded-2xl border border-line bg-surface p-4" novalidate @submit.prevent="add">
      <h2 class="mb-3 text-lg font-bold">Add an expense</h2>
      <ExpenseFields v-model="draft" :errors="addErrors" />
      <div class="mt-4 flex justify-end">
        <BaseButton type="submit" :loading="adding">Save expense</BaseButton>
      </div>
    </form>

    <p
      v-if="error"
      class="rounded-xl border border-danger/40 bg-danger/10 p-3 text-danger"
      role="alert"
    >
      {{ error }}
    </p>
    <div v-else-if="loading" class="space-y-2" aria-busy="true">
      <div v-for="n in 4" :key="n" class="h-14 animate-pulse rounded-xl bg-surface-2" />
    </div>
    <EmptyState
      v-else-if="expenses.length === 0"
      :icon="Wallet"
      title="No expenses yet"
      message="Mailers, tape, table fees, mileage: everything that isn't stock goes here, so profit and taxes are right."
    />

    <section v-for="m in months" :key="m.key" :aria-labelledby="`e-${m.key}`">
      <div class="mb-1 flex items-baseline justify-between border-b border-line pb-1">
        <h2 :id="`e-${m.key}`" class="text-lg font-bold">{{ m.label }}</h2>
        <p class="font-semibold tabular-nums">{{ formatCents(m.total) }}</p>
      </div>
      <ul class="divide-y divide-line">
        <li v-for="e in m.rows" :key="e.id" class="flex items-center gap-3 py-2">
          <div class="min-w-0 flex-1">
            <p class="font-medium">
              {{ expenseCategoryLabels[e.category]
              }}<template v-if="e.vendor"> · {{ e.vendor }}</template>
            </p>
            <p class="truncate text-sm text-ink-2">
              {{ formatDate(e.incurred_at) }}<template v-if="e.note"> · {{ e.note }}</template>
            </p>
          </div>
          <button
            v-if="e.receipt_path"
            type="button"
            class="grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-2"
            aria-label="Open receipt"
            @click="openReceipt(e.receipt_path)"
          >
            <FileText class="size-5" aria-hidden="true" />
          </button>
          <p class="w-24 shrink-0 text-right font-semibold tabular-nums">
            {{ formatCents(e.amount_cents) }}
          </p>
          <button
            type="button"
            class="grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-2"
            :aria-label="`Edit ${expenseCategoryLabels[e.category]} expense from ${formatDate(e.incurred_at)}`"
            @click="startEdit(e)"
          >
            <Pencil class="size-4" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </section>

    <BaseSheet v-model:open="editOpen" title="Edit expense">
      <form id="edit-expense-form" novalidate @submit.prevent="saveEdit">
        <ExpenseFields
          v-model="editDraft"
          :errors="editErrors"
          :existing-receipt="!!editing?.receipt_path && !removeReceipt"
          @remove-receipt="removeReceipt = true"
        />
        <p v-if="removeReceipt" class="mt-2 text-sm text-ink-2">
          The receipt will be removed when you save.
        </p>
      </form>
      <template #footer>
        <div class="flex gap-2">
          <BaseButton variant="ghost" class="text-danger" @click="toDelete = editing">
            <Trash2 class="size-4" aria-hidden="true" /> Delete
          </BaseButton>
          <BaseButton type="submit" form="edit-expense-form" class="flex-1" :loading="savingEdit"
            >Save</BaseButton
          >
        </div>
      </template>
    </BaseSheet>
    <ConfirmDialog
      :open="toDelete !== null"
      title="Delete this expense?"
      message="It's removed for good, along with its receipt."
      confirm-label="Delete"
      danger
      :loading="deleting"
      @update:open="(v) => !v && (toDelete = null)"
      @confirm="confirmDelete"
    />
  </div>
</template>
