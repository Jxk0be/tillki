<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { Search } from 'lucide-vue-next'
import BaseChip from '@/components/ui/BaseChip.vue'
import { conditionLabels } from '@/lib/labels'
import {
  copiesOf,
  filterLotCandidates,
  otherLotNames,
  type LotCandidate,
  type LotCandidateFilter,
} from '@/lib/lotItems'

/** Checkable inventory table for choosing which items came in a lot. */
const props = defineProps<{
  candidates: LotCandidate[]
  /** The lot being edited, or null for a new lot. */
  lotId: string | null
  loading: boolean
}>()
const selected = defineModel<Set<string>>({ required: true })

const headingId = useId()
const query = ref('')
const filter = ref<LotCandidateFilter>('manga')

const rows = computed(() =>
  filterLotCandidates(props.candidates, query.value, filter.value, selected.value),
)
const pickable = computed(() => rows.value.filter((r) => copiesOf(r) > 0))
const allShown = computed(
  () => pickable.value.length > 0 && pickable.value.every((r) => selected.value.has(r.id)),
)
const someShown = computed(
  () => !allShown.value && pickable.value.some((r) => selected.value.has(r.id)),
)

function toggle(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

function toggleShown() {
  const next = new Set(selected.value)
  const select = !allShown.value
  for (const r of pickable.value) {
    if (select) next.add(r.id)
    else next.delete(r.id)
  }
  selected.value = next
}

const filters: { value: LotCandidateFilter; label: string }[] = [
  { value: 'manga', label: 'Manga' },
  { value: 'all', label: 'All items' },
  { value: 'selected', label: 'Selected' },
]
</script>

<template>
  <section class="space-y-3" :aria-labelledby="headingId">
    <div class="flex items-baseline justify-between gap-2">
      <h3 :id="headingId" class="text-sm font-semibold text-ink-2">What came in this lot</h3>
      <span class="text-sm tabular-nums text-ink-2">{{ selected.size }} selected</span>
    </div>

    <div class="relative">
      <Search
        class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-2"
        aria-hidden="true"
      />
      <input
        v-model="query"
        type="search"
        class="min-h-11 w-full rounded-lg border-2 border-line bg-surface pr-3 pl-9 text-base outline-none focus:border-primary"
        placeholder="Search by title, set or SKU"
        aria-label="Search inventory"
        autocomplete="off"
      />
    </div>

    <div class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      <BaseChip
        v-for="f in filters"
        :key="f.value"
        :selected="filter === f.value"
        @toggle="filter = f.value"
        >{{ f.label }}{{ f.value === 'selected' ? ` (${selected.size})` : '' }}</BaseChip
      >
    </div>

    <div v-if="loading" class="space-y-2" aria-busy="true">
      <div v-for="n in 4" :key="n" class="h-11 animate-pulse rounded-lg bg-surface-2" />
    </div>
    <p
      v-else-if="rows.length === 0"
      class="rounded-xl border border-dashed border-line p-4 text-center text-sm text-ink-2"
    >
      {{ filter === 'selected' ? 'Nothing selected yet.' : 'No items match.' }}
    </p>
    <div v-else class="rounded-xl border border-line">
      <table class="w-full text-sm">
        <caption class="sr-only">
          Inventory items. Tick the ones that came in this lot.
        </caption>
        <thead
          class="sticky top-0 z-10 bg-surface text-left text-xs font-semibold text-ink-2 shadow-[0_1px_0_var(--kura-line)]"
        >
          <tr>
            <th scope="col" class="w-11 px-3 py-2">
              <input
                type="checkbox"
                class="size-5 align-middle"
                :checked="allShown"
                :indeterminate="someShown"
                :disabled="pickable.length === 0"
                :aria-label="allShown ? 'Unselect all shown items' : 'Select all shown items'"
                @change="toggleShown"
              />
            </th>
            <th scope="col" class="py-2 pr-2">Item</th>
            <th scope="col" class="hidden py-2 pr-2 sm:table-cell">Condition</th>
            <th scope="col" class="py-2 pr-3 text-right">Copies</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in rows"
            :key="r.id"
            class="border-t border-line"
            :class="{ 'bg-primary/5': selected.has(r.id) }"
          >
            <td class="px-3 align-middle">
              <input
                :id="`lot-item-${r.id}`"
                type="checkbox"
                class="size-5 align-middle"
                :checked="selected.has(r.id)"
                :disabled="copiesOf(r) === 0"
                @change="toggle(r.id)"
              />
            </td>
            <td class="py-1 pr-2">
              <label
                :for="`lot-item-${r.id}`"
                class="flex min-h-11 cursor-pointer flex-col justify-center"
              >
                <span class="font-medium break-words">{{ r.name }}</span>
                <span class="text-xs text-ink-2">
                  {{ r.sku
                  }}<span v-if="r.condition" class="sm:hidden">
                    · {{ conditionLabels[r.condition] }}</span
                  >
                  <template v-if="copiesOf(r) === 0"> · No copies to add</template>
                  <template v-else-if="otherLotNames(r, lotId).length">
                    ·
                    <span :class="{ 'font-semibold text-accent': selected.has(r.id) }"
                      >{{ selected.has(r.id) ? 'Moving from' : 'In' }}
                      {{ otherLotNames(r, lotId).join(', ') }}</span
                    >
                  </template>
                </span>
              </label>
            </td>
            <td class="hidden py-1 pr-2 text-ink-2 sm:table-cell">
              {{ r.condition ? conditionLabels[r.condition] : '—' }}
            </td>
            <td class="py-1 pr-3 text-right tabular-nums">{{ copiesOf(r) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
