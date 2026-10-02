<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { useRouter } from 'vue-router'
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ChevronDown,
  Copy,
  EllipsisVertical,
  PackageCheck,
  PackagePlus,
  PackageX,
  Pencil,
  Tag,
} from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import AddCopiesSheet from '@/components/inventory/AddCopiesSheet.vue'
import ItemActionsSheet from '@/components/inventory/ItemActionsSheet.vue'
import ItemGallery from '@/components/inventory/ItemGallery.vue'
import StatusChip from '@/components/inventory/StatusChip.vue'
import VolumeStrip from '@/components/templates/VolumeStrip.vue'
import { useItemActions } from '@/composables/useItemActions'
import { useItemDetail, type AddCopiesInput, type ItemEvent } from '@/composables/useItemDetail'
import { useToast } from '@/composables/useToast'
import { formatDate, formatDateTime } from '@/lib/dates'
import { categoryLabels, conditionLabels, platformLabels, statusLabels } from '@/lib/labels'
import { formatCents, formatSignedCents } from '@/lib/money'
import { useInventoryStore } from '@/stores/inventory'
import type { Json } from '@/types/database'
import type { ItemStatus } from '@/types/inventory'

const props = defineProps<{ id: string }>()

const router = useRouter()
const toast = useToast()
const inventory = useInventoryStore()
const detail = useItemDetail(toRef(props, 'id'))
const { item, images, events, sales, acquisitions, addedBy, lots, loading, notFound, error } =
  detail

const { run, confirmArchiveOpen, archiving, confirmArchive } = useItemActions({
  setStatus: detail.setStatus,
  setArchived: detail.setArchived,
  afterUndo: detail.load,
})
const menuOpen = ref(false)

function back() {
  if (window.history.state?.back) router.back()
  else void router.push({ name: 'inventory' })
}

// ---------------------------------------------------------------- set strip
const stripOpen = ref(false)
const strip = computed(() =>
  item.value?.template_id ? inventory.strips.get(item.value.template_id) : undefined,
)
async function toggleStrip() {
  stripOpen.value = !stripOpen.value
  if (stripOpen.value && item.value?.template_id) {
    await inventory.ensureStrip(item.value.template_id, item.value.total_volumes, true)
  }
}

// ---------------------------------------------------------------- copies
const addCopiesOpen = ref(false)
const savingCopies = ref(false)
async function submitCopies(input: AddCopiesInput) {
  savingCopies.value = true
  const result = await detail.addCopies(input)
  savingCopies.value = false
  if (result.ok) {
    addCopiesOpen.value = false
    toast.success(`Added ${input.quantity} cop${input.quantity === 1 ? 'y' : 'ies'}.`)
  } else {
    toast.error(`Couldn't add copies. ${result.message ?? ''}`.trim())
  }
}

// ---------------------------------------------------------------- history
function field(value: Json | null, key: string): Json | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value[key] : undefined
}
const asNumber = (v: Json | undefined) => (typeof v === 'number' ? v : null)
const asString = (v: Json | undefined) => (typeof v === 'string' ? v : null)
const lotNames = computed(() => new Map(lots.value.map((l) => [l.id, l.name])))

function money(v: Json | undefined) {
  const n = asNumber(v)
  return n === null ? 'none' : formatCents(n)
}

function describeEvent(e: ItemEvent): string {
  switch (e.type) {
    case 'created':
      return 'Added to inventory'
    case 'status_changed': {
      const from = asString(field(e.oldValue, 'status')) as ItemStatus | null
      const to = asString(field(e.newValue, 'status')) as ItemStatus | null
      return `Status: ${from ? statusLabels[from] : '?'} → ${to ? statusLabels[to] : '?'}`
    }
    case 'price_changed':
      return `Asking price: ${money(field(e.oldValue, 'list_price_cents'))} → ${money(field(e.newValue, 'list_price_cents'))}`
    case 'cost_changed':
      return `Average cost: ${money(field(e.oldValue, 'cost_cents'))} → ${money(field(e.newValue, 'cost_cents'))}`
    case 'copies_added': {
      const added = asNumber(field(e.newValue, 'added')) ?? 0
      const each = asNumber(field(e.newValue, 'unit_cost_cents'))
      const lot = lotNames.value.get(asString(field(e.newValue, 'lot_id')) ?? '')
      return `+${added} cop${added === 1 ? 'y' : 'ies'}${each === null ? '' : ` at ${formatCents(each)} each`}${lot ? ` (${lot})` : ''}`
    }
  }
}

const timeline = computed(() =>
  [
    ...events.value.map((e) => ({
      key: `e-${e.id}`,
      at: e.at,
      text: describeEvent(e),
      profit: null as number | null,
    })),
    ...sales.value.map((s) => ({
      key: `s-${s.id}`,
      at: s.soldAt,
      text: `Sold ${s.quantity} on ${platformLabels[s.platform]} for ${formatCents(s.salePriceCents)}${s.bundleId ? ' (bundle)' : ''}`,
      profit: s.netProfitCents,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at)),
)

const unitsBought = computed(() => acquisitions.value.reduce((sum, a) => sum + a.quantity, 0))
const sources = computed(() =>
  [...new Set(acquisitions.value.map((a) => a.source).filter(Boolean))].join(', '),
)
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <button
      type="button"
      class="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-semibold text-ink-2 hover:text-ink"
      @click="back"
    >
      <ArrowLeft class="size-5" aria-hidden="true" /> Inventory
    </button>

    <div v-if="loading && !item" class="grid animate-pulse gap-6 lg:grid-cols-2" aria-busy="true">
      <div class="aspect-square rounded-2xl bg-surface-2" />
      <div class="space-y-3">
        <div class="h-8 w-3/4 rounded bg-surface-2" />
        <div class="h-5 w-1/2 rounded bg-surface-2" />
        <div class="h-24 rounded bg-surface-2" />
      </div>
      <span class="sr-only" role="status">Loading item</span>
    </div>

    <EmptyState
      v-else-if="notFound"
      :icon="PackageX"
      title="Item not found"
      message="It may have been deleted, or the link is wrong."
      action-label="Back to inventory"
      :to="{ name: 'inventory' }"
    />

    <p
      v-else-if="error && !item"
      class="rounded-xl border border-danger/40 bg-danger/10 p-3 text-danger"
      role="alert"
    >
      Couldn't load this item: {{ error }}
      <button type="button" class="ml-2 font-semibold underline" @click="detail.load()">
        Try again
      </button>
    </p>

    <article
      v-else-if="item"
      class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start"
    >
      <div class="lg:sticky lg:top-8">
        <ItemGallery :images="images" :alt="item.name" />
      </div>

      <div class="min-w-0 space-y-6">
        <p
          v-if="item.archived_at"
          class="flex items-center gap-2 rounded-xl border border-line bg-surface-2 p-3 text-sm"
          role="status"
        >
          <Archive class="size-4 shrink-0" aria-hidden="true" />
          Archived {{ formatDate(item.archived_at) }}. It's hidden from the inventory.
        </p>

        <header>
          <p v-if="item.template_id" class="mb-1 text-sm text-ink-2">
            Volume {{ item.volume_number }} of
            <RouterLink
              :to="{ name: 'template-detail', params: { id: item.template_id } }"
              class="font-semibold text-ink underline underline-offset-2"
              >{{ item.template_name }}</RouterLink
            >
          </p>
          <h2 class="text-2xl leading-tight font-black lg:text-3xl">{{ item.name }}</h2>
          <div class="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <StatusChip :status="item.status" />
            <span class="font-mono text-xs text-ink-2">{{ item.sku }}</span>
            <span
              v-if="item.units_left > 1"
              class="rounded-full bg-ink px-2 text-xs leading-5 font-bold text-bg"
            >
              ×{{ item.units_left }} left
            </span>
          </div>
        </header>

        <div class="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <p class="text-xs text-ink-2">Asking price</p>
            <p class="text-3xl font-black tabular-nums">
              {{ item.list_price_cents === null ? '—' : formatCents(item.list_price_cents) }}
            </p>
          </div>
          <div>
            <p class="text-xs text-ink-2">Average cost</p>
            <p class="text-lg font-semibold tabular-nums">{{ formatCents(item.cost_cents) }}</p>
          </div>
          <div v-if="item.est_profit_cents !== null">
            <p class="text-xs text-ink-2">Est. profit each</p>
            <p
              class="text-lg font-semibold tabular-nums"
              :class="item.est_profit_cents >= 0 ? 'text-success' : 'text-danger'"
            >
              {{ formatSignedCents(item.est_profit_cents) }}
            </p>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex flex-wrap gap-2">
          <BaseButton variant="secondary" @click="run('edit', item)">
            <Pencil class="size-4" aria-hidden="true" /> Edit
          </BaseButton>
          <BaseButton
            v-if="item.status !== 'listed' && item.units_left > 0"
            variant="secondary"
            @click="run('list', item)"
          >
            <Tag class="size-4" aria-hidden="true" /> Mark listed
          </BaseButton>
          <BaseButton v-if="item.units_left > 0" @click="run('sell', item)">
            <PackageCheck class="size-4" aria-hidden="true" /> Mark sold
          </BaseButton>
          <BaseButton
            v-if="item.kind === 'one_off'"
            variant="ghost"
            class="hidden sm:inline-flex"
            @click="run('duplicate', item)"
          >
            <Copy class="size-4" aria-hidden="true" /> Duplicate
          </BaseButton>
          <BaseButton
            v-if="item.archived_at"
            variant="ghost"
            class="hidden sm:inline-flex"
            @click="run('unarchive', item)"
          >
            <ArchiveRestore class="size-4" aria-hidden="true" /> Unarchive
          </BaseButton>
          <BaseButton
            v-else
            variant="ghost"
            class="hidden text-danger sm:inline-flex"
            @click="run('archive', item)"
          >
            <Archive class="size-4" aria-hidden="true" /> Archive
          </BaseButton>
          <button
            type="button"
            class="grid size-11 place-items-center rounded-lg border-2 border-line sm:hidden"
            aria-label="More actions"
            @click="menuOpen = true"
          >
            <EllipsisVertical class="size-5" aria-hidden="true" />
          </button>
        </div>

        <!-- Set strip -->
        <section v-if="item.template_id" class="rounded-2xl border border-line bg-surface">
          <button
            type="button"
            class="flex min-h-12 w-full items-center justify-between gap-2 px-4 text-left font-semibold"
            :aria-expanded="stripOpen"
            @click="toggleStrip"
          >
            All volumes of {{ item.template_name }}
            <ChevronDown
              class="size-5 transition-transform"
              :class="{ 'rotate-180': stripOpen }"
              aria-hidden="true"
            />
          </button>
          <div v-if="stripOpen" class="border-t border-line p-4">
            <VolumeStrip v-if="strip" :rows="strip" :template-id="item.template_id" />
            <p v-else class="text-sm text-ink-2" role="status">Loading volumes…</p>
          </div>
        </section>

        <!-- Description -->
        <section v-if="item.effective_description">
          <h3 class="mb-1 font-bold">Description</h3>
          <p class="whitespace-pre-line text-ink-2">{{ item.effective_description }}</p>
          <p v-if="item.template_id && !item.description" class="mt-1 text-xs text-muted">
            From the set
          </p>
        </section>

        <!-- Fields -->
        <div class="grid gap-4 sm:grid-cols-2">
          <section class="rounded-2xl border border-line bg-surface p-4">
            <h3 class="mb-2 font-bold">Basics</h3>
            <dl class="space-y-1.5 text-sm">
              <div class="flex justify-between gap-3">
                <dt class="text-ink-2">Category</dt>
                <dd>{{ categoryLabels[item.category] }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-ink-2">Condition</dt>
                <dd>{{ item.condition ? conditionLabels[item.condition] : '—' }}</dd>
              </div>
              <div v-if="item.series" class="flex justify-between gap-3">
                <dt class="text-ink-2">Series</dt>
                <dd class="text-right">{{ item.series }}</dd>
              </div>
              <div v-if="item.volume_number" class="flex justify-between gap-3">
                <dt class="text-ink-2">Volume</dt>
                <dd>{{ item.volume_number }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-ink-2">ISBN</dt>
                <dd class="font-mono">{{ item.isbn || '—' }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-ink-2">SKU</dt>
                <dd class="font-mono">{{ item.sku }}</dd>
              </div>
            </dl>
          </section>
          <section class="rounded-2xl border border-line bg-surface p-4">
            <h3 class="mb-2 font-bold">Money</h3>
            <dl class="space-y-1.5 text-sm tabular-nums">
              <div class="flex justify-between gap-3">
                <dt class="text-ink-2">Asking price</dt>
                <dd>
                  {{ item.list_price_cents === null ? '—' : formatCents(item.list_price_cents) }}
                </dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-ink-2">Average cost</dt>
                <dd>{{ formatCents(item.cost_cents) }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-ink-2">Est. profit each</dt>
                <dd>
                  {{
                    item.est_profit_cents === null ? '—' : formatSignedCents(item.est_profit_cents)
                  }}
                </dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-ink-2">Stock value at cost</dt>
                <dd>{{ formatCents(item.units_left * item.cost_cents) }}</dd>
              </div>
            </dl>
          </section>
          <section class="rounded-2xl border border-line bg-surface p-4">
            <h3 class="mb-2 font-bold">Sourcing</h3>
            <dl class="space-y-1.5 text-sm">
              <div class="flex justify-between gap-3">
                <dt class="text-ink-2">First bought</dt>
                <dd>{{ formatDate(item.purchased_at) || '—' }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-ink-2">From</dt>
                <dd class="text-right">{{ sources || '—' }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-ink-2">Lots</dt>
                <dd class="text-right">{{ item.lot_names.join(', ') || '—' }}</dd>
              </div>
            </dl>
          </section>
          <section class="rounded-2xl border border-line bg-surface p-4">
            <h3 class="mb-2 font-bold">Details</h3>
            <dl class="space-y-1.5 text-sm">
              <div class="flex justify-between gap-3">
                <dt class="text-ink-2">Storage</dt>
                <dd>{{ item.storage_location || '—' }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-ink-2">Tags</dt>
                <dd class="text-right">{{ item.tags.join(', ') || '—' }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-ink-2">Date entered</dt>
                <dd>{{ formatDate(item.created_at) }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-ink-2">Added by</dt>
                <dd>{{ addedBy || '—' }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-ink-2">Days in stock</dt>
                <dd>{{ item.days_in_stock }}</dd>
              </div>
              <div v-if="item.listed_at" class="flex justify-between gap-3">
                <dt class="text-ink-2">First listed</dt>
                <dd>{{ formatDate(item.listed_at) }}</dd>
              </div>
            </dl>
          </section>
        </div>

        <!-- Copies -->
        <section class="rounded-2xl border border-line bg-surface p-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="font-bold">Copies</h3>
            <BaseButton size="sm" variant="secondary" @click="addCopiesOpen = true">
              <PackagePlus class="size-4" aria-hidden="true" /> Add copies
            </BaseButton>
          </div>
          <p class="mt-1 text-sm text-ink-2">
            Bought {{ unitsBought }}, sold {{ item.units_sold }},
            <span class="font-semibold text-ink">{{ item.units_left }} left</span>
          </p>
          <ul class="mt-3 divide-y divide-line text-sm">
            <li
              v-for="a in acquisitions"
              :key="a.id"
              class="flex flex-wrap justify-between gap-x-3 py-2"
            >
              <span>
                <span class="font-semibold"
                  >{{ a.quantity }} × {{ formatCents(a.unitCostCents) }}</span
                >
                <span class="text-ink-2"> · {{ formatDate(a.purchasedAt) }}</span>
              </span>
              <span class="text-ink-2">{{
                [a.lotName, a.source].filter(Boolean).join(' · ') || '—'
              }}</span>
            </li>
          </ul>
        </section>

        <!-- History -->
        <section>
          <h3 class="mb-2 font-bold">History</h3>
          <ol class="relative space-y-3 border-l-2 border-line pl-4">
            <li v-for="entry in timeline" :key="entry.key" class="relative">
              <span
                class="absolute top-1.5 -left-[1.4rem] size-2.5 rounded-full border-2 border-bg bg-ink-2"
                aria-hidden="true"
              />
              <p class="text-sm">
                {{ entry.text }}
                <span
                  v-if="entry.profit !== null"
                  class="font-semibold"
                  :class="entry.profit >= 0 ? 'text-success' : 'text-danger'"
                  >· net {{ formatSignedCents(entry.profit) }}</span
                >
              </p>
              <p class="text-xs text-muted">{{ formatDateTime(entry.at) }}</p>
            </li>
            <li v-if="timeline.length === 0" class="text-sm text-ink-2">No history yet.</li>
          </ol>
        </section>
      </div>
    </article>

    <ItemActionsSheet v-model:open="menuOpen" :item="item" @action="run" />
    <AddCopiesSheet
      v-if="item"
      v-model:open="addCopiesOpen"
      :item-name="item.name"
      :lots="lots"
      :saving="savingCopies"
      :default-cost-cents="item.cost_cents"
      @submit="submitCopies"
    />
    <ConfirmDialog
      v-model:open="confirmArchiveOpen"
      :title="`Archive ${item?.name ?? 'item'}?`"
      message="It disappears from the inventory but keeps its history and sales. You can bring it back later."
      confirm-label="Archive"
      danger
      :loading="archiving"
      @confirm="confirmArchive"
    />
  </div>
</template>
