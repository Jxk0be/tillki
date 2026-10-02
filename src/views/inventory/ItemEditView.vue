<script setup lang="ts">
import ItemForm from '@/components/inventory/ItemForm.vue'

defineProps<{ id: string }>()
</script>

<template>
  <ItemForm :key="id" :item-id="id" />
</template>
