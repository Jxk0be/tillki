<script setup lang="ts">
import { BookCopy } from 'lucide-vue-next'
import PagePlaceholder from '@/components/ui/PagePlaceholder.vue'

defineProps<{ id: string }>()
</script>

<template>
  <PagePlaceholder :icon="BookCopy" title="Add volumes" :step="7" />
</template>
