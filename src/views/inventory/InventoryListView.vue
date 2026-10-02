<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useIntersectionObserver, useMediaQuery, watchDebounced } from '@vueuse/core'
import {
  Archive,
  BookPlus,
  Download,
  LoaderCircle,
  PackagePlus,
  PackageSearch,
  Search,
  SlidersHorizontal,
  Tag,
  X,
} from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseChip from '@/components/ui/BaseChip.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import SkeletonRow from '@/components/ui/SkeletonRow.vue'
import AddTagsSheet from '@/components/inventory/AddTagsSheet.vue'
import ExportStockSheet from '@/components/inventory/ExportStockSheet.vue'
import InventoryFiltersSheet from '@/components/inventory/InventoryFiltersSheet.vue'
import InventorySummaryStrip from '@/components/inventory/InventorySummaryStrip.vue'
import ItemActionsSheet from '@/components/inventory/ItemActionsSheet.vue'
import ItemCardRow from '@/components/inventory/ItemCardRow.vue'
import ItemsTable from '@/components/inventory/ItemsTable.vue'
import SetGroupCard from '@/components/templates/SetGroupCard.vue'
import SetsTable from '@/components/templates/SetsTable.vue'
import MarkSoldSheet from '@/components/sales/MarkSoldSheet.vue'
import BundleSaleSheet from '@/components/sales/BundleSaleSheet.vue'
import { useDataVersion } from '@/composables/useDataChanged'
import { useItemActions } from '@/composables/useItemActions'
import { useSaleActions } from '@/composables/useSaleActions'
import { useSignedUrls } from '@/composables/useSignedUrls'
import { useToast } from '@/composables/useToast'
import { downloadCsv, toCsv } from '@/lib/csv'
import { formatDate, todayIso } from '@/lib/dates'
import {
  ageLabel,
  defaultFilters,
  extraFilterCount,
  parseInventoryQuery,
  toInventoryQuery,
  type InventoryFilters,
  type InventoryView,
  type SortKey,
} from '@/lib/inventoryQuery'
import { categoryLabels, conditionLabels, itemStatuses, statusLabels } from '@/lib/labels'
import { useInventoryStore } from '@/stores/inventory'
import type { InventoryItem, ItemStatus } from '@/types/inventory'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const store = useInventoryStore()
const {
  filters,
  items,
  loading,
  loadingMore,
  error,
  summary,
  visibleSets,
  setOptions,
  tagOptions,
  matchCounts,
  children,
  childrenLoading,
  strips,
  expanded,
  isSetsView,
  filtering,
  showOneOffs,
  showSets,
} = storeToRefs(store)
const isDesktop = useMediaQuery('(min-width: 1024px)')
const { request: requestPhotos } = useSignedUrls()

// ---------------------------------------------------------------- URL <-> filters
function update(patch: Partial<InventoryFilters>, replace = false) {
  const next: InventoryFilters = { ...filters.value, expand: null, ...patch }
  const location = { name: 'inventory', query: toInventoryQuery(next) }
  void (replace ? router.replace(location) : router.push(location))
}

const searchText = ref('')
/** Rows ticked in the desktop items table (cleared whenever the filters change). */
const selected = ref(new Set<string>())
watch(
  () => route.query,
  (query) => {
    if (route.name !== 'inventory') return
    filters.value = parseInventoryQuery(query)
    if (searchText.value.trim() !== filters.value.q) searchText.value = filters.value.q
    selected.value = new Set()
    void store.load()
  },
  { immediate: true },
)
watchDebounced(
  searchText,
  (text) => {
    if (text.trim() !== filters.value.q) update({ q: text.trim() }, true)
  },
  { debounce: 250 },
)

void store.loadSetOptions()
void store.loadTagOptions()

// ---------------------------------------------------------------- photos
watch(
  [items, visibleSets, () => [...children.value.values()].flat()],
  ([list, sets, kids]) => {
    void requestPhotos([
      ...list.map((i) => i.cover_path),
      ...sets.map((s) => s.cover_path),
      ...kids.map((i) => i.cover_path),
    ])
  },
  { deep: false },
)

// ---------------------------------------------------------------- infinite scroll
const sentinel = ref<HTMLElement | null>(null)
useIntersectionObserver(
  sentinel,
  ([entry]) => {
    if (entry?.isIntersecting) void store.loadMore()
  },
  { rootMargin: '400px' },
)

// ---------------------------------------------------------------- quick filters
const views: { value: InventoryView; label: string }[] = [
  { value: 'items', label: 'Items' },
  { value: 'sets', label: 'Sets' },
]
const quickStatuses: ItemStatus[] = ['in_stock', 'listed', 'sold', 'draft']
const filtersOpen = ref(false)
const exportOpen = ref(false)
const extraCount = computed(() => extraFilterCount(filters.value))

function toggleQuickStatus(status: ItemStatus) {
  const list = filters.value.status
  update({ status: list.includes(status) ? list.filter((s) => s !== status) : [...list, status] })
}

function clearFilters() {
  searchText.value = ''
  update({ ...defaultFilters, view: filters.value.view })
}

function sortBy(key: SortKey) {
  const dir = filters.value.sort === key && filters.value.dir === 'desc' ? 'asc' : 'desc'
  update({ sort: key, dir }, true)
}

// ---------------------------------------------------------------- empty states
const nothingShown = computed(
  () =>
    !loading.value &&
    items.value.length === 0 &&
    (!showSets.value || visibleSets.value.length === 0),
)
const inventoryEmpty = computed(
  () =>
    nothingShown.value && !filtering.value && filters.value.kind === 'all' && !filters.value.set,
)

// ---------------------------------------------------------------- actions
const actionItem = ref<InventoryItem | null>(null)
const actionsOpen = ref(false)
const sales = useSaleActions(() => store.load())
const { sellItem, sellOpen, bundleItems, bundleOpen } = sales
// Reload when a sale, lot split or expense changes the numbers.
watch(useDataVersion(), () => void store.load())

function sellSelected() {
  const rows = items.value.filter((i) => selected.value.has(i.id))
  sales.openBundle(rows)
}

const { run, confirmArchiveOpen, archiveTarget, archiving, confirmArchive } = useItemActions({
  sell: sales.openSell,
  setStatus: store.setStatus,
  setArchived: store.setArchived,
  afterUndo: store.load,
})

function openMenu(item: InventoryItem) {
  actionItem.value = item
  actionsOpen.value = true
}

// ---------------------------------------------------------------- bulk (desktop items table)
const bulkStatus = ref<ItemStatus | ''>('')

function toggleSelect(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

function toggleAll(select: boolean) {
  selected.value = select ? new Set(items.value.map((i) => i.id)) : new Set()
}

async function applyBulkStatus() {
  if (!bulkStatus.value) return
  const ids = [...selected.value]
  const result = await store.setStatus(ids, bulkStatus.value)
  if (result.ok) toast.success(`Updated ${ids.length} item${ids.length === 1 ? '' : 's'}.`)
  else toast.error(`Couldn't update the selected items. ${result.message ?? ''}`.trim())
  bulkStatus.value = ''
}

async function bulkArchive() {
  const ids = [...selected.value]
  const result = await store.setArchived(ids, true)
  if (!result.ok) {
    toast.error(`Couldn't archive the selected items. ${result.message ?? ''}`.trim())
    return
  }
  selected.value = new Set()
  toast.show(`Archived ${ids.length} item${ids.length === 1 ? '' : 's'}.`, {
    action: {
      label: 'Undo',
      onClick: async () => {
        await store.setArchived(ids, false)
        await store.load()
      },
    },
  })
}

const tagSheetOpen = ref(false)
const tagging = ref(false)

async function tagSelected(tags: string[]) {
  const ids = [...selected.value]
  tagging.value = true
  const result = await store.addTags(ids, tags)
  tagging.value = false
  if (!result.ok) {
    toast.error(`Couldn't tag the selected items. ${result.message ?? ''}`.trim())
    return
  }
  tagSheetOpen.value = false
  toast.success(`Tagged ${ids.length} item${ids.length === 1 ? '' : 's'}.`)
}

function exportSelected() {
  const rows = items.value.filter((i) => selected.value.has(i.id))
  const csv = toCsv(rows, [
    { header: 'SKU', value: (r) => r.sku },
    { header: 'Name', value: (r) => r.name },
    { header: 'Set', value: (r) => r.template_name },
    { header: 'Volume', value: (r) => r.volume_number },
    { header: 'Category', value: (r) => categoryLabels[r.category] },
    { header: 'Condition', value: (r) => (r.condition ? conditionLabels[r.condition] : '') },
    { header: 'Status', value: (r) => statusLabels[r.status] },
    { header: 'Quantity', value: (r) => r.quantity },
    { header: 'Units left', value: (r) => r.units_left },
    { header: 'Average cost', value: (r) => (r.cost_cents / 100).toFixed(2) },
    {
      header: 'Asking price',
      value: (r) => (r.list_price_cents === null ? '' : (r.list_price_cents / 100).toFixed(2)),
    },
    { header: 'ISBN', value: (r) => r.isbn },
    { header: 'Storage', value: (r) => r.storage_location },
    { header: 'Date entered', value: (r) => formatDate(r.created_at) },
  ])
  downloadCsv(`tillki-items-${todayIso()}.csv`, csv)
}
</script>

<template>
  <div class="mx-auto max-w-[1400px]">
    <!-- Controls: sticky under the top bar on mobile, at the top on desktop -->
    <div
      class="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 space-y-3 border-b border-line bg-bg/95 px-4 pt-1 pb-3 backdrop-blur lg:top-0 lg:mx-0 lg:border-0 lg:px-0"
    >
      <div class="flex items-center gap-2">
        <div class="grid grid-cols-2 rounded-xl bg-surface-2 p-1" role="group" aria-label="View">
          <button
            v-for="v in views"
            :key="v.value"
            type="button"
            class="min-h-10 rounded-lg px-4 text-sm font-semibold"
            :class="filters.view === v.value ? 'bg-surface text-ink shadow-sm' : 'text-muted'"
            :aria-pressed="filters.view === v.value"
            @click="update({ view: v.value })"
          >
            {{ v.label }}
          </button>
        </div>

        <label class="relative min-w-0 flex-1">
          <span class="sr-only">Search inventory</span>
          <Search
            class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            v-model="searchText"
            type="search"
            placeholder="Search name, set, SKU, ISBN"
            class="min-h-11 w-full rounded-xl border-2 border-line bg-surface pr-3 pl-9 text-base outline-none focus:border-primary"
            enterkeyhint="search"
          />
        </label>

        <button
          type="button"
          class="relative grid size-11 shrink-0 place-items-center rounded-xl border-2 border-line bg-surface lg:w-auto lg:gap-2 lg:px-3 lg:[grid-auto-flow:column]"
          aria-label="Filters and sort"
          @click="filtersOpen = true"
        >
          <SlidersHorizontal class="size-5" aria-hidden="true" />
          <span class="hidden text-sm font-semibold lg:inline">Filters</span>
          <span
            v-if="extraCount"
            class="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-accent text-xs font-bold text-white"
            :aria-label="`${extraCount} filters on`"
            >{{ extraCount }}</span
          >
        </button>
        <button
          type="button"
          class="hidden min-h-11 shrink-0 items-center gap-2 rounded-xl border-2 border-line bg-surface px-3 text-sm font-semibold lg:flex"
          aria-haspopup="dialog"
          @click="exportOpen = true"
        >
          <Download class="size-5" aria-hidden="true" /> Export
        </button>
      </div>

      <div
        class="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:px-0"
        role="group"
        aria-label="Status"
      >
        <BaseChip :selected="filters.status.length === 0" @toggle="update({ status: [] })"
          >All</BaseChip
        >
        <BaseChip
          v-for="s in quickStatuses"
          :key="s"
          :selected="filters.status.includes(s)"
          @toggle="toggleQuickStatus(s)"
          >{{ statusLabels[s] }}</BaseChip
        >
        <BaseChip
          v-for="s in filters.status.filter((x) => !quickStatuses.includes(x))"
          :key="s"
          selected
          @toggle="toggleQuickStatus(s)"
          >{{ statusLabels[s] }}</BaseChip
        >
        <BaseChip
          v-if="filters.age"
          selected
          :aria-label="`In stock ${ageLabel(filters.age)}. Remove this filter`"
          @toggle="update({ age: null })"
          >{{ ageLabel(filters.age) }} <X class="size-4" aria-hidden="true"
        /></BaseChip>
        <BaseChip
          v-if="filters.tag"
          selected
          :aria-label="`Tagged ${filters.tag}. Remove this filter`"
          @toggle="update({ tag: null })"
          ><Tag class="size-4" aria-hidden="true" /> {{ filters.tag }}
          <X class="size-4" aria-hidden="true"
        /></BaseChip>
      </div>
    </div>

    <InventorySummaryStrip :summary="summary" :loading="loading" class="mt-3" />

    <p
      v-if="error"
      class="mt-4 rounded-xl border border-danger/40 bg-danger/10 p-3 text-danger"
      role="alert"
    >
      Couldn't load inventory: {{ error }}
      <button type="button" class="ml-2 font-semibold underline" @click="store.load()">
        Try again
      </button>
    </p>

    <!-- First load -->
    <div
      v-if="loading && items.length === 0 && visibleSets.length === 0"
      class="mt-2 divide-y divide-line"
      aria-busy="true"
    >
      <SkeletonRow v-for="n in 8" :key="n" />
      <span class="sr-only" role="status">Loading inventory</span>
    </div>

    <!-- Nothing in inventory at all -->
    <div v-else-if="inventoryEmpty" class="flex flex-col items-center px-6 py-16 text-center">
      <div class="mb-4 grid size-16 place-items-center rounded-2xl bg-surface-2 text-ink-2">
        <PackageSearch class="size-8" aria-hidden="true" />
      </div>
      <h2 class="text-lg font-bold">Your inventory is empty</h2>
      <p class="mt-1 max-w-sm text-ink-2">
        Add a single item, or set up a series like One Piece and add its volumes.
      </p>
      <div class="mt-6 flex flex-wrap justify-center gap-2">
        <RouterLink
          :to="{ name: 'item-new' }"
          class="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 font-semibold text-primary-ink"
        >
          <PackagePlus class="size-5" aria-hidden="true" /> Add a one-off
        </RouterLink>
        <RouterLink
          :to="{ name: 'template-new' }"
          class="inline-flex min-h-11 items-center gap-2 rounded-lg border-2 border-ink/80 px-4 font-semibold"
        >
          <BookPlus class="size-5" aria-hidden="true" /> Add a set
        </RouterLink>
      </div>
    </div>

    <!-- Filters matched nothing -->
    <div v-else-if="nothingShown" class="flex flex-col items-center px-6 py-16 text-center">
      <div class="mb-4 grid size-16 place-items-center rounded-2xl bg-surface-2 text-ink-2">
        <Search class="size-8" aria-hidden="true" />
      </div>
      <h2 class="text-lg font-bold">No matches</h2>
      <p class="mt-1 text-ink-2">Nothing matches these filters.</p>
      <BaseButton class="mt-6" variant="secondary" @click="clearFilters">
        <X class="size-4" aria-hidden="true" /> Clear filters
      </BaseButton>
    </div>

    <template v-else>
      <!-- ============================== Sets view: groups -->
      <section
        v-if="isSetsView && showSets && visibleSets.length"
        class="mt-4"
        aria-labelledby="sets-heading"
      >
        <div class="mb-2 flex items-center justify-between gap-2">
          <h2 id="sets-heading" class="text-lg font-bold">
            Sets <span class="font-normal text-muted">({{ visibleSets.length }})</span>
          </h2>
          <div v-if="isDesktop" class="flex gap-2">
            <BaseButton size="sm" variant="ghost" @click="store.expandAll()">Expand all</BaseButton>
            <BaseButton size="sm" variant="ghost" @click="store.collapseAll()"
              >Collapse all</BaseButton
            >
          </div>
        </div>
        <SetsTable
          v-if="isDesktop"
          :sets="visibleSets"
          :expanded="expanded"
          :volumes="children"
          :loading-volumes="childrenLoading"
          :strips="strips"
          :match-counts="matchCounts"
          :filtering="filtering"
          :highlight-matches="!!filters.q.trim()"
          @toggle="store.toggleExpanded($event)"
          @menu="openMenu"
        />
        <div v-else class="space-y-3">
          <SetGroupCard
            v-for="set in visibleSets"
            :key="set.id"
            :set="set"
            :expanded="expanded.has(set.id)"
            :volumes="children.get(set.id)"
            :loading-volumes="childrenLoading.has(set.id)"
            :strip="strips.get(set.id)"
            :match="matchCounts.get(set.id)"
            :filtering="filtering"
            :highlight-matches="!!filters.q.trim()"
            @toggle="store.toggleExpanded($event)"
            @menu="openMenu"
          />
        </div>
      </section>

      <!-- ============================== Item list (all items, or one-offs in Sets view) -->
      <section
        v-if="showOneOffs && items.length"
        class="mt-4"
        :aria-label="isSetsView ? 'One-offs' : 'Items'"
      >
        <h2 v-if="isSetsView" class="mb-2 text-lg font-bold">One-offs</h2>

        <template v-if="isDesktop">
          <div
            v-if="selected.size && !isSetsView"
            class="sticky top-[7.5rem] z-10 mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-2 shadow-sm"
            role="region"
            aria-label="Bulk actions"
          >
            <span class="px-2 text-sm font-semibold">{{ selected.size }} selected</span>
            <label class="flex items-center gap-2 text-sm">
              <span class="sr-only">Change status to</span>
              <select
                v-model="bulkStatus"
                class="min-h-9 rounded-lg border-2 border-line bg-surface px-2"
                @change="applyBulkStatus"
              >
                <option value="" disabled>Change status…</option>
                <option v-for="s in itemStatuses" :key="s" :value="s">{{ statusLabels[s] }}</option>
              </select>
            </label>
            <BaseButton size="sm" variant="ghost" @click="bulkArchive">
              <Archive class="size-4" aria-hidden="true" /> Archive
            </BaseButton>
            <BaseButton size="sm" variant="ghost" @click="tagSheetOpen = true">
              <Tag class="size-4" aria-hidden="true" /> Add tag
            </BaseButton>
            <BaseButton size="sm" variant="ghost" @click="sellSelected">
              Sell as bundle
            </BaseButton>
            <BaseButton size="sm" variant="ghost" @click="exportSelected">
              <Download class="size-4" aria-hidden="true" /> Export CSV
            </BaseButton>
            <BaseButton size="sm" variant="ghost" class="ml-auto" @click="selected = new Set()"
              >Clear</BaseButton
            >
          </div>
          <ItemsTable
            :rows="items"
            :sort="filters.sort"
            :dir="filters.dir"
            :selected="selected"
            :selectable="!isSetsView"
            :caption="isSetsView ? 'One-off items' : 'Inventory items'"
            @sort="sortBy"
            @toggle="toggleSelect"
            @toggle-all="toggleAll"
            @menu="openMenu"
          />
        </template>
        <ul v-else class="divide-y divide-line">
          <li v-for="item in items" :key="item.id">
            <ItemCardRow :item="item" @menu="openMenu" />
          </li>
        </ul>

        <div ref="sentinel" class="h-px" aria-hidden="true" />
        <div v-if="loadingMore" class="flex justify-center py-4" role="status">
          <LoaderCircle class="size-5 animate-spin text-muted" aria-label="Loading more" />
        </div>
      </section>
    </template>

    <ItemActionsSheet v-model:open="actionsOpen" :item="actionItem" @action="run" />
    <MarkSoldSheet v-model:open="sellOpen" :item="sellItem" @sold="sales.onSold" />
    <BundleSaleSheet
      v-model:open="bundleOpen"
      :items="bundleItems"
      @sold="
        (id, count) => {
          selected = new Set()
          sales.onBundleSold(id, count)
        }
      "
    />
    <AddTagsSheet
      v-model:open="tagSheetOpen"
      :count="selected.size"
      :suggestions="tagOptions"
      :saving="tagging"
      @save="tagSelected"
    />
    <ExportStockSheet v-model:open="exportOpen" :filters="filters" />
    <Teleport to="#topbar-actions" defer>
      <button
        type="button"
        class="grid size-11 place-items-center rounded-full lg:hidden"
        aria-label="Export stock"
        aria-haspopup="dialog"
        @click="exportOpen = true"
      >
        <Download class="size-5" aria-hidden="true" />
      </button>
    </Teleport>
    <InventoryFiltersSheet
      v-model:open="filtersOpen"
      :filters="filters"
      :set-options="setOptions"
      :tag-options="tagOptions"
      @apply="update($event)"
    />
    <ConfirmDialog
      v-model:open="confirmArchiveOpen"
      :title="`Archive ${archiveTarget?.name ?? 'item'}?`"
      message="It disappears from the inventory but keeps its history and sales. You can bring it back with the archived filter."
      confirm-label="Archive"
      danger
      :loading="archiving"
      @confirm="confirmArchive"
    />
  </div>
</template>
