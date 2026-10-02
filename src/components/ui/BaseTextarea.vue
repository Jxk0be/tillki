<script setup lang="ts">
import { computed, useId } from 'vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    label: string
    hint?: string
    error?: string
    id?: string
    rows?: number
  }>(),
  { rows: 4 },
)

const model = defineModel<string>({ default: '' })

const autoId = useId()
const inputId = computed(() => props.id ?? autoId)
const hintId = computed(() => `${inputId.value}-hint`)
const errorId = computed(() => `${inputId.value}-error`)
const describedBy = computed(
  () =>
    [props.error ? errorId.value : null, props.hint ? hintId.value : null]
      .filter(Boolean)
      .join(' ') || undefined,
)
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="inputId" class="text-sm font-semibold text-ink-2">{{ label }}</label>
    <textarea
      :id="inputId"
      v-model="model"
      v-bind="$attrs"
      :rows="rows"
      class="w-full rounded-lg border-2 bg-surface px-3 py-2.5 text-base text-ink outline-none placeholder:text-muted focus:border-primary"
      :class="error ? 'border-danger' : 'border-line'"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="describedBy"
    />
    <p v-if="error" :id="errorId" class="text-sm font-medium text-danger">{{ error }}</p>
    <p v-if="hint" :id="hintId" class="text-sm text-muted">{{ hint }}</p>
  </div>
</template>
