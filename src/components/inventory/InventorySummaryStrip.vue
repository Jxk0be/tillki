<script setup lang="ts">
import { formatCents, formatSignedCents } from '@/lib/money'
import type { InventorySummary } from '@/stores/inventory'

/** Totals for whatever the current filters match (stock on the shelf only). */
defineProps<{ summary: InventorySummary | null; loading: boolean }>()
</script>

<template>
  <dl
    class="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4"
    :aria-busy="loading"
  >
    <div class="bg-surface px-3 py-2">
      <dt class="text-xs text-ink-2">Units in stock</dt>
      <dd class="text-lg font-bold tabular-nums">{{ summary ? summary.unitsInStock : '–' }}</dd>
    </div>
    <div class="bg-surface px-3 py-2">
      <dt class="text-xs text-ink-2">Cost basis</dt>
      <dd class="text-lg font-bold tabular-nums">
        {{ summary ? formatCents(summary.costBasisCents) : '–' }}
      </dd>
    </div>
    <div class="bg-surface px-3 py-2">
      <dt class="text-xs text-ink-2">Asking total</dt>
      <dd class="text-lg font-bold tabular-nums">
        {{ summary ? formatCents(summary.askingCents) : '–' }}
      </dd>
    </div>
    <div class="bg-surface px-3 py-2">
      <dt class="text-xs text-ink-2">Est. profit</dt>
      <dd
        class="text-lg font-bold tabular-nums"
        :class="summary && summary.estProfitCents < 0 ? 'text-danger' : 'text-success'"
      >
        {{ summary ? formatSignedCents(summary.estProfitCents) : '–' }}
      </dd>
    </div>
  </dl>
</template>
