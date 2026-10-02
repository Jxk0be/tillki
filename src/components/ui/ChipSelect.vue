<script setup lang="ts" generic="T extends string">
import { useId } from 'vue'
import BaseChip from './BaseChip.vue'

/** Pick one option from a row of chips (a radio group in chip form). */
const props = withDefaults(
  defineProps<{
    label: string
    options: { value: T; label: string }[]
    error?: string
    required?: boolean
    /** Allow tapping the selected chip again to clear it. */
    clearable?: boolean
    id?: string
  }>(),
  { error: '', required: false, clearable: false, id: undefined },
)
const model = defineModel<T | null>({ default: null })
const autoId = useId()

function choose(value: T) {
  model.value = props.clearable && model.value === value ? null : value
}
</script>

<template>
  <fieldset :id="id ?? autoId" tabindex="-1" class="outline-none">
    <legend class="mb-2 text-sm font-semibold text-ink-2">
      {{ label }}<span v-if="required" class="text-danger" aria-hidden="true"> *</span>
    </legend>
    <div class="flex flex-wrap gap-2">
      <BaseChip
        v-for="option in options"
        :key="option.value"
        :selected="model === option.value"
        @toggle="choose(option.value)"
        >{{ option.label }}</BaseChip
      >
    </div>
    <p v-if="error" class="mt-1.5 text-sm font-medium text-danger">{{ error }}</p>
  </fieldset>
</template>
