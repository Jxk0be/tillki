<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BookCopy, BookPlus, ChevronRight, PackagePlus, Search } from 'lucide-vue-next'
import ItemForm from '@/components/inventory/ItemForm.vue'
import { useInventoryStore } from '@/stores/inventory'

/**
 * /inventory/new: choose "One-off" or "Part of a set". The Add sheet links
 * straight to ?type=one_off or ?type=set; ?duplicate=<id> opens a prefilled form.
 */
const route = useRoute()
const router = useRouter()
const inventory = useInventoryStore()

const type = computed(() =>
  route.query.type === 'one_off' || route.query.type === 'set' ? route.query.type : null,
)
const duplicateFrom = computed(() =>
  typeof route.query.duplicate === 'string' ? route.query.duplicate : undefined,
)
const showForm = computed(() => type.value === 'one_off' || !!duplicateFrom.value)

const search = ref('')
const sets = computed(() => {
  const q = search.value.trim().toLowerCase()
  return q
    ? inventory.setOptions.filter((s) => s.name.toLowerCase().includes(q))
    : inventory.setOptions
})
watch(
  type,
  (t) => {
    if (t === 'set') void inventory.loadSetOptions()
  },
  { immediate: true },
)

function choose(next: 'one_off' | 'set') {
  void router.push({ name: 'item-new', query: { type: next } })
}
</script>

<template>
  <ItemForm v-if="showForm" :key="duplicateFrom ?? 'new'" :duplicate-from="duplicateFrom" />

  <div v-else-if="type === 'set'" class="mx-auto max-w-xl">
    <h2 class="mb-1 text-lg font-bold">Which set?</h2>
    <p class="mb-4 text-ink-2">Pick the series, then choose which volumes came in.</p>
    <label class="relative block">
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
    <ul class="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      <li v-for="s in sets" :key="s.id">
        <RouterLink
          :to="{ name: 'template-add-volumes', params: { id: s.id } }"
          class="flex min-h-14 items-center gap-3 px-4 font-medium hover:bg-surface-2"
        >
          <BookCopy class="size-5 text-ink-2" aria-hidden="true" />
          <span class="flex-1">{{ s.name }}</span>
          <ChevronRight class="size-5 text-muted" aria-hidden="true" />
        </RouterLink>
      </li>
      <li v-if="sets.length === 0" class="px-4 py-3 text-ink-2">
        {{ search ? 'No sets match.' : 'No sets yet.' }}
      </li>
      <li>
        <RouterLink
          :to="{ name: 'template-new' }"
          class="flex min-h-14 items-center gap-3 px-4 font-semibold text-primary hover:bg-surface-2"
        >
          <BookPlus class="size-5" aria-hidden="true" />
          <span class="flex-1">New set</span>
        </RouterLink>
      </li>
    </ul>
  </div>

  <div v-else class="mx-auto max-w-xl">
    <h2 class="mb-4 text-lg font-bold">What are you adding?</h2>
    <div class="grid gap-3 sm:grid-cols-2">
      <button
        type="button"
        class="flex min-h-28 flex-col items-start gap-2 rounded-2xl border-2 border-line bg-surface p-4 text-left hover:border-ink-2"
        @click="choose('one_off')"
      >
        <PackagePlus class="size-7" aria-hidden="true" />
        <span class="font-bold">One-off</span>
        <span class="text-sm text-ink-2">A single figure, piece of merch, or standalone book.</span>
      </button>
      <button
        type="button"
        class="flex min-h-28 flex-col items-start gap-2 rounded-2xl border-2 border-line bg-surface p-4 text-left hover:border-ink-2"
        @click="choose('set')"
      >
        <BookCopy class="size-7" aria-hidden="true" />
        <span class="font-bold">Part of a set</span>
        <span class="text-sm text-ink-2">Volumes of a series like One Piece.</span>
      </button>
    </div>
  </div>
</template>
