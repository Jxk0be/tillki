<script setup lang="ts">
import { Pencil } from 'lucide-vue-next'
import PagePlaceholder from '@/components/ui/PagePlaceholder.vue'

defineProps<{ id: string }>()
</script>

<template>
  <PagePlaceholder :icon="Pencil" title="Edit set" :step="7" />
</template>
