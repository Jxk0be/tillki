<script setup lang="ts">
import { MessageCircle } from 'lucide-vue-next'
import PagePlaceholder from '@/components/ui/PagePlaceholder.vue'

defineProps<{ threadId?: string }>()
</script>

<template>
  <PagePlaceholder :icon="MessageCircle" title="Ask Kura" :step="11" />
</template>
