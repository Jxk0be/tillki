<script setup lang="ts">
import { LibraryBig } from 'lucide-vue-next'
import PagePlaceholder from '@/components/ui/PagePlaceholder.vue'

defineProps<{ id: string }>()
</script>

<template>
  <PagePlaceholder :icon="LibraryBig" title="Set details" :step="7" />
</template>
