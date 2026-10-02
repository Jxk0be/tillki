<script setup lang="ts">
import TemplateForm from '@/components/templates/TemplateForm.vue'

defineProps<{ id: string }>()
</script>

<template>
  <TemplateForm :key="id" :template-id="id" />
</template>
