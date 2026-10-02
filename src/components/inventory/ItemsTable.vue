<script setup lang="ts">
import { computed } from 'vue'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-vue-next'
import ItemTableRow from './ItemTableRow.vue'
import { itemColumns } from './itemColumns'
import type { SortDir, SortKey } from '@/lib/inventoryQuery'
import type { InventoryItem } from '@/types/inventory'

/** Desktop item table with a sticky header, sortable columns and row checkboxes. */
const props = withDefaults(
  defineProps<{
    rows: InventoryItem[]
    sort: SortKey
    dir: SortDir
    selected?: ReadonlySet<string>
    selectable?: boolean
    caption?: string
  }>(),
  { selected: () => new Set<string>(), selectable: true, caption: 'Inventory items' },
)
const emit = defineEmits<{
  sort: [key: SortKey]
  toggle: [id: string]
  toggleAll: [select: boolean]
  menu: [item: InventoryItem]
}>()

const allSelected = computed(
  () => props.rows.length > 0 && props.rows.every((r) => props.selected.has(r.id)),
)
const someSelected = computed(
  () => !allSelected.value && props.rows.some((r) => props.selected.has(r.id)),
)

function ariaSort(key: SortKey | undefined) {
  if (!key || key !== props.sort) return undefined
  return props.dir === 'asc' ? 'ascending' : 'descending'
}
</script>

<template>
  <div class="overflow-x-auto rounded-2xl border border-line bg-surface">
    <table class="w-full min-w-[1100px] text-sm">
      <caption class="sr-only">
        {{
          caption
        }}
      </caption>
      <thead
        class="sticky top-0 z-10 bg-surface text-left text-xs font-semibold text-ink-2 shadow-[0_1px_0_var(--kura-line)]"
      >
        <tr>
          <th class="w-10 px-3 py-2">
            <input
              v-if="selectable"
              type="checkbox"
              class="size-4"
              :checked="allSelected"
              :indeterminate="someSelected"
              aria-label="Select all loaded items"
              @change="emit('toggleAll', !allSelected)"
            />
          </th>
          <th
            v-for="col in itemColumns"
            :key="col.label"
            scope="col"
            class="px-3 py-2 whitespace-nowrap first:px-0"
            :class="{ 'text-right': col.align === 'right' }"
            :aria-sort="ariaSort(col.sort)"
          >
            <button
              v-if="col.sort"
              type="button"
              class="inline-flex min-h-9 items-center gap-1 rounded hover:text-ink"
              :class="{ 'text-ink': col.sort === sort }"
              @click="emit('sort', col.sort)"
            >
              {{ col.label }}
              <ArrowUp
                v-if="col.sort === sort && dir === 'asc'"
                class="size-3.5"
                aria-hidden="true"
              />
              <ArrowDown v-else-if="col.sort === sort" class="size-3.5" aria-hidden="true" />
              <ArrowUpDown v-else class="size-3.5 opacity-40" aria-hidden="true" />
            </button>
            <span v-else>{{ col.label }}</span>
          </th>
          <th class="w-12"><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <ItemTableRow
          v-for="row in rows"
          :key="row.id"
          :item="row"
          :selectable="selectable"
          :selected="selected.has(row.id)"
          @toggle="emit('toggle', $event)"
          @menu="emit('menu', $event)"
        />
      </tbody>
    </table>
  </div>
</template>
