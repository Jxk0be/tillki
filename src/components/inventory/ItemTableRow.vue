<script setup lang="ts">
import { EllipsisVertical } from 'lucide-vue-next'
import ItemThumb from './ItemThumb.vue'
import StatusChip from './StatusChip.vue'
import { categoryLabels, conditionLabels } from '@/lib/labels'
import { formatCents, formatSignedCents } from '@/lib/money'
import { formatDate } from '@/lib/dates'
import type { InventoryItem } from '@/types/inventory'

/** One item as a desktop table row. */
withDefaults(
  defineProps<{
    item: InventoryItem
    selectable?: boolean
    selected?: boolean
    indent?: boolean
    highlight?: boolean
  }>(),
  { selectable: false, selected: false, indent: false, highlight: false },
)
defineEmits<{ toggle: [id: string]; menu: [item: InventoryItem] }>()
</script>

<template>
  <tr
    class="border-b border-line last:border-b-0 hover:bg-surface-2/60"
    :class="{ 'bg-primary/5': highlight || selected }"
  >
    <td class="w-10 px-3">
      <input
        v-if="selectable"
        type="checkbox"
        class="size-4 accent-current"
        :checked="selected"
        :aria-label="`Select ${item.name}`"
        @change="$emit('toggle', item.id)"
      />
    </td>
    <td class="py-2" :class="{ 'pl-6': indent }">
      <ItemThumb :path="item.cover_path" :source="item.cover_source" size="sm" :alt="item.name" />
    </td>
    <td class="px-3 font-mono text-xs whitespace-nowrap text-ink-2">{{ item.sku }}</td>
    <td class="max-w-72 px-3">
      <RouterLink
        :to="{ name: 'item-detail', params: { id: item.id } }"
        class="line-clamp-2 font-semibold hover:underline"
      >
        {{ item.name }}
      </RouterLink>
    </td>
    <td class="px-3 whitespace-nowrap text-ink-2">
      <template v-if="item.template_id">
        <RouterLink
          :to="{ name: 'inventory', query: { view: 'sets', expand: item.template_id } }"
          class="hover:underline"
          >{{ item.template_name }}</RouterLink
        >
        <span class="text-muted"> · {{ item.volume_number }}</span>
      </template>
      <span v-else class="text-muted">—</span>
    </td>
    <td class="px-3 whitespace-nowrap">{{ categoryLabels[item.category] }}</td>
    <td class="px-3 whitespace-nowrap">
      {{ item.condition ? conditionLabels[item.condition] : '—' }}
    </td>
    <td class="px-3 text-right tabular-nums">{{ item.units_left }}</td>
    <td class="px-3"><StatusChip :status="item.status" /></td>
    <td class="px-3 text-right tabular-nums">{{ formatCents(item.cost_cents) }}</td>
    <td class="px-3 text-right font-semibold tabular-nums">
      {{ item.list_price_cents === null ? '—' : formatCents(item.list_price_cents) }}
    </td>
    <td
      class="px-3 text-right tabular-nums"
      :class="(item.est_profit_cents ?? 0) >= 0 ? 'text-success' : 'text-danger'"
    >
      {{ item.est_profit_cents === null ? '—' : formatSignedCents(item.est_profit_cents) }}
    </td>
    <td class="px-3 whitespace-nowrap">{{ formatDate(item.created_at) }}</td>
    <td class="px-3 text-right tabular-nums">{{ item.days_in_stock }}</td>
    <td class="w-12 pr-2 text-right">
      <button
        type="button"
        class="grid size-9 place-items-center rounded-full text-ink-2 hover:bg-surface-2"
        :aria-label="`Actions for ${item.name}`"
        @click="$emit('menu', item)"
      >
        <EllipsisVertical class="size-4" aria-hidden="true" />
      </button>
    </td>
  </tr>
</template>
