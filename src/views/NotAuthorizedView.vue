<script setup lang="ts">
import { ShieldX } from 'lucide-vue-next'
</script>

<template>
  <div class="m-auto flex max-w-sm flex-col items-center py-12 text-center">
    <div class="mb-4 grid size-16 place-items-center rounded-2xl bg-surface-2 text-ink-2">
      <ShieldX class="size-8" aria-hidden="true" />
    </div>
    <h1 class="text-2xl font-black">No access</h1>
    <p class="mt-2 text-ink-2">This Google account doesn't have access to Kura.</p>
  </div>
</template>
