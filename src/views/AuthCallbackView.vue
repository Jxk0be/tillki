<script setup lang="ts">
import { LoaderCircle } from 'lucide-vue-next'
</script>

<template>
  <div class="m-auto flex flex-col items-center gap-3 py-12 text-center" role="status">
    <LoaderCircle class="size-8 animate-spin text-muted" aria-hidden="true" />
    <p class="text-ink-2">Signing you in…</p>
  </div>
</template>
