<script setup lang="ts">
import { useId } from 'vue'
import { Minus, Plus } from 'lucide-vue-next'

/** A whole-number stepper with big buttons for thumbs. */
const props = withDefaults(defineProps<{ label: string; min?: number; max?: number }>(), {
  min: 1,
  max: 999,
})
const model = defineModel<number>({ default: 1 })
const id = useId()

function set(value: number) {
  model.value = Math.min(props.max, Math.max(props.min, Math.round(value) || props.min))
}
</script>

<template>
  <div>
    <label :for="id" class="mb-1.5 block text-sm font-semibold text-ink-2">{{ label }}</label>
    <div class="inline-flex items-center rounded-lg border-2 border-line bg-surface">
      <button
        type="button"
        class="grid size-11 place-items-center disabled:opacity-40"
        :disabled="model <= min"
        :aria-label="`Decrease ${label.toLowerCase()}`"
        @click="set(model - 1)"
      >
        <Minus class="size-5" aria-hidden="true" />
      </button>
      <input
        :id="id"
        :value="model"
        type="number"
        inputmode="numeric"
        :min="min"
        :max="max"
        class="h-11 w-14 bg-transparent text-center text-base font-semibold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        @change="set(Number(($event.target as HTMLInputElement).value))"
      />
      <button
        type="button"
        class="grid size-11 place-items-center disabled:opacity-40"
        :disabled="model >= max"
        :aria-label="`Increase ${label.toLowerCase()}`"
        @click="set(model + 1)"
      >
        <Plus class="size-5" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
