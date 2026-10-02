<script setup lang="ts">
import { BookPlus, ChevronRight, ExternalLink, LoaderCircle } from 'lucide-vue-next'
import ItemThumb from '@/components/inventory/ItemThumb.vue'
import ItemTableRow from '@/components/inventory/ItemTableRow.vue'
import { itemColumns } from '@/components/inventory/itemColumns'
import SetProgress from './SetProgress.vue'
import VolumeStrip from './VolumeStrip.vue'
import { categoryLabels } from '@/lib/labels'
import { formatDate } from '@/lib/dates'
import { formatCents, formatSignedCents } from '@/lib/money'
import type { MatchCount } from '@/stores/inventory'
import type { VolumeStatusRow } from '@/lib/volumes'
import type { InventoryItem, InventorySet } from '@/types/inventory'

/**
 * Desktop Sets view: one table where each set is a group row with totals in
 * the same columns as the items, and its volumes are indented beneath it.
 */
defineProps<{
  sets: InventorySet[]
  expanded: ReadonlySet<string>
  volumes: ReadonlyMap<string, InventoryItem[]>
  loadingVolumes: ReadonlySet<string>
  strips: ReadonlyMap<string, VolumeStatusRow[]>
  matchCounts: ReadonlyMap<string, MatchCount>
  filtering: boolean
  highlightMatches: boolean
}>()
defineEmits<{ toggle: [id: string]; menu: [item: InventoryItem] }>()

const columnCount = itemColumns.length + 2
</script>

<template>
  <div class="overflow-x-auto rounded-2xl border border-line bg-surface">
    <table class="w-full min-w-[1100px] text-sm">
      <caption class="sr-only">
        Sets and their volumes
      </caption>
      <thead
        class="sticky top-0 z-10 bg-surface text-left text-xs font-semibold text-ink-2 shadow-[0_1px_0_var(--kura-line)]"
      >
        <tr>
          <th class="w-10 px-3 py-2"><span class="sr-only">Expand</span></th>
          <th
            v-for="col in itemColumns"
            :key="col.label"
            scope="col"
            class="px-3 py-2 whitespace-nowrap"
            :class="{ 'text-right': col.align === 'right' }"
          >
            {{ col.label === 'Avg cost' ? 'Cost' : col.label }}
          </th>
          <th class="w-12"><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody v-for="set in sets" :key="set.id" class="border-b-2 border-line last:border-b-0">
        <tr class="bg-surface-2/40">
          <td class="px-3">
            <button
              type="button"
              class="grid size-9 place-items-center rounded-full hover:bg-surface-2"
              :aria-expanded="expanded.has(set.id)"
              :aria-label="`${expanded.has(set.id) ? 'Collapse' : 'Expand'} ${set.name}`"
              @click="$emit('toggle', set.id)"
            >
              <ChevronRight
                class="size-4 transition-transform"
                :class="{ 'rotate-90': expanded.has(set.id) }"
                aria-hidden="true"
              />
            </button>
          </td>
          <td class="py-2"><ItemThumb :path="set.cover_path" size="sm" :alt="set.name" /></td>
          <td class="px-3 text-xs text-muted">Set</td>
          <td class="px-3 py-2">
            <button
              type="button"
              class="text-left font-bold hover:underline"
              @click="$emit('toggle', set.id)"
            >
              {{ set.name }}
            </button>
            <SetProgress :set="set" class="mt-0.5" />
            <p v-if="set.missing_ranges" class="mt-0.5 text-xs text-ink-2">
              Missing <span class="font-semibold text-ink">{{ set.missing_ranges }}</span>
            </p>
            <p
              v-if="filtering && matchCounts.get(set.id)"
              class="mt-1 inline-block rounded-full bg-primary/10 px-2 text-xs font-semibold text-primary"
            >
              {{ matchCounts.get(set.id)?.matching }} of {{ matchCounts.get(set.id)?.total }} match
            </p>
          </td>
          <td class="px-3 whitespace-nowrap text-ink-2">{{ set.owned_ranges || '—' }}</td>
          <td class="px-3">{{ categoryLabels[set.category] }}</td>
          <td class="px-3 text-muted">—</td>
          <td class="px-3 text-right font-semibold tabular-nums">{{ set.units_in_stock }}</td>
          <td class="px-3 text-muted">—</td>
          <td class="px-3 text-right tabular-nums">{{ formatCents(set.cost_basis_cents) }}</td>
          <td class="px-3 text-right font-semibold tabular-nums">
            {{ formatCents(set.list_value_cents) }}
          </td>
          <td
            class="px-3 text-right tabular-nums"
            :class="set.est_profit_cents >= 0 ? 'text-success' : 'text-danger'"
          >
            {{ formatSignedCents(set.est_profit_cents) }}
          </td>
          <td class="px-3 whitespace-nowrap">{{ formatDate(set.last_added_at) || '—' }}</td>
          <td class="px-3 text-muted">—</td>
          <td />
        </tr>

        <template v-if="expanded.has(set.id)">
          <tr>
            <td />
            <td :colspan="columnCount - 1" class="py-3 pr-4 pl-6">
              <VolumeStrip
                v-if="strips.get(set.id)"
                :rows="strips.get(set.id) ?? []"
                :template-id="set.id"
              />
              <div class="mt-3 flex gap-2">
                <RouterLink
                  :to="{ name: 'template-add-volumes', params: { id: set.id } }"
                  class="inline-flex min-h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-ink"
                >
                  <BookPlus class="size-4" aria-hidden="true" /> Add volumes
                </RouterLink>
                <RouterLink
                  :to="{ name: 'template-detail', params: { id: set.id } }"
                  class="inline-flex min-h-9 items-center gap-2 rounded-lg border-2 border-line px-3 text-sm font-semibold"
                >
                  <ExternalLink class="size-4" aria-hidden="true" /> Open set
                </RouterLink>
              </div>
            </td>
          </tr>
          <tr v-if="loadingVolumes.has(set.id) && !volumes.get(set.id)">
            <td :colspan="columnCount" class="py-4 text-center">
              <LoaderCircle
                class="inline size-5 animate-spin text-muted"
                aria-label="Loading volumes"
              />
            </td>
          </tr>
          <tr v-else-if="!volumes.get(set.id)?.length">
            <td />
            <td :colspan="columnCount - 1" class="py-3 pl-6 text-ink-2">
              No volumes match the current filters.
            </td>
          </tr>
          <ItemTableRow
            v-for="v in volumes.get(set.id) ?? []"
            :key="v.id"
            :item="v"
            indent
            :highlight="highlightMatches"
            @menu="$emit('menu', $event)"
          />
        </template>
      </tbody>
    </table>
  </div>
</template>
