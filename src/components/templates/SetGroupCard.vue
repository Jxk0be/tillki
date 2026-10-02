<script setup lang="ts">
import { computed, useId } from 'vue'
import { BookPlus, ChevronDown, ExternalLink, LoaderCircle } from 'lucide-vue-next'
import ItemThumb from '@/components/inventory/ItemThumb.vue'
import ItemCardRow from '@/components/inventory/ItemCardRow.vue'
import SetProgress from './SetProgress.vue'
import VolumeStrip from './VolumeStrip.vue'
import { formatCents, formatSignedCents } from '@/lib/money'
import type { MatchCount } from '@/stores/inventory'
import type { VolumeStatusRow } from '@/lib/volumes'
import type { InventoryItem, InventorySet } from '@/types/inventory'

/** A set on mobile: tap the header to expand its volume strip and volumes in place. */
const props = defineProps<{
  set: InventorySet
  expanded: boolean
  volumes: InventoryItem[] | undefined
  loadingVolumes: boolean
  strip: VolumeStatusRow[] | undefined
  match: MatchCount | undefined
  filtering: boolean
  highlightMatches: boolean
}>()
defineEmits<{ toggle: [id: string]; menu: [item: InventoryItem] }>()

const panelId = useId()
const matchText = computed(() =>
  props.filtering && props.match ? `${props.match.matching} of ${props.match.total} match` : null,
)
</script>

<template>
  <section class="overflow-hidden rounded-2xl border border-line bg-surface">
    <h3>
      <button
        type="button"
        class="flex w-full items-start gap-3 p-3 text-left"
        :aria-expanded="expanded"
        :aria-controls="panelId"
        @click="$emit('toggle', set.id)"
      >
        <ItemThumb :path="set.cover_path" :alt="set.name" />
        <span class="min-w-0 flex-1">
          <span class="flex items-start justify-between gap-2">
            <span class="line-clamp-2 text-base font-bold">{{ set.name }}</span>
            <ChevronDown
              class="mt-0.5 size-5 shrink-0 text-muted transition-transform"
              :class="{ 'rotate-180': expanded }"
              aria-hidden="true"
            />
          </span>
          <SetProgress :set="set" class="mt-1" />
          <span v-if="set.missing_ranges" class="mt-1 block text-sm text-ink-2">
            Missing <span class="font-semibold text-ink">{{ set.missing_ranges }}</span>
          </span>
          <span
            v-if="matchText"
            class="mt-1 inline-block rounded-full bg-primary/10 px-2 text-xs font-semibold text-primary"
          >
            {{ matchText }}
          </span>
          <span class="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-ink-2 tabular-nums">
            <span>{{ set.units_in_stock }} in stock</span>
            <span>Cost {{ formatCents(set.cost_basis_cents) }}</span>
            <span>Asking {{ formatCents(set.list_value_cents) }}</span>
            <span :class="set.est_profit_cents >= 0 ? 'text-success' : 'text-danger'">
              Profit {{ formatSignedCents(set.est_profit_cents) }}
            </span>
          </span>
        </span>
      </button>
    </h3>

    <div v-if="expanded" :id="panelId" class="border-t border-line px-3 pt-3 pb-1">
      <VolumeStrip v-if="strip" :rows="strip" :template-id="set.id" />
      <div class="mt-3 flex flex-wrap gap-2">
        <RouterLink
          :to="{ name: 'template-add-volumes', params: { id: set.id } }"
          class="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-ink"
        >
          <BookPlus class="size-4" aria-hidden="true" /> Add volumes
        </RouterLink>
        <RouterLink
          :to="{ name: 'template-detail', params: { id: set.id } }"
          class="inline-flex min-h-11 items-center gap-2 rounded-lg border-2 border-line px-4 text-sm font-semibold"
        >
          <ExternalLink class="size-4" aria-hidden="true" /> Open set
        </RouterLink>
      </div>

      <div v-if="loadingVolumes && !volumes" class="flex justify-center py-4" role="status">
        <LoaderCircle class="size-5 animate-spin text-muted" aria-label="Loading volumes" />
      </div>
      <ul v-else-if="volumes?.length" class="mt-2 divide-y divide-line">
        <li v-for="v in volumes" :key="v.id">
          <ItemCardRow
            :item="v"
            :show-set-chip="false"
            :highlight="highlightMatches"
            @menu="$emit('menu', $event)"
          />
        </li>
      </ul>
      <p v-else class="py-3 text-sm text-ink-2">No volumes match the current filters.</p>
    </div>
  </section>
</template>
