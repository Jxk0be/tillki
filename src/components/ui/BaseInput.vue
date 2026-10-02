<script setup lang="ts">
import { computed, useId } from 'vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    label: string
    hint?: string
    error?: string
    /** Short text shown inside the field before the value, like "$". */
    prefix?: string
    id?: string
    hideLabel?: boolean
  }>(),
  { hideLabel: false },
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
    <label
      :for="inputId"
      class="text-sm font-semibold text-ink-2"
      :class="{ 'sr-only': hideLabel }"
    >
      {{ label }}
    </label>
    <div
      class="flex min-h-11 items-center rounded-lg border-2 bg-surface focus-within:border-primary"
      :class="error ? 'border-danger' : 'border-line'"
    >
      <span v-if="prefix" class="pl-3 text-base text-muted" aria-hidden="true">{{ prefix }}</span>
      <input
        :id="inputId"
        v-model="model"
        v-bind="$attrs"
        class="min-h-11 w-full min-w-0 rounded-lg bg-transparent px-3 text-base text-ink outline-none placeholder:text-muted"
        :class="{ 'pl-1.5': prefix }"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="describedBy"
      />
    </div>
    <p v-if="error" :id="errorId" class="text-sm font-medium text-danger">{{ error }}</p>
    <p v-if="hint" :id="hintId" class="text-sm text-muted">{{ hint }}</p>
  </div>
</template>
