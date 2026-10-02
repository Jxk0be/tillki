<script setup lang="ts">
/** Loading placeholder shaped like an inventory row: thumbnail, two text lines, a price. */
withDefaults(defineProps<{ thumbnail?: boolean }>(), { thumbnail: true })
</script>

<template>
  <div class="flex animate-pulse items-center gap-3 py-3" aria-hidden="true">
    <div v-if="thumbnail" class="size-16 shrink-0 rounded-lg bg-surface-2" />
    <div class="min-w-0 flex-1 space-y-2">
      <div class="h-4 w-3/4 rounded bg-surface-2" />
      <div class="h-3 w-1/2 rounded bg-surface-2" />
    </div>
    <div class="h-5 w-14 shrink-0 rounded bg-surface-2" />
  </div>
</template>
