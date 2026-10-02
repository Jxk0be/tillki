<script setup lang="ts">
import type { InventorySet } from '@/types/inventory'

/** "18 of 32 owned" with a thin bar, or "18 owned, total unknown". */
defineProps<{ set: InventorySet }>()
</script>

<template>
  <div>
    <p class="text-sm text-ink-2">
      <template v-if="set.total_volumes">
        <span class="font-semibold text-ink"
          >{{ set.volumes_owned }} of {{ set.total_volumes }}</span
        >
        owned
      </template>
      <template v-else>
        <span class="font-semibold text-ink">{{ set.volumes_owned }}</span> owned, total unknown
      </template>
    </p>
    <div
      v-if="set.total_volumes"
      class="mt-1 h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-surface-2"
      role="progressbar"
      :aria-valuenow="set.completion_percent ?? 0"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="`${set.name} completion`"
    >
      <div
        class="h-full rounded-full bg-ink"
        :style="{ width: `${set.completion_percent ?? 0}%` }"
      />
    </div>
  </div>
</template>
