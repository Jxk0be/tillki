<script setup lang="ts">
import { computed } from 'vue'
import { BookCopy, ExternalLink, PackagePlus, Pencil } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSheet from '@/components/ui/BaseSheet.vue'
import type { IsbnAnalysis } from '@/composables/useIsbnAssist'

/** What a scan found, and what to do with it. */
const props = defineProps<{ result: IsbnAnalysis | null }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{
  /** Fill the form with the book's details. */
  useDetails: []
  /** Keep only the ISBN (as a one-off). */
  keepIsbn: []
  addToSet: [setId: string, volume: number, isbn: string]
  addCopy: [itemId: string]
  openItem: [itemId: string]
}>()

const title = computed(() => {
  switch (props.result?.kind) {
    case 'existing':
      return 'You already have this one'
    case 'set_match':
      return 'This belongs to one of your sets'
    case 'book':
      return 'Found it'
    default:
      return 'Not found'
  }
})

function close(then: () => void) {
  open.value = false
  then()
}

function addCopy() {
  const r = props.result
  if (r?.kind === 'existing') close(() => emit('addCopy', r.item.id))
}

function openItem() {
  const r = props.result
  if (r?.kind === 'existing') close(() => emit('openItem', r.item.id))
}

function addToSet() {
  const r = props.result
  if (r?.kind === 'set_match') close(() => emit('addToSet', r.set.id, r.volume, r.isbn))
}
</script>

<template>
  <BaseSheet
    v-model:open="open"
    :title="title"
    :description="result ? `ISBN ${result.isbn}` : undefined"
  >
    <template v-if="result?.kind === 'existing'">
      <p class="text-ink-2">
        <span class="font-semibold text-ink">{{ result.item.name }}</span> is already in inventory
        ({{ result.item.unitsLeft }} left). Add another copy to it instead of a second row.
      </p>
    </template>

    <template v-else-if="result?.kind === 'set_match'">
      <p class="font-semibold">{{ result.book.title }}</p>
      <p class="mt-1 text-ink-2">
        Looks like volume {{ result.volume }} of your set
        <span class="font-semibold text-ink">{{ result.set.name }}</span
        >.
      </p>
    </template>

    <template v-else-if="result?.kind === 'book'">
      <dl class="space-y-1 text-sm">
        <div>
          <dt class="inline text-ink-2">Title:</dt>
          <dd class="inline font-semibold">{{ result.book.title }}</dd>
        </div>
        <div>
          <dt class="inline text-ink-2">Series:</dt>
          <dd class="inline">{{ result.book.series }}</dd>
        </div>
        <div v-if="result.book.volume">
          <dt class="inline text-ink-2">Volume:</dt>
          <dd class="inline">{{ result.book.volume }}</dd>
        </div>
        <div v-if="result.book.publisher">
          <dt class="inline text-ink-2">Publisher:</dt>
          <dd class="inline">{{ result.book.publisher }}</dd>
        </div>
      </dl>
      <p v-if="result.book.description" class="mt-2 line-clamp-4 text-sm text-ink-2">
        {{ result.book.description }}
      </p>
      <p class="mt-2 text-xs text-muted">
        From {{ result.book.source }}. You can edit everything after.
      </p>
    </template>

    <template v-else-if="result?.kind === 'not_found'">
      <p class="text-ink-2">
        Google Books and Open Library don't know this ISBN. It's been filled in; add the rest by
        hand.
      </p>
    </template>

    <template #footer>
      <div class="flex flex-col gap-2">
        <template v-if="result?.kind === 'existing'">
          <BaseButton block @click="addCopy">
            <PackagePlus class="size-4" aria-hidden="true" /> Add 1 more copy
          </BaseButton>
          <BaseButton block variant="secondary" @click="openItem">
            <ExternalLink class="size-4" aria-hidden="true" /> Open it
          </BaseButton>
        </template>
        <template v-else-if="result?.kind === 'set_match'">
          <BaseButton block @click="addToSet">
            <BookCopy class="size-4" aria-hidden="true" /> Add as Volume {{ result.volume }} of
            {{ result.set.name }}
          </BaseButton>
          <BaseButton block variant="secondary" @click="close(() => emit('useDetails'))"
            >Keep as one-off</BaseButton
          >
        </template>
        <template v-else-if="result?.kind === 'book'">
          <BaseButton block @click="close(() => emit('useDetails'))">
            <Pencil class="size-4" aria-hidden="true" /> Use these details
          </BaseButton>
          <BaseButton block variant="secondary" @click="close(() => emit('keepIsbn'))"
            >Just keep the ISBN</BaseButton
          >
        </template>
        <BaseButton v-else block @click="close(() => emit('keepIsbn'))">OK</BaseButton>
      </div>
    </template>
  </BaseSheet>
</template>
