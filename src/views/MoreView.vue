<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'
import AccountPanel from '@/layouts/AccountPanel.vue'
import { secondaryNav } from '@/layouts/navigation'
</script>

<template>
  <div class="mx-auto max-w-xl space-y-6 lg:mx-0">
    <ul class="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      <li v-for="item in secondaryNav" :key="item.to">
        <RouterLink
          :to="item.to"
          class="flex min-h-14 items-center gap-3 px-4 font-medium hover:bg-surface-2"
        >
          <component :is="item.icon" class="size-5 text-ink-2" aria-hidden="true" />
          <span class="flex-1">{{ item.label }}</span>
          <ChevronRight class="size-5 text-muted" aria-hidden="true" />
        </RouterLink>
      </li>
    </ul>

    <section class="rounded-2xl border border-line bg-surface p-4" aria-label="Account">
      <AccountPanel />
    </section>
  </div>
</template>
