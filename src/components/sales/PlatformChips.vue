<script setup lang="ts">
import ChipSelect from '@/components/ui/ChipSelect.vue'
import { platformLabels } from '@/lib/labels'
import type { SalesPlatform } from '@/types/inventory'

/** Where it sold, as chips. */
defineProps<{ label?: string }>()
const model = defineModel<SalesPlatform | null>({ default: null })
const options = (Object.keys(platformLabels) as SalesPlatform[]).map((p) => ({
  value: p,
  label: platformLabels[p],
}))
</script>

<template>
  <ChipSelect v-model="model" :label="label ?? 'Sold on'" :options="options" required />
</template>
