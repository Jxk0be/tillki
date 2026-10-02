<script setup lang="ts">
import { Pencil } from 'lucide-vue-next'
import PagePlaceholder from '@/components/ui/PagePlaceholder.vue'

defineProps<{ id: string }>()
</script>

<template>
  <PagePlaceholder :icon="Pencil" title="Edit item" :step="6" />
</template>
