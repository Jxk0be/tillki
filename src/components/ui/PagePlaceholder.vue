<script setup lang="ts">
import type { Component } from 'vue'
import EmptyState from './EmptyState.vue'

/** Stand-in body for routes whose real screen is built in a later step. */
defineProps<{ icon: Component; title: string; step: number }>()
</script>

<template>
  <EmptyState :icon="icon" :title="title" :message="`This screen gets built in step ${step}.`" />
</template>
