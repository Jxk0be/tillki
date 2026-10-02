<script setup lang="ts">
import { Compass } from 'lucide-vue-next'
import EmptyState from '@/components/ui/EmptyState.vue'
</script>

<template>
  <EmptyState
    :icon="Compass"
    title="Page not found"
    message="That page doesn't exist. It may have moved, or the link was mistyped."
    action-label="Go to inventory"
    to="/inventory"
  />
</template>
