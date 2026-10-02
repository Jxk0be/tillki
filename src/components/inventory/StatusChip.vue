<script setup lang="ts">
import { statusLabels } from '@/lib/labels'
import type { ItemStatus } from '@/types/inventory'

defineProps<{ status: ItemStatus }>()

// Text always says the status; color is only a second cue.
const tone: Record<ItemStatus, string> = {
  draft: 'border-dashed border-muted text-ink-2',
  in_stock: 'border-line bg-surface-2 text-ink',
  listed: 'border-primary/40 bg-primary/10 text-primary',
  reserved: 'border-accent/40 bg-accent/10 text-accent',
  sold: 'border-success/40 bg-success/10 text-success',
  kept: 'border-line text-ink-2',
  written_off: 'border-line text-muted line-through',
}
</script>

<template>
  <span
    class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
    :class="tone[status]"
  >
    {{ statusLabels[status] }}
  </span>
</template>
