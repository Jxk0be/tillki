<script setup lang="ts">
import { Package } from 'lucide-vue-next'
import PagePlaceholder from '@/components/ui/PagePlaceholder.vue'

defineProps<{ id: string }>()
</script>

<template>
  <PagePlaceholder :icon="Package" title="Item details" :step="5" />
</template>
