<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useClipboard, useMediaQuery } from '@vueuse/core'
import {
  Archive,
  ArchiveRestore,
  BookPlus,
  ClipboardCopy,
  LibraryBig,
  Pencil,
  Trash2,
} from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ItemActionsSheet from '@/components/inventory/ItemActionsSheet.vue'
import ItemCardRow from '@/components/inventory/ItemCardRow.vue'
import ItemGallery from '@/components/inventory/ItemGallery.vue'
import ItemsTable from '@/components/inventory/ItemsTable.vue'
import SetProgress from '@/components/templates/SetProgress.vue'
import VolumeStrip from '@/components/templates/VolumeStrip.vue'
import MarkSoldSheet from '@/components/sales/MarkSoldSheet.vue'
import BundleSaleSheet from '@/components/sales/BundleSaleSheet.vue'
import { useItemActions } from '@/composables/useItemActions'
import { useSaleActions } from '@/composables/useSaleActions'
import { useSignedUrls } from '@/composables/useSignedUrls'
import { useToast } from '@/composables/useToast'
import {
  archiveItems,
  countSetItems,
  deleteSet,
  getSet,
  getSetVolumes,
  setArchived,
  setItemsPrice,
  setItemsStatus,
  type SetDetail,
} from '@/composables/useSets'
import { itemStatuses, statusLabels } from '@/lib/labels'
import { formatCents, formatSignedCents, parseMoneyToCents } from '@/lib/money'
import { shoppingListLine } from '@/lib/sets'
import { useInventoryStore } from '@/stores/inventory'
import type { InventoryItem, ItemStatus } from '@/types/inventory'

const props = defineProps<{ id: string }>()
const router = useRouter()
const toast = useToast()
const inventory = useInventoryStore()
const isDesktop = useMediaQuery('(min-width: 1024px)')
const { request: requestPhotos } = useSignedUrls()
const { copy, isSupported: canCopy } = useClipboard({ legacy: true })

const set = ref<SetDetail | null>(null)
const photoPaths = ref<string[]>([])
const volumes = ref<InventoryItem[]>([])
const loading = ref(true)
const notFound = ref(false)

async function load() {
  try {
    const [loaded, rows] = await Promise.all([getSet(props.id), getSetVolumes(props.id)])
    if (!loaded) {
      notFound.value = true
      return
    }
    set.value = loaded.set
    photoPaths.value = loaded.photoPaths
    volumes.value = rows
    void requestPhotos(rows.map((r) => r.cover_path))
    void inventory.ensureStrip(props.id, loaded.set.total_volumes, true)
  } catch {
    toast.error("Couldn't load this set.")
  } finally {
    loading.value = false
  }
}
watch(() => props.id, load, { immediate: true })

const images = computed(() => photoPaths.value.map((path) => ({ path, fromSet: false })))
const strip = computed(() => inventory.strips.get(props.id))

// ---------------------------------------------------------------- shopping list
async function copyShoppingList() {
  if (!set.value) return
  const line = shoppingListLine({ ...set.value, language: set.value.language })
  if (!line) {
    toast.show('Nothing missing from this set.')
    return
  }
  await copy(line)
  toast.success('Shopping list copied.')
}

// ---------------------------------------------------------------- selection and bulk actions
const selected = ref(new Set<string>())
const bulkStatus = ref<ItemStatus | ''>('')
const bulkPrice = ref('')

function toggle(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

async function run(task: () => Promise<void>, success: string) {
  try {
    await task()
    toast.success(success)
    selected.value = new Set()
    await load()
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Something went wrong.')
  }
}

function applyStatus() {
  if (!bulkStatus.value) return
  const status = bulkStatus.value
  bulkStatus.value = ''
  void run(
    () => setItemsStatus([...selected.value], status),
    `Marked ${statusLabels[status].toLowerCase()}.`,
  )
}

function applyPrice() {
  const cents = parseMoneyToCents(bulkPrice.value)
  if (cents === null) {
    toast.error('Enter a price like 8 or 8.50.')
    return
  }
  bulkPrice.value = ''
  void run(
    () => setItemsPrice([...selected.value], cents),
    `Asking price set to ${formatCents(cents)}.`,
  )
}

function archiveSelected() {
  const ids = [...selected.value]
  void run(
    () => archiveItems(ids, true),
    `Archived ${ids.length} volume${ids.length === 1 ? '' : 's'}.`,
  )
}

// ---------------------------------------------------------------- per-volume menu
const menuItem = ref<InventoryItem | null>(null)
const menuOpen = ref(false)
const sales = useSaleActions(() => load())
const { sellItem, sellOpen, bundleItems, bundleOpen } = sales

function sellSelected() {
  sales.openBundle(volumes.value.filter((v) => selected.value.has(v.id)))
}

const actions = useItemActions({
  sell: sales.openSell,
  setStatus: async (ids, status) => {
    try {
      await setItemsStatus(ids, status)
      await load()
      return { ok: true }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : undefined }
    }
  },
  setArchived: async (ids, archived) => {
    try {
      await archiveItems(ids, archived)
      await load()
      return { ok: true }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : undefined }
    }
  },
  afterUndo: load,
})

function openMenu(item: InventoryItem) {
  menuItem.value = item
  menuOpen.value = true
}

// ---------------------------------------------------------------- archive / delete the set
const archiveOpen = ref(false)
const deleteOpen = ref(false)
const busy = ref(false)
const canDelete = ref(false)
watch(volumes, async () => {
  canDelete.value = volumes.value.length === 0 && (await countSetItems(props.id)) === 0
})

async function toggleArchiveSet() {
  if (!set.value) return
  busy.value = true
  const archiving = !set.value.archived_at
  try {
    await setArchived(props.id, archiving)
    archiveOpen.value = false
    toast.success(archiving ? 'Set archived. Its volumes stay in inventory.' : 'Set restored.')
    await load()
  } catch {
    toast.error("Couldn't change the set.")
  } finally {
    busy.value = false
  }
}

async function removeSet() {
  busy.value = true
  try {
    await deleteSet(props.id, photoPaths.value)
    toast.success('Set deleted.')
    await router.replace({ name: 'templates' })
  } catch {
    toast.error("Couldn't delete the set. It may have items now.")
  } finally {
    busy.value = false
    deleteOpen.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <div
      v-if="loading && !set"
      class="grid animate-pulse gap-6 lg:grid-cols-[20rem_1fr]"
      aria-busy="true"
    >
      <div class="aspect-square rounded-2xl bg-surface-2" />
      <div class="space-y-3">
        <div class="h-8 w-1/2 rounded bg-surface-2" />
        <div class="h-24 rounded bg-surface-2" />
      </div>
    </div>

    <EmptyState
      v-else-if="notFound || !set"
      :icon="LibraryBig"
      title="Set not found"
      action-label="All sets"
      :to="{ name: 'templates' }"
    />

    <div v-else class="space-y-6">
      <p
        v-if="set.archived_at"
        class="flex items-center gap-2 rounded-xl border border-line bg-surface-2 p-3 text-sm"
        role="status"
      >
        <Archive class="size-4" aria-hidden="true" /> This set is archived. Its volumes are still in
        inventory.
      </p>

      <div class="grid gap-6 lg:grid-cols-[20rem_1fr] lg:items-start">
        <ItemGallery :images="images" :alt="set.name" />

        <div class="space-y-4">
          <header>
            <h2 class="text-3xl leading-tight font-black">{{ set.name }}</h2>
            <p v-if="set.publisher || set.language" class="text-ink-2">
              {{ [set.publisher, set.language].filter(Boolean).join(' · ') }}
              <span v-if="set.is_ongoing"> · ongoing</span>
            </p>
          </header>
          <SetProgress :set="set" />
          <p v-if="set.missing_ranges" class="text-ink-2">
            Missing <span class="font-semibold text-ink">{{ set.missing_ranges }}</span>
          </p>
          <p v-else-if="set.total_volumes" class="font-semibold text-success">Complete run</p>

          <dl
            class="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3"
          >
            <div class="bg-surface px-3 py-2">
              <dt class="text-xs text-ink-2">In stock</dt>
              <dd class="font-bold tabular-nums">
                {{ set.units_in_stock }}
                <span v-if="set.extra_copies" class="text-xs font-normal text-ink-2">
                  ({{ set.extra_copies }} extra cop{{ set.extra_copies === 1 ? 'y' : 'ies' }})
                </span>
              </dd>
            </div>
            <div class="bg-surface px-3 py-2">
              <dt class="text-xs text-ink-2">Cost basis</dt>
              <dd class="font-bold tabular-nums">{{ formatCents(set.cost_basis_cents) }}</dd>
            </div>
            <div class="bg-surface px-3 py-2">
              <dt class="text-xs text-ink-2">Asking value</dt>
              <dd class="font-bold tabular-nums">{{ formatCents(set.list_value_cents) }}</dd>
            </div>
            <div class="bg-surface px-3 py-2">
              <dt class="text-xs text-ink-2">Est. profit</dt>
              <dd
                class="font-bold tabular-nums"
                :class="set.est_profit_cents >= 0 ? 'text-success' : 'text-danger'"
              >
                {{ formatSignedCents(set.est_profit_cents) }}
              </dd>
            </div>
            <div class="bg-surface px-3 py-2">
              <dt class="text-xs text-ink-2">Volumes sold</dt>
              <dd class="font-bold tabular-nums">{{ set.volumes_sold }}</dd>
            </div>
          </dl>

          <div class="flex flex-wrap gap-2">
            <RouterLink
              :to="{ name: 'template-add-volumes', params: { id: set.id } }"
              class="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 font-semibold text-primary-ink"
            >
              <BookPlus class="size-5" aria-hidden="true" /> Add volumes
            </RouterLink>
            <RouterLink
              :to="{ name: 'template-edit', params: { id: set.id } }"
              class="inline-flex min-h-11 items-center gap-2 rounded-lg border-2 border-line px-4 font-semibold"
            >
              <Pencil class="size-4" aria-hidden="true" /> Edit set
            </RouterLink>
            <BaseButton v-if="canCopy" variant="secondary" @click="copyShoppingList">
              <ClipboardCopy class="size-4" aria-hidden="true" /> Copy shopping list
            </BaseButton>
          </div>
        </div>
      </div>

      <section
        v-if="strip"
        class="rounded-2xl border border-line bg-surface p-4"
        aria-labelledby="strip-heading"
      >
        <h3 id="strip-heading" class="mb-3 font-bold">Volumes</h3>
        <VolumeStrip :rows="strip" :template-id="set.id" />
      </section>

      <p v-if="set.description" class="whitespace-pre-line text-ink-2">{{ set.description }}</p>

      <section aria-labelledby="rows-heading">
        <div class="mb-2 flex items-center justify-between">
          <h3 id="rows-heading" class="text-lg font-bold">
            Volumes you have <span class="font-normal text-muted">({{ volumes.length }})</span>
          </h3>
        </div>

        <div
          v-if="selected.size"
          class="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-2 shadow-sm lg:top-2"
          role="region"
          aria-label="Bulk actions"
        >
          <span class="px-1 text-sm font-semibold">{{ selected.size }} selected</span>
          <label class="text-sm">
            <span class="sr-only">Change status to</span>
            <select
              v-model="bulkStatus"
              class="min-h-10 rounded-lg border-2 border-line bg-surface px-2"
              @change="applyStatus"
            >
              <option value="" disabled>Change status…</option>
              <option v-for="s in itemStatuses" :key="s" :value="s">{{ statusLabels[s] }}</option>
            </select>
          </label>
          <form class="flex items-center gap-1" @submit.prevent="applyPrice">
            <label class="sr-only" for="bulk-price">Set asking price</label>
            <input
              id="bulk-price"
              v-model="bulkPrice"
              inputmode="decimal"
              placeholder="$ price"
              class="min-h-10 w-24 rounded-lg border-2 border-line bg-surface px-2 text-base"
            />
            <BaseButton type="submit" size="sm" variant="secondary">Set price</BaseButton>
          </form>
          <BaseButton size="sm" variant="ghost" @click="sellSelected">Sell as bundle</BaseButton>
          <BaseButton size="sm" variant="ghost" @click="archiveSelected"
            ><Archive class="size-4" aria-hidden="true" /> Archive</BaseButton
          >
          <BaseButton size="sm" variant="ghost" class="ml-auto" @click="selected = new Set()"
            >Clear</BaseButton
          >
        </div>

        <p
          v-if="volumes.length === 0"
          class="rounded-2xl border border-dashed border-line p-6 text-center text-ink-2"
        >
          No volumes yet.
          <RouterLink
            :to="{ name: 'template-add-volumes', params: { id: set.id } }"
            class="font-semibold text-primary underline"
            >Add the ones you have</RouterLink
          >.
        </p>
        <ItemsTable
          v-else-if="isDesktop"
          :rows="volumes"
          sort="template_name"
          dir="asc"
          :selected="selected"
          caption="Volumes in this set"
          @toggle="toggle"
          @toggle-all="(all) => (selected = all ? new Set(volumes.map((v) => v.id)) : new Set())"
          @menu="openMenu"
        />
        <ul v-else class="divide-y divide-line">
          <li v-for="v in volumes" :key="v.id" class="flex items-center gap-2">
            <input
              type="checkbox"
              class="size-5 shrink-0"
              :checked="selected.has(v.id)"
              :aria-label="`Select ${v.name}`"
              @change="toggle(v.id)"
            />
            <ItemCardRow class="min-w-0 flex-1" :item="v" :show-set-chip="false" @menu="openMenu" />
          </li>
        </ul>
      </section>

      <section class="flex flex-wrap gap-2 border-t border-line pt-4">
        <BaseButton
          variant="ghost"
          @click="set.archived_at ? toggleArchiveSet() : (archiveOpen = true)"
        >
          <ArchiveRestore v-if="set.archived_at" class="size-4" aria-hidden="true" />
          <Archive v-else class="size-4" aria-hidden="true" />
          {{ set.archived_at ? 'Restore set' : 'Archive set' }}
        </BaseButton>
        <BaseButton v-if="canDelete" variant="ghost" class="text-danger" @click="deleteOpen = true">
          <Trash2 class="size-4" aria-hidden="true" /> Delete set
        </BaseButton>
      </section>
    </div>

    <ItemActionsSheet v-model:open="menuOpen" :item="menuItem" @action="actions.run" />
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
    <ConfirmDialog
      v-model:open="actions.confirmArchiveOpen.value"
      :title="`Archive ${actions.archiveTarget.value?.name ?? 'volume'}?`"
      message="It disappears from the inventory but keeps its history and sales."
      confirm-label="Archive"
      danger
      :loading="actions.archiving.value"
      @confirm="actions.confirmArchive"
    />
    <ConfirmDialog
      v-model:open="archiveOpen"
      :title="`Archive ${set?.name ?? 'set'}?`"
      message="The set disappears from the Sets list. Its volumes stay in inventory with their history."
      confirm-label="Archive set"
      :loading="busy"
      @confirm="toggleArchiveSet"
    />
    <ConfirmDialog
      v-model:open="deleteOpen"
      :title="`Delete ${set?.name ?? 'set'}?`"
      message="This set has no items, so it can be deleted for good, along with its photos."
      confirm-label="Delete"
      danger
      :loading="busy"
      @confirm="removeSet"
    />
  </div>
</template>
