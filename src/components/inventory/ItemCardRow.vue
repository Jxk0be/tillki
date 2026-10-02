<script setup lang="ts">
import { computed } from 'vue'
import { EllipsisVertical, Library, Tag } from 'lucide-vue-next'
import ItemThumb from './ItemThumb.vue'
import StatusChip from './StatusChip.vue'
import { formatCents, formatSignedCents } from '@/lib/money'
import type { InventoryItem } from '@/types/inventory'

/** One item on mobile. The whole row opens the item; the set chip and menu are separate targets. */
const props = withDefaults(
  defineProps<{ item: InventoryItem; showSetChip?: boolean; highlight?: boolean }>(),
  { showSetChip: true, highlight: false },
)
defineEmits<{ menu: [item: InventoryItem] }>()

const profit = computed(() =>
  props.item.est_profit_cents === null ? null : props.item.est_profit_cents,
)
</script>

<template>
  <div
    class="relative flex items-center gap-3 py-3"
    :class="{ 'bg-primary/5 ring-2 ring-primary/30 ring-inset': highlight }"
  >
    <ItemThumb :path="item.cover_path" :source="item.cover_source" :alt="item.name" />

    <div class="min-w-0 flex-1">
      <RouterLink
        :to="{ name: 'item-detail', params: { id: item.id } }"
        class="line-clamp-2 font-semibold after:absolute after:inset-0 after:content-['']"
      >
        {{ item.name }}
      </RouterLink>
      <div class="mt-1 flex flex-wrap items-center gap-1.5">
        <StatusChip :status="item.status" />
        <span
          v-if="item.units_left > 1"
          class="rounded-full bg-ink px-1.5 text-xs leading-5 font-bold text-bg"
          :aria-label="`${item.units_left} copies left`"
          >×{{ item.units_left }}</span
        >
        <RouterLink
          v-if="showSetChip && item.template_id"
          :to="{ name: 'inventory', query: { view: 'sets', expand: item.template_id } }"
          class="relative z-10 inline-flex max-w-40 items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs font-medium text-ink-2 hover:border-ink-2"
          :aria-label="`Show set ${item.template_name}`"
        >
          <Library class="size-3 shrink-0" aria-hidden="true" />
          <span class="truncate">{{ item.template_name }}</span>
        </RouterLink>
        <RouterLink
          v-for="tag in item.tags"
          :key="tag"
          :to="{ name: 'inventory', query: { tag } }"
          class="relative z-10 inline-flex max-w-40 items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-2 hover:text-ink"
          :aria-label="`Show items tagged ${tag}`"
        >
          <Tag class="size-3 shrink-0" aria-hidden="true" />
          <span class="truncate">{{ tag }}</span>
        </RouterLink>
      </div>
    </div>

    <div class="shrink-0 text-right">
      <p class="text-lg leading-tight font-bold tabular-nums">
        {{ item.list_price_cents === null ? '—' : formatCents(item.list_price_cents) }}
      </p>
      <p class="text-xs text-muted tabular-nums">cost {{ formatCents(item.cost_cents) }}</p>
      <p
        v-if="profit !== null"
        class="text-xs font-semibold tabular-nums"
        :class="profit >= 0 ? 'text-success' : 'text-danger'"
      >
        {{ formatSignedCents(profit) }}
      </p>
    </div>

    <button
      type="button"
      class="relative z-10 -mr-2 grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-2"
      :aria-label="`Actions for ${item.name}`"
      @click="$emit('menu', item)"
    >
      <EllipsisVertical class="size-5" aria-hidden="true" />
    </button>
  </div>
</template>
