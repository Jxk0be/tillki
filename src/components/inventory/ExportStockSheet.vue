<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { Download, FileSpreadsheet, FileText } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseChip from '@/components/ui/BaseChip.vue'
import BaseSheet from '@/components/ui/BaseSheet.vue'
import { useStockExport } from '@/composables/useStockExport'
import { useToast } from '@/composables/useToast'
import type { InventoryFilters, KindFilter } from '@/lib/inventoryQuery'
import { categoryLabels, itemCategories, itemStatuses, statusLabels } from '@/lib/labels'
import {
  availableStatuses,
  defaultExportOptions,
  type ExportFormat,
  type StockExportOptions,
} from '@/lib/stockExport'
import type { ItemStatus } from '@/types/inventory'

/** Picks a format and what to include, then downloads the stock list. */
const props = defineProps<{
  /** The list's current filters, used as the starting point. */
  filters: InventoryFilters
}>()
const open = defineModel<boolean>('open', { required: true })

const toast = useToast()
const { exporting, count, exportStock } = useStockExport()

const draft = ref<StockExportOptions>({
  ...defaultExportOptions,
  statuses: [...defaultExportOptions.statuses],
})

watch(open, (isOpen) => {
  if (!isOpen) return
  const f = props.filters
  // Keep the format and column choices from last time; take what to include from the list.
  draft.value = {
    ...draft.value,
    statuses: f.status.length ? [...f.status] : [...availableStatuses],
    kind: f.kind,
    category: f.category,
  }
})

const formats: { value: ExportFormat; label: string; hint: string; icon: typeof FileText }[] = [
  { value: 'pdf', label: 'PDF', hint: 'To send or print', icon: FileText },
  { value: 'csv', label: 'CSV', hint: 'For a spreadsheet', icon: FileSpreadsheet },
]

const kinds: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'set', label: 'Sets' },
  { value: 'one_off', label: 'One-offs' },
]

function toggleStatus(status: ItemStatus) {
  const list = draft.value.statuses
  draft.value.statuses = list.includes(status)
    ? list.filter((s) => s !== status)
    : [...list, status]
}

const isAvailableOnly = computed(
  () =>
    draft.value.statuses.length === availableStatuses.length &&
    availableStatuses.every((s) => draft.value.statuses.includes(s)),
)

// ---- live count of matching items
const matching = ref<number | null>(null)
const counting = ref(false)
let countGeneration = 0
watchDebounced(
  () => [open.value, draft.value.statuses, draft.value.kind, draft.value.category] as const,
  async ([isOpen]) => {
    if (!isOpen) return
    const gen = ++countGeneration
    counting.value = true
    const n = await count(draft.value)
    if (gen !== countGeneration) return
    matching.value = n
    counting.value = false
  },
  { debounce: 200, deep: true, immediate: true },
)

const countText = computed(() => {
  if (draft.value.statuses.length === 0) return 'Pick at least one status.'
  if (counting.value && matching.value === null) return 'Counting…'
  if (matching.value === null) return ''
  return matching.value === 1 ? '1 item matches.' : `${matching.value} items match.`
})

const canExport = computed(() => draft.value.statuses.length > 0 && matching.value !== 0)

async function submit() {
  try {
    const lines = await exportStock(draft.value)
    toast.success(
      `Exported ${lines} line${lines === 1 ? '' : 's'} as ${draft.value.format.toUpperCase()}.`,
    )
    open.value = false
  } catch (e) {
    toast.error(`Couldn't export. ${e instanceof Error ? e.message : ''}`.trim())
  }
}
</script>

<template>
  <BaseSheet
    v-model:open="open"
    title="Export stock"
    description="Download a list of what you have to send to a buyer or open in a spreadsheet."
  >
    <div class="space-y-6">
      <fieldset>
        <legend class="mb-2 text-sm font-semibold text-ink-2">Format</legend>
        <div class="grid grid-cols-2 gap-2">
          <label
            v-for="f in formats"
            :key="f.value"
            class="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary"
            :class="draft.format === f.value ? 'border-ink bg-surface-2' : 'border-line'"
          >
            <input v-model="draft.format" type="radio" :value="f.value" class="sr-only" />
            <component :is="f.icon" class="size-6 shrink-0" aria-hidden="true" />
            <span class="min-w-0">
              <span class="block font-semibold">{{ f.label }}</span>
              <span class="block text-xs text-muted">{{ f.hint }}</span>
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend class="mb-2 text-sm font-semibold text-ink-2">Status</legend>
        <div class="flex flex-wrap gap-2">
          <BaseChip :selected="isAvailableOnly" @toggle="draft.statuses = [...availableStatuses]"
            >Available now</BaseChip
          >
          <BaseChip
            v-for="s in itemStatuses"
            :key="s"
            :selected="draft.statuses.includes(s)"
            @toggle="toggleStatus(s)"
            >{{ statusLabels[s] }}</BaseChip
          >
        </div>
        <p class="mt-2 text-xs text-muted">Available now = in stock, listed and reserved.</p>
      </fieldset>

      <fieldset>
        <legend class="mb-2 text-sm font-semibold text-ink-2">Include</legend>
        <div class="flex flex-wrap gap-2">
          <BaseChip
            v-for="k in kinds"
            :key="k.value"
            :selected="draft.kind === k.value"
            @toggle="draft.kind = k.value"
            >{{ k.label }}</BaseChip
          >
        </div>
      </fieldset>

      <fieldset>
        <legend class="mb-2 text-sm font-semibold text-ink-2">Category</legend>
        <div class="flex flex-wrap gap-2">
          <BaseChip :selected="draft.category === null" @toggle="draft.category = null"
            >All</BaseChip
          >
          <BaseChip
            v-for="c in itemCategories"
            :key="c"
            :selected="draft.category === c"
            @toggle="draft.category = c"
            >{{ categoryLabels[c] }}</BaseChip
          >
        </div>
      </fieldset>

      <div class="space-y-1">
        <label class="flex min-h-11 items-center gap-3">
          <input v-model="draft.groupSets" type="checkbox" class="size-5" />
          <span>One line per set (volumes as ranges like 1-5, 8)</span>
        </label>
        <label class="flex min-h-11 items-center gap-3">
          <input v-model="draft.includePrices" type="checkbox" class="size-5" />
          <span>Include asking prices</span>
        </label>
        <label class="flex min-h-11 items-center gap-3">
          <input v-model="draft.includeCosts" type="checkbox" class="size-5" />
          <span>Include our costs and profit <span class="text-muted">(internal only)</span></span>
        </label>
      </div>
    </div>

    <template #footer>
      <p class="mb-2 text-sm text-ink-2" role="status">{{ countText }}</p>
      <BaseButton block :loading="exporting" :disabled="!canExport" @click="submit">
        <Download v-if="!exporting" class="size-5" aria-hidden="true" />
        Download {{ draft.format.toUpperCase() }}
      </BaseButton>
    </template>
  </BaseSheet>
</template>
