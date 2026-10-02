<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseChip from '@/components/ui/BaseChip.vue'
import BaseSheet from '@/components/ui/BaseSheet.vue'
import TagInput from '@/components/ui/TagInput.vue'

/** Adds one or more tags to several items at once (e.g. "box set 1-11"). */
const props = defineProps<{
  count: number
  /** Tags already in use, offered as one-tap choices. */
  suggestions: string[]
  saving: boolean
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ save: [tags: string[]] }>()

const tags = ref<string[]>([])
watch(open, (isOpen) => {
  if (isOpen) tags.value = []
})

const unused = computed(() => props.suggestions.filter((t) => !tags.value.includes(t)))
const title = computed(() => `Tag ${props.count} item${props.count === 1 ? '' : 's'}`)
</script>

<template>
  <BaseSheet
    v-model:open="open"
    :title="title"
    description="Tags are added to what the items already have. Tap a tag on any item to see everything with it."
  >
    <div class="space-y-4">
      <TagInput v-model="tags" label="Tags" hint="For example: box set 1-11. Press Enter to add." />
      <div v-if="unused.length">
        <p class="mb-2 text-sm font-semibold text-ink-2">Tags in use</p>
        <div class="flex flex-wrap gap-2">
          <BaseChip v-for="t in unused" :key="t" @toggle="tags = [...tags, t]">{{ t }}</BaseChip>
        </div>
      </div>
    </div>

    <template #footer>
      <BaseButton block :loading="saving" :disabled="!tags.length" @click="emit('save', tags)">
        Add tags
      </BaseButton>
    </template>
  </BaseSheet>
</template>
