<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useClipboard } from '@vueuse/core'
import { BookPlus, ClipboardCopy, LibraryBig, Search } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ItemThumb from '@/components/inventory/ItemThumb.vue'
import SetProgress from '@/components/templates/SetProgress.vue'
import { useSignedUrls } from '@/composables/useSignedUrls'
import { listSets } from '@/composables/useSets'
import { useToast } from '@/composables/useToast'
import { formatCents } from '@/lib/money'
import { shoppingList } from '@/lib/sets'
import { supabase } from '@/lib/supabase'
import type { InventorySet } from '@/types/inventory'

const toast = useToast()
const { request } = useSignedUrls()
const { copy, isSupported: canCopy } = useClipboard({ legacy: true })

const sets = ref<InventorySet[]>([])
const languages = ref(new Map<string, string | null>())
const loading = ref(true)
const error = ref<string | null>(null)
const search = ref('')
const sort = ref<'name' | 'missing' | 'value'>('name')

onMounted(async () => {
  try {
    const [rows, extra] = await Promise.all([
      listSets(),
      supabase.from('item_templates').select('id, language').is('archived_at', null),
    ])
    sets.value = rows
    languages.value = new Map((extra.data ?? []).map((r) => [r.id, r.language]))
    void request(rows.map((s) => s.cover_path))
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong.'
  } finally {
    loading.value = false
  }
})

const visible = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = q ? sets.value.filter((s) => s.name.toLowerCase().includes(q)) : [...sets.value]
  if (sort.value === 'missing')
    list.sort((a, b) => b.missing_count - a.missing_count || a.name.localeCompare(b.name))
  if (sort.value === 'value') list.sort((a, b) => b.list_value_cents - a.list_value_cents)
  return list
})

async function copyAll() {
  const text = shoppingList(
    sets.value.map((s) => ({ ...s, language: languages.value.get(s.id) ?? null })),
  )
  if (!text) {
    toast.show('No gaps in any set.')
    return
  }
  await copy(text)
  toast.success('Shopping list for all sets copied.')
}

const sortOptions = [
  { value: 'name' as const, label: 'Name' },
  { value: 'missing' as const, label: 'Most missing' },
  { value: 'value' as const, label: 'Value' },
]
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <div class="mb-4 flex flex-wrap items-end gap-2">
      <label class="relative min-w-48 flex-1">
        <span class="sr-only">Search sets</span>
        <Search
          class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          v-model="search"
          type="search"
          placeholder="Search sets"
          class="min-h-11 w-full rounded-xl border-2 border-line bg-surface pr-3 pl-9 text-base outline-none focus:border-primary"
        />
      </label>
      <BaseSelect v-model="sort" label="Sort" class="w-40" :options="sortOptions" />
    </div>
    <div class="mb-4 flex flex-wrap gap-2">
      <RouterLink
        :to="{ name: 'template-new' }"
        class="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 font-semibold text-primary-ink"
      >
        <BookPlus class="size-5" aria-hidden="true" /> New set
      </RouterLink>
      <BaseButton v-if="canCopy && sets.length" variant="secondary" @click="copyAll">
        <ClipboardCopy class="size-4" aria-hidden="true" /> Copy shopping list for all sets
      </BaseButton>
    </div>

    <p
      v-if="error"
      class="rounded-xl border border-danger/40 bg-danger/10 p-3 text-danger"
      role="alert"
    >
      {{ error }}
    </p>
    <div v-else-if="loading" class="grid gap-3 sm:grid-cols-2" aria-busy="true">
      <div v-for="n in 4" :key="n" class="h-32 animate-pulse rounded-2xl bg-surface-2" />
    </div>
    <EmptyState
      v-else-if="sets.length === 0"
      :icon="LibraryBig"
      title="No sets yet"
      message="A set holds what every volume of a series shares: name, description and a photo."
      action-label="Create your first set"
      :to="{ name: 'template-new' }"
    />
    <p v-else-if="visible.length === 0" class="py-8 text-center text-ink-2">
      No sets match "{{ search }}".
    </p>
    <ul v-else class="grid grid-cols-1 gap-3 sm:auto-rows-fr sm:grid-cols-2">
      <li v-for="s in visible" :key="s.id" class="min-w-0">
        <RouterLink
          :to="{ name: 'template-detail', params: { id: s.id } }"
          class="flex h-full gap-3 rounded-2xl border border-line bg-surface p-3 hover:border-ink-2"
        >
          <ItemThumb :path="s.cover_path" size="lg" :alt="s.name" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-lg font-bold">{{ s.name }}</p>
            <SetProgress :set="s" class="mt-0.5" />
            <p v-if="s.missing_ranges" class="mt-1 truncate text-sm text-ink-2">
              Missing <span class="font-semibold text-ink">{{ s.missing_ranges }}</span>
            </p>
            <p class="mt-1 text-sm text-ink-2 tabular-nums">
              {{ s.units_in_stock }} in stock · {{ formatCents(s.list_value_cents) }} asking
            </p>
          </div>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>
