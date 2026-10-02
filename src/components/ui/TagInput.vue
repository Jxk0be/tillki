<script setup lang="ts">
import { ref, useId } from 'vue'
import { X } from 'lucide-vue-next'

/** Type a tag and press Enter (or comma) to add it as a chip. */
defineProps<{ label: string; hint?: string }>()
const tags = defineModel<string[]>({ default: () => [] })
const draft = ref('')
const id = useId()

function commit() {
  const parts = draft.value
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
  if (parts.length) tags.value = [...new Set([...tags.value, ...parts])]
  draft.value = ''
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    commit()
  } else if (e.key === 'Backspace' && draft.value === '' && tags.value.length) {
    tags.value = tags.value.slice(0, -1)
  }
}

function remove(tag: string) {
  tags.value = tags.value.filter((t) => t !== tag)
}
</script>

<template>
  <div>
    <label :for="id" class="mb-1.5 block text-sm font-semibold text-ink-2">{{ label }}</label>
    <div
      class="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border-2 border-line bg-surface px-2 py-1.5 focus-within:border-primary"
    >
      <span
        v-for="tag in tags"
        :key="tag"
        class="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pr-1 pl-2.5 text-sm"
      >
        {{ tag }}
        <button
          type="button"
          class="grid size-6 place-items-center rounded-full hover:bg-line"
          :aria-label="`Remove tag ${tag}`"
          @click="remove(tag)"
        >
          <X class="size-3.5" aria-hidden="true" />
        </button>
      </span>
      <input
        :id="id"
        v-model="draft"
        type="text"
        class="min-w-24 flex-1 bg-transparent px-1 text-base outline-none"
        enterkeyhint="done"
        autocomplete="off"
        @keydown="onKeydown"
        @blur="commit"
      />
    </div>
    <p v-if="hint" class="mt-1.5 text-sm text-muted">{{ hint }}</p>
  </div>
</template>
