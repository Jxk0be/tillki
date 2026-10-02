<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { ChevronDown, Info, LibraryBig, TriangleAlert } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import ChipSelect from '@/components/ui/ChipSelect.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import LotPicker from '@/components/inventory/LotPicker.vue'
import VolumeGrid from '@/components/templates/VolumeGrid.vue'
import { useKeyboardInset } from '@/composables/useKeyboardInset'
import {
  addVolumes,
  createLot,
  getExistingVolumes,
  getSet,
  listLots,
  recentSources,
  type ExistingVolume,
  type SetDetail,
} from '@/composables/useSets'
import { useToast } from '@/composables/useToast'
import { formatDate, todayIso } from '@/lib/dates'
import { conditionLabels, itemConditions, itemStatuses, statusLabels } from '@/lib/labels'
import { formatCents, parseMoneyToCents } from '@/lib/money'
import { normalizeIsbn } from '@/lib/isbn'
import { describeMerge, renderTitle, splitEvenly, summarizeAddVolumes } from '@/lib/sets'
import { formatRanges, parseVolumeInput } from '@/lib/volumes'
import type { ItemCondition, ItemStatus, LotOption } from '@/types/inventory'

const props = defineProps<{ id: string }>()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const keyboardInset = useKeyboardInset()

const set = ref<SetDetail | null>(null)
const existing = ref<ExistingVolume[]>([])
const lots = ref<LotOption[]>([])
const sources = ref<string[]>([])
const loading = ref(true)
const notFound = ref(false)

const existingSet = computed(() => new Set(existing.value.map((v) => v.volume_number)))
const ownedSet = computed(
  () => new Set(existing.value.filter((v) => v.units_left > 0).map((v) => v.volume_number)),
)

// ---------------------------------------------------------------- picking volumes
const volumesText = ref('')
const selected = ref(new Set<number>())
const parseErrors = ref<string[]>([])
const extraRows = ref(0)

watch(volumesText, (text) => {
  const parsed = parseVolumeInput(text)
  parseErrors.value = parsed.errors
  selected.value = new Set(parsed.volumes)
})

function setSelected(next: Set<number>) {
  selected.value = next
  volumesText.value = formatRanges([...next])
}

const total = computed(() => set.value?.total_volumes ?? null)
const aboveTotal = computed(() =>
  total.value ? [...selected.value].filter((v) => v > total.value!) : [],
)
const gridLast = computed(() => {
  if (total.value) return total.value
  const highest = Math.max(0, ...existingSet.value, ...selected.value)
  return highest + 20 + extraRows.value
})

function selectAllMissing() {
  const last = total.value ?? Math.max(0, ...existingSet.value)
  const missing = Array.from({ length: last }, (_, i) => i + 1).filter(
    (n) => !ownedSet.value.has(n),
  )
  setSelected(new Set([...selected.value, ...missing]))
}

// ---------------------------------------------------------------- batch fields
const condition = ref<ItemCondition | null>(null)
const costMode = ref<'split_total' | 'per_volume'>('split_total')
const costText = ref('')
const priceText = ref('')
const lotId = ref<string | null>(null)
const makeLot = ref(false)
const lotName = ref('')
const source = ref('')
const purchasedAt = ref(todayIso())
const status = ref<ItemStatus>('in_stock')
const storage = ref('')
const isbnFromScan = ref<string | null>(null)

interface Adjustment {
  quantity: number
  condition: ItemCondition | ''
  cost: string
  price: string
}
const adjustments = ref<Record<number, Adjustment>>({})
const adjustOpen = ref(false)

const blankAdjustment = (): Adjustment => ({ quantity: 1, condition: '', cost: '', price: '' })
// Every selected volume gets an adjustment row (created here, not while rendering).
watch(
  selected,
  (vols) => {
    for (const v of vols) adjustments.value[v] ??= blankAdjustment()
  },
  { immediate: true },
)
function adjustment(v: number): Adjustment {
  return adjustments.value[v] ?? blankAdjustment()
}

onMounted(async () => {
  try {
    const [loaded, vols, lotRows, sourceRows] = await Promise.all([
      getSet(props.id),
      getExistingVolumes(props.id),
      listLots(),
      recentSources(),
    ])
    if (!loaded) {
      notFound.value = true
      return
    }
    set.value = loaded.set
    existing.value = vols
    lots.value = lotRows
    sources.value = sourceRows
    condition.value = loaded.set.default_condition
    if (loaded.set.default_cost_cents !== null) {
      costMode.value = 'per_volume'
      costText.value = (loaded.set.default_cost_cents / 100).toFixed(2)
    }
    if (loaded.set.default_list_price_cents !== null) {
      priceText.value = (loaded.set.default_list_price_cents / 100).toFixed(2)
    }
    lotName.value = `${loaded.set.name} haul, ${formatDate(todayIso())}`

    // Preselect from ?v= (volume strip, scanner) and attach a scanned ISBN.
    const v = typeof route.query.v === 'string' ? route.query.v : ''
    if (v) volumesText.value = formatRanges(parseVolumeInput(v).volumes)
    const isbn = typeof route.query.isbn === 'string' ? normalizeIsbn(route.query.isbn) : null
    if (isbn) isbnFromScan.value = isbn
  } catch {
    toast.error("Couldn't load this set.")
  } finally {
    loading.value = false
  }
})

// ---------------------------------------------------------------- summary
const selection = computed(() =>
  [...selected.value]
    .sort((a, b) => a - b)
    .map((volume) => ({ volume, quantity: adjustments.value[volume]?.quantity ?? 1 })),
)
const summary = computed(() => summarizeAddVolumes(selection.value, existingSet.value))
const costCents = computed(() => parseMoneyToCents(costText.value))

/** Money for the summary line: total and the typical per-book cost. */
const money = computed(() => {
  const books = summary.value.books
  if (!books || costCents.value === null) return null
  if (costMode.value === 'split_total') {
    const parts = splitEvenly(costCents.value, books)
    const even = parts.every((p) => p === parts[0])
    return { total: costCents.value, each: parts[0] ?? 0, even }
  }
  let totalCents = 0
  for (const { volume, quantity } of selection.value) {
    const own = parseMoneyToCents(adjustments.value[volume]?.cost ?? '')
    totalCents += quantity * (own ?? costCents.value)
  }
  return { total: totalCents, each: costCents.value, even: true }
})

const summaryText = computed(() => {
  const s = summary.value
  if (!s.books) return ''
  const parts = [`${s.books} book${s.books === 1 ? '' : 's'}`]
  const kinds: string[] = []
  if (s.newVolumes.length)
    kinds.push(`${s.newVolumes.length} new volume${s.newVolumes.length === 1 ? '' : 's'}`)
  if (s.extraCopies) kinds.push(`${s.extraCopies} extra cop${s.extraCopies === 1 ? 'y' : 'ies'}`)
  let text = `${parts[0]}: ${kinds.join(' and ')}`
  if (money.value) {
    text += `, ${formatCents(money.value.total)} total, ${money.value.even ? '' : 'about '}${formatCents(money.value.each)} each`
  }
  return `${text}.`
})

const firstTitle = computed(() => {
  const first = selection.value[0]
  return set.value && first
    ? renderTitle(set.value.title_pattern, set.value.name, first.volume)
    : ''
})

// ---------------------------------------------------------------- save
const saving = ref(false)
const saved = ref(false)
const formError = ref('')

onBeforeRouteLeave(() => {
  if (saved.value || saving.value || selected.value.size === 0) return true
  return window.confirm("You've picked volumes but haven't saved. Leave anyway?")
})

async function save() {
  if (saving.value) return
  formError.value = ''
  if (!set.value) return
  if (selected.value.size === 0) {
    formError.value = 'Pick at least one volume.'
    return
  }
  if (parseErrors.value.length) {
    formError.value = 'Fix the volume list first.'
    return
  }
  if (aboveTotal.value.length) {
    formError.value = `This set has ${total.value} volumes, so ${formatRanges(aboveTotal.value)} can't be added. Change the set's total if it's grown.`
    return
  }
  if (costCents.value === null) {
    formError.value =
      costMode.value === 'split_total'
        ? 'Enter the total you paid, like 90.'
        : 'Enter the cost per volume, like 3.'
    return
  }
  const price = priceText.value.trim() ? parseMoneyToCents(priceText.value) : null
  if (priceText.value.trim() && price === null) {
    formError.value = 'The asking price should look like 8 or 8.50.'
    return
  }

  const overrides: Record<string, Record<string, string | number>> = {}
  for (const { volume } of selection.value) {
    const a = adjustments.value[volume]
    const o: Record<string, string | number> = {}
    if (a) {
      if (a.quantity > 1) o.quantity = a.quantity
      if (a.condition) o.condition = a.condition
      const c = parseMoneyToCents(a.cost)
      if (a.cost.trim() && c !== null) o.cost_cents = c
      const p = parseMoneyToCents(a.price)
      if (a.price.trim() && p !== null) o.list_price_cents = p
    }
    if (isbnFromScan.value && selection.value.length === 1) o.isbn = isbnFromScan.value
    if (Object.keys(o).length) overrides[String(volume)] = o
  }

  saving.value = true
  try {
    let lot = lotId.value
    if (!lot && makeLot.value) {
      const created = await createLot(
        lotName.value.trim() || `${set.value.name} haul`,
        money.value?.total ?? 0,
        purchasedAt.value,
      )
      lot = created.id
    }
    const results = await addVolumes({
      templateId: set.value.id,
      volumes: selection.value.map((s) => s.volume),
      condition: condition.value,
      costMode: costMode.value,
      costCents: costCents.value,
      listPriceCents: price,
      lotId: lot,
      purchaseSource: source.value.trim() || null,
      purchasedAt: purchasedAt.value,
      status: status.value,
      storageLocation: storage.value.trim() || null,
      overrides,
    })
    saved.value = true
    const created = results.filter((r) => r.action === 'created').length
    const extra = summary.value.extraCopies
    const parts = []
    if (created) parts.push(`${created} volume${created === 1 ? '' : 's'}`)
    if (extra) parts.push(`${extra} cop${extra === 1 ? 'y' : 'ies'}`)
    const id = set.value.id
    toast.success(`Added ${parts.join(' and ')}.`, {
      action: {
        label: 'View set',
        onClick: () => void router.push({ name: 'template-detail', params: { id } }),
      },
    })
    await router.replace({ name: 'template-detail', params: { id } })
  } catch (e) {
    formError.value = e instanceof Error ? e.message : "Couldn't add the volumes."
    toast.error("Couldn't add the volumes.")
  } finally {
    saving.value = false
  }
}

const conditionOptions = itemConditions.map((c) => ({ value: c, label: conditionLabels[c] }))
const statusOptions = itemStatuses.map((s) => ({ value: s, label: statusLabels[s] }))
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <div v-if="loading" class="space-y-4" aria-busy="true">
      <div v-for="n in 3" :key="n" class="h-32 animate-pulse rounded-2xl bg-surface-2" />
    </div>

    <EmptyState
      v-else-if="notFound || !set"
      :icon="LibraryBig"
      title="Set not found"
      action-label="All sets"
      :to="{ name: 'templates' }"
    />

    <form v-else class="space-y-6 pb-40 lg:pb-6" novalidate @submit.prevent="save">
      <header>
        <RouterLink
          :to="{ name: 'template-detail', params: { id: set.id } }"
          class="text-sm font-semibold text-ink-2 hover:underline"
        >
          {{ set.name }}
        </RouterLink>
        <h2 class="text-2xl font-black">Which volumes came in?</h2>
        <p class="mt-1 text-ink-2">
          <template v-if="set.total_volumes"
            >{{ set.volumes_owned }} of {{ set.total_volumes }} owned.</template
          >
          <template v-else>{{ set.volumes_owned }} owned, total unknown.</template>
          <template v-if="set.missing_ranges"> Missing {{ set.missing_ranges }}.</template>
        </p>
      </header>

      <!-- Pick volumes -->
      <section
        class="space-y-4 rounded-2xl border border-line bg-surface p-4"
        aria-labelledby="pick-heading"
      >
        <h3 id="pick-heading" class="sr-only">Volumes</h3>
        <BaseInput
          v-model="volumesText"
          label="Volumes"
          placeholder="e.g. 1-12, 14, 16-30"
          inputmode="text"
          autocomplete="off"
          hint="Type ranges or tap the numbers below. Both stay in sync."
          :error="parseErrors.join(' ')"
        />
        <p
          v-if="aboveTotal.length"
          class="flex items-start gap-2 rounded-lg bg-accent/10 p-2 text-sm text-accent"
          role="alert"
        >
          <TriangleAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {{ formatRanges(aboveTotal) }} {{ aboveTotal.length === 1 ? 'is' : 'are' }} above this
          set's {{ set.total_volumes }} volumes.
        </p>

        <VolumeGrid
          :last="gridLast"
          :owned="ownedSet"
          :existing="existingSet"
          :selected="selected"
          :total-volumes="set.total_volumes"
          @change="setSelected"
        />
        <div class="flex flex-wrap gap-2">
          <BaseButton size="sm" variant="secondary" @click="selectAllMissing"
            >Select all missing</BaseButton
          >
          <BaseButton
            size="sm"
            variant="ghost"
            :disabled="selected.size === 0"
            @click="setSelected(new Set())"
          >
            Clear
          </BaseButton>
          <BaseButton v-if="!set.total_volumes" size="sm" variant="ghost" @click="extraRows += 20"
            >Show more</BaseButton
          >
        </div>
        <p v-if="isbnFromScan" class="text-sm text-ink-2">
          ISBN {{ isbnFromScan }} will be saved on
          {{
            selection.length === 1
              ? `volume ${selection[0]?.volume}`
              : 'the volume, if you pick just one'
          }}.
        </p>
      </section>

      <!-- Shared details -->
      <section
        class="space-y-4 rounded-2xl border border-line bg-surface p-4"
        aria-labelledby="batch-heading"
      >
        <h3 id="batch-heading" class="text-lg font-bold">For all of these</h3>
        <ChipSelect v-model="condition" label="Condition" :options="conditionOptions" clearable />

        <fieldset>
          <legend class="mb-2 text-sm font-semibold text-ink-2">Cost</legend>
          <div class="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
            <label
              v-for="m in [
                { value: 'split_total', label: 'Total paid for these' },
                { value: 'per_volume', label: 'Per volume' },
              ] as const"
              :key="m.value"
              class="flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-2 text-center text-sm font-semibold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-accent"
              :class="costMode === m.value ? 'bg-surface text-ink shadow-sm' : 'text-muted'"
            >
              <input
                v-model="costMode"
                type="radio"
                name="cost-mode"
                :value="m.value"
                class="sr-only"
              />
              {{ m.label }}
            </label>
          </div>
          <BaseInput
            v-model="costText"
            class="mt-3"
            :label="costMode === 'split_total' ? 'Total paid' : 'Cost per volume'"
            prefix="$"
            inputmode="decimal"
            autocomplete="off"
          />
          <p
            v-if="costMode === 'split_total' && money && summary.books"
            class="mt-1.5 text-sm text-ink-2"
          >
            Split evenly: {{ money.even ? '' : 'about ' }}{{ formatCents(money.each) }} per book.
          </p>
        </fieldset>

        <BaseInput
          v-model="priceText"
          label="Asking price per volume"
          prefix="$"
          inputmode="decimal"
          autocomplete="off"
        />

        <div>
          <LotPicker
            v-model="lotId"
            :lots="lots"
            :create-lot="async (n, c) => createLot(n, c, purchasedAt).catch(() => null)"
          />
          <template v-if="!lotId">
            <label class="mt-2 flex min-h-11 items-center gap-3">
              <input v-model="makeLot" type="checkbox" class="size-5" />
              <span>Make this purchase a lot</span>
            </label>
            <BaseInput v-if="makeLot" v-model="lotName" label="Lot name" class="mt-1" />
          </template>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <BaseInput
            v-model="source"
            label="Where we bought them"
            list="set-sources"
            autocomplete="off"
          />
          <datalist id="set-sources"><option v-for="s in sources" :key="s" :value="s" /></datalist>
          <BaseInput v-model="purchasedAt" label="Purchase date" type="date" />
          <BaseSelect v-model="status" label="Status" :options="statusOptions" />
          <BaseInput
            v-model="storage"
            label="Storage location"
            placeholder="e.g. Bin 3"
            autocomplete="off"
          />
        </div>
      </section>

      <!-- Individual adjustments -->
      <section v-if="selection.length" class="rounded-2xl border border-line bg-surface">
        <button
          type="button"
          class="flex min-h-12 w-full items-center justify-between px-4 text-left font-semibold"
          :aria-expanded="adjustOpen"
          @click="adjustOpen = !adjustOpen"
        >
          Adjust individual volumes
          <ChevronDown
            class="size-5 transition-transform"
            :class="{ 'rotate-180': adjustOpen }"
            aria-hidden="true"
          />
        </button>
        <div v-if="adjustOpen" class="border-t border-line p-4">
          <p class="mb-3 text-sm text-ink-2">
            Change anything for specific volumes. Quantity 2+ means you bought that volume twice in
            this haul.
          </p>
          <ul class="divide-y divide-line">
            <li
              v-for="{ volume } in selection"
              :key="volume"
              class="grid grid-cols-2 gap-2 py-3 sm:grid-cols-[5rem_6rem_1fr_1fr_1fr] sm:items-end"
            >
              <p class="col-span-2 font-semibold sm:col-span-1 sm:pb-3">
                Vol. {{ volume }}
                <span v-if="existingSet.has(volume)" class="text-xs font-normal text-accent"
                  >(+copy)</span
                >
              </p>
              <label class="text-sm">
                <span class="mb-1 block text-ink-2">Qty</span>
                <input
                  v-model.number="adjustment(volume).quantity"
                  type="number"
                  min="1"
                  max="9"
                  inputmode="numeric"
                  class="min-h-11 w-full rounded-lg border-2 border-line bg-surface px-2 text-base"
                />
              </label>
              <label class="text-sm">
                <span class="mb-1 block text-ink-2">Condition</span>
                <select
                  v-model="adjustment(volume).condition"
                  class="min-h-11 w-full rounded-lg border-2 border-line bg-surface px-2 text-base"
                >
                  <option value="">Same as all</option>
                  <option v-for="c in itemConditions" :key="c" :value="c">
                    {{ conditionLabels[c] }}
                  </option>
                </select>
              </label>
              <label class="text-sm">
                <span class="mb-1 block text-ink-2">Cost each</span>
                <input
                  v-model="adjustment(volume).cost"
                  inputmode="decimal"
                  placeholder="Same"
                  class="min-h-11 w-full rounded-lg border-2 border-line bg-surface px-2 text-base"
                />
              </label>
              <label class="text-sm">
                <span class="mb-1 block text-ink-2">Asking</span>
                <input
                  v-model="adjustment(volume).price"
                  inputmode="decimal"
                  placeholder="Same"
                  class="min-h-11 w-full rounded-lg border-2 border-line bg-surface px-2 text-base"
                />
              </label>
            </li>
          </ul>
        </div>
      </section>

      <!-- What will happen -->
      <section
        v-if="summary.books"
        class="space-y-2 rounded-2xl border border-line bg-surface p-4"
        aria-live="polite"
      >
        <p class="font-semibold">{{ describeMerge(summary) }}.</p>
        <p v-if="firstTitle" class="text-sm text-ink-2">
          New volumes are titled like “{{ firstTitle }}”.
        </p>
        <p v-if="summary.mergedVolumes.length" class="flex items-start gap-2 text-sm text-ink-2">
          <Info class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Volumes you already have just get another copy on the same row. They keep their current
            condition and asking price; adjust them after on the
            <RouterLink
              :to="{ name: 'template-detail', params: { id: set.id } }"
              class="font-semibold underline"
              >set page</RouterLink
            >.
          </span>
        </p>
      </section>

      <p
        v-if="formError"
        class="rounded-xl border border-danger/40 bg-danger/10 p-3 text-danger"
        role="alert"
      >
        {{ formError }}
      </p>

      <!-- Save bar -->
      <div
        class="fixed inset-x-0 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:static lg:rounded-2xl lg:border"
        :style="{
          bottom: keyboardInset ? `${keyboardInset}px` : 'calc(4rem + env(safe-area-inset-bottom))',
        }"
      >
        <div class="mx-auto flex max-w-3xl flex-wrap items-center gap-3">
          <p class="min-w-0 flex-1 text-sm font-medium">
            {{ summaryText || 'Pick the volumes that came in.' }}
          </p>
          <BaseButton type="submit" :loading="saving" :disabled="selected.size === 0">
            Add {{ summary.books || '' }} {{ summary.books === 1 ? 'book' : 'books' }}
          </BaseButton>
        </div>
      </div>
    </form>
  </div>
</template>
