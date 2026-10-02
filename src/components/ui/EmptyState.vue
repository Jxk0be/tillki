<script setup lang="ts">
import type { Component } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import BaseButton from './BaseButton.vue'

/** An icon, a message, and at most one action (a link via `to`, or a click event). */
defineProps<{
  icon: Component
  title: string
  message?: string
  actionLabel?: string
  to?: RouteLocationRaw
}>()

defineEmits<{ action: [] }>()
</script>

<template>
  <div class="flex flex-col items-center px-6 py-12 text-center">
    <div class="mb-4 grid size-16 place-items-center rounded-2xl bg-surface-2 text-ink-2">
      <component :is="icon" class="size-8" aria-hidden="true" />
    </div>
    <h2 class="text-lg font-bold">{{ title }}</h2>
    <p v-if="message" class="mt-1 max-w-sm text-ink-2">{{ message }}</p>
    <div v-if="actionLabel" class="mt-6">
      <RouterLink
        v-if="to"
        :to="to"
        class="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 font-semibold text-primary-ink hover:opacity-90"
      >
        {{ actionLabel }}
      </RouterLink>
      <BaseButton v-else @click="$emit('action')">{{ actionLabel }}</BaseButton>
    </div>
  </div>
</template>
