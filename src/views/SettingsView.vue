<script setup lang="ts">
import ThemeToggle from '@/components/ui/ThemeToggle.vue'
</script>

<template>
  <div class="mx-auto max-w-xl space-y-8 lg:mx-0">
    <section class="rounded-2xl border border-line bg-surface p-4 lg:p-6">
      <h2 class="mb-4 text-lg font-bold">Appearance</h2>
      <ThemeToggle />
    </section>

    <section class="rounded-2xl border border-line bg-surface p-4 lg:p-6">
      <h2 class="text-lg font-bold">Fees and thresholds</h2>
      <p class="mt-1 text-ink-2">
        Platform fee rules, default platform, stale days and target margin arrive in step 8.
      </p>
    </section>
  </div>
</template>
