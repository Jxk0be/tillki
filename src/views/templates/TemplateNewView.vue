<script setup lang="ts">
import { BookPlus } from 'lucide-vue-next'
import PagePlaceholder from '@/components/ui/PagePlaceholder.vue'
</script>

<template>
  <PagePlaceholder :icon="BookPlus" title="New set" :step="7" />
</template>
