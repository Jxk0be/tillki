<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseChip from '@/components/ui/BaseChip.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseSheet from '@/components/ui/BaseSheet.vue'
import {
  defaultFilters,
  groupSortLabels,
  groupSorts,
  sortPresets,
  type InventoryFilters,
  type KindFilter,
} from '@/lib/inventoryQuery'
import {
  categoryLabels,
  conditionLabels,
  itemCategories,
  itemConditions,
  itemStatuses,
  statusLabels,
} from '@/lib/labels'
import type { ItemCategory, ItemCondition, ItemStatus } from '@/types/inventory'

/** Everything beyond search and the status chips. Edits a draft and applies on "Show results". */
const props = defineProps<{
  filters: InventoryFilters
  setOptions: { id: string; name: string }[]
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ apply: [filters: InventoryFilters] }>()

const draft = ref<InventoryFilters>({ ...props.filters })
watch(open, (isOpen) => {
  if (isOpen) draft.value = { ...props.filters, status: [...props.filters.status] }
})

const kinds: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'set', label: 'Sets' },
  { value: 'one_off', label: 'One-offs' },
]

function toggleStatus(status: ItemStatus) {
  const list = draft.value.status
  draft.value.status = list.includes(status) ? list.filter((s) => s !== status) : [...list, status]
}

function sortValue() {
  return `${draft.value.sort}:${draft.value.dir}`
}

function setSort(value: string) {
  const preset = sortPresets.find((p) => `${p.sort}:${p.dir}` === value)
  if (preset) {
    draft.value.sort = preset.sort
    draft.value.dir = preset.dir
  }
}

function reset() {
  draft.value = { ...defaultFilters, view: draft.value.view, q: draft.value.q }
}

function apply() {
  open.value = false
  emit('apply', { ...draft.value, expand: null })
}
</script>

<template>
  <BaseSheet v-model:open="open" title="Filters and sort">
    <div class="space-y-6">
      <fieldset>
        <legend class="mb-2 text-sm font-semibold text-ink-2">Show</legend>
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

      <BaseSelect
        :model-value="draft.set ?? ''"
        label="Set"
        placeholder="Any set"
        :options="[
          { value: '', label: 'Any set' },
          ...setOptions.map((s) => ({ value: s.id, label: s.name })),
        ]"
        @update:model-value="draft.set = $event || null"
      />

      <fieldset>
        <legend class="mb-2 text-sm font-semibold text-ink-2">Status</legend>
        <div class="flex flex-wrap gap-2">
          <BaseChip
            v-for="s in itemStatuses"
            :key="s"
            :selected="draft.status.includes(s)"
            @toggle="toggleStatus(s)"
            >{{ statusLabels[s] }}</BaseChip
          >
        </div>
      </fieldset>

      <div class="grid gap-4 sm:grid-cols-2">
        <BaseSelect
          :model-value="draft.category ?? ''"
          label="Category"
          :options="[
            { value: '', label: 'Any category' },
            ...itemCategories.map((c) => ({ value: c, label: categoryLabels[c] })),
          ]"
          @update:model-value="draft.category = ($event || null) as ItemCategory | null"
        />
        <BaseSelect
          :model-value="draft.condition ?? ''"
          label="Condition"
          :options="[
            { value: '', label: 'Any condition' },
            ...itemConditions.map((c) => ({ value: c, label: conditionLabels[c] })),
          ]"
          @update:model-value="draft.condition = ($event || null) as ItemCondition | null"
        />
      </div>

      <div class="space-y-1">
        <label class="flex min-h-11 items-center gap-3">
          <input v-model="draft.noPhotos" type="checkbox" class="size-5" />
          <span>Only items with no photos</span>
        </label>
        <label class="flex min-h-11 items-center gap-3">
          <input v-model="draft.archived" type="checkbox" class="size-5" />
          <span>Include archived items</span>
        </label>
      </div>

      <BaseSelect
        :model-value="sortValue()"
        label="Sort items by"
        :options="sortPresets.map((p) => ({ value: `${p.sort}:${p.dir}`, label: p.label }))"
        @update:model-value="setSort($event)"
      />

      <BaseSelect
        v-if="draft.view === 'sets'"
        v-model="draft.groupSort"
        label="Sort sets by"
        :options="groupSorts.map((g) => ({ value: g, label: groupSortLabels[g] }))"
      />
    </div>

    <template #footer>
      <div class="flex gap-2">
        <BaseButton variant="secondary" @click="reset">Reset</BaseButton>
        <BaseButton class="flex-1" @click="apply">Show results</BaseButton>
      </div>
    </template>
  </BaseSheet>
</template>
