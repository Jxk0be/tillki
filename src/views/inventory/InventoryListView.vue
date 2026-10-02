<script setup lang="ts">
import { Package } from 'lucide-vue-next'
import PagePlaceholder from '@/components/ui/PagePlaceholder.vue'
</script>

<template>
  <PagePlaceholder :icon="Package" title="Your inventory" :step="5" />
</template>
