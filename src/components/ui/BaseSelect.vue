<script setup lang="ts" generic="T extends string">
import { computed, useId } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import type { SelectOption } from '@/types/ui'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  label: string
  options: SelectOption<T>[]
  placeholder?: string
  hint?: string
  error?: string
  id?: string
}>()

const model = defineModel<T | ''>({ default: '' })

const autoId = useId()
const selectId = computed(() => props.id ?? autoId)
const hintId = computed(() => `${selectId.value}-hint`)
const errorId = computed(() => `${selectId.value}-error`)
const describedBy = computed(
  () =>
    [props.error ? errorId.value : null, props.hint ? hintId.value : null]
      .filter(Boolean)
      .join(' ') || undefined,
)
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="selectId" class="text-sm font-semibold text-ink-2">{{ label }}</label>
    <div class="relative">
      <select
        :id="selectId"
        v-model="model"
        v-bind="$attrs"
        class="min-h-11 w-full appearance-none rounded-lg border-2 bg-surface py-2 pr-10 pl-3 text-base text-ink outline-none focus:border-primary"
        :class="error ? 'border-danger' : 'border-line'"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="describedBy"
      >
        <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
        <option
          v-for="option in options"
          :key="option.value"
          :value="option.value"
          :disabled="option.disabled"
        >
          {{ option.label }}
        </option>
      </select>
      <ChevronDown
        class="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
    </div>
    <p v-if="error" :id="errorId" class="text-sm font-medium text-danger">{{ error }}</p>
    <p v-if="hint" :id="hintId" class="text-sm text-muted">{{ hint }}</p>
  </div>
</template>
