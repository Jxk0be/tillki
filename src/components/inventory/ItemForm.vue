<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { useEventListener } from '@vueuse/core'
import { CircleAlert, ExternalLink, LoaderCircle, RotateCw, ScanBarcode } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseTextarea from '@/components/ui/BaseTextarea.vue'
import ChipSelect from '@/components/ui/ChipSelect.vue'
import PhotoPicker from '@/components/ui/PhotoPicker.vue'
import QuantityStepper from '@/components/ui/QuantityStepper.vue'
import TagInput from '@/components/ui/TagInput.vue'
import AddCopiesSheet from './AddCopiesSheet.vue'
import IsbnResultSheet from './IsbnResultSheet.vue'
import LotPicker from './LotPicker.vue'
import MarginLine from './MarginLine.vue'
import ScannerSheet from './ScannerSheet.vue'
import { useAppSettings } from '@/composables/useAppSettings'
import { analyzeIsbn, type IsbnAnalysis } from '@/composables/useIsbnAssist'
import {
  emptyValues,
  fieldOrder,
  useItemForm,
  validateItem,
  type FieldErrors,
  type ItemFormValues,
} from '@/composables/useItemForm'
import type { AddCopiesInput } from '@/composables/useItemDetail'
import { useKeyboardInset } from '@/composables/useKeyboardInset'
import { usePhotoList } from '@/composables/usePhotos'
import { useToast } from '@/composables/useToast'
import { formatDate } from '@/lib/dates'
import {
  categoryLabels,
  conditionLabels,
  itemCategories,
  itemConditions,
  itemStatuses,
  statusLabels,
} from '@/lib/labels'
import { formatCents, parseMoneyToCents } from '@/lib/money'

/**
 * Add or edit a one-off item, or edit a volume of a set (title, description
 * and cover then come from the set unless this copy has its own).
 */
const props = defineProps<{ itemId?: string; duplicateFrom?: string }>()

const router = useRouter()
const toast = useToast()
const form = useItemForm()
const photos = usePhotoList()
const settings = useAppSettings()
const keyboardInset = useKeyboardInset()

const isEdit = computed(() => !!props.itemId)
const isSetVolume = computed(() => isEdit.value && form.item.value?.template_id != null)
/** With several purchases, cost and sourcing are managed from the item's copies. */
const costEditable = computed(() => !isEdit.value || form.acquisitions.value.length <= 1)
/**
 * Every copy has a sale recorded, so the database keeps it "Sold" whatever the
 * status field says. It comes back in stock by undoing the sale or adding copies.
 */
const soldOut = computed(
  () =>
    isEdit.value &&
    !!form.item.value &&
    form.item.value.units_left === 0 &&
    form.item.value.units_sold > 0,
)

const values = ref<ItemFormValues>(emptyValues())
const errors = ref<FieldErrors>({})
const loading = ref(false)
const saving = ref(false)
const ownDescription = ref(false)

// "5 added this session" survives "Save and add another" (but not a page reload).
const addedThisSession = ref(Number(sessionStorage.getItem('kura-added-count') ?? 0))

// ---------------------------------------------------------------- unsaved changes
const baseline = ref('')
const snapshot = () =>
  JSON.stringify({ v: values.value, p: photos.photos.value.map((p) => p.path ?? p.key) })
const dirty = computed(() => baseline.value !== '' && snapshot() !== baseline.value)
let leaving = false
function markClean() {
  baseline.value = snapshot()
}

onBeforeRouteLeave(() => {
  if (leaving || !dirty.value || saving.value) return true
  return window.confirm('You have unsaved changes. Leave without saving?')
})
useEventListener(window, 'beforeunload', (e: BeforeUnloadEvent) => {
  if (dirty.value) e.preventDefault()
})

// ---------------------------------------------------------------- load
onMounted(async () => {
  loading.value = true
  await Promise.all([form.loadOptions(), settings.ready])
  const sourceId = props.itemId ?? props.duplicateFrom
  if (sourceId) {
    const loaded = await form.loadItem(sourceId)
    if (!loaded) {
      toast.error("Couldn't load that item.")
    } else if (props.itemId) {
      values.value = loaded
      photos.reset(form.existingPhotoEntries())
      ownDescription.value = !!loaded.description
    } else {
      // Duplicate: same details, but no photos, a new SKU, and one copy.
      values.value = { ...loaded, quantity: 1, purchasedAt: emptyValues().purchasedAt }
    }
  }
  loading.value = false
  await nextTick()
  markClean()
})

const costCents = computed(() => parseMoneyToCents(values.value.cost))
const priceCents = computed(() => parseMoneyToCents(values.value.price))
const marginCost = computed(() => {
  if (!costEditable.value) return form.item.value?.cost_cents ?? null
  if (values.value.lotId && !values.value.overrideLotCost) return null
  return costCents.value
})

// ---------------------------------------------------------------- ISBN
const scannerOpen = ref(false)
const looking = ref(false)
const isbnResult = ref<IsbnAnalysis | null>(null)
const isbnSheetOpen = ref(false)
const copyTarget = ref<{ id: string; name: string; costCents: number } | null>(null)
const copySheetOpen = ref(false)
const savingCopy = ref(false)

async function onIsbn(isbn: string) {
  values.value.isbn = isbn
  looking.value = true
  try {
    let result = await analyzeIsbn(isbn)
    // Editing the very item that has this ISBN isn't a duplicate.
    if (result.kind === 'existing' && result.item.id === props.itemId)
      result = { kind: 'not_found', isbn }
    isbnResult.value = result
    if (!(isEdit.value && result.kind === 'not_found')) isbnSheetOpen.value = true
  } finally {
    looking.value = false
  }
}

function useBookDetails() {
  const r = isbnResult.value
  if (!r || (r.kind !== 'book' && r.kind !== 'set_match')) return
  const v = values.value
  if (!isSetVolume.value) {
    v.name = r.book.title
    v.series = r.book.series
    v.volumeNumber = r.book.volume ? String(r.book.volume) : v.volumeNumber
  }
  if (!v.description && r.book.description) v.description = r.book.description
  v.category = v.category ?? 'manga'
}

function addToSet(setId: string, volume: number, isbn: string) {
  leaving = true
  void router.push({
    name: 'template-add-volumes',
    params: { id: setId },
    query: { v: String(volume), isbn },
  })
}

function openExisting(itemId: string) {
  void router.push({ name: 'item-detail', params: { id: itemId } })
}

function startAddCopy(itemId: string) {
  const r = isbnResult.value
  if (r?.kind !== 'existing') return
  copyTarget.value = { id: itemId, name: r.item.name, costCents: r.item.costCents }
  copySheetOpen.value = true
}

async function submitCopy(input: AddCopiesInput) {
  if (!copyTarget.value) return
  savingCopy.value = true
  const result = await form.addCopiesTo(copyTarget.value.id, input)
  savingCopy.value = false
  if (!result.ok) {
    toast.error(`Couldn't add the copy. ${result.message ?? ''}`.trim())
    return
  }
  copySheetOpen.value = false
  values.value.isbn = ''
  toast.success(`Added ${input.quantity} to ${copyTarget.value.name}.`, {
    action: { label: 'Open', onClick: () => openExisting(copyTarget.value?.id ?? '') },
  })
}

// ---------------------------------------------------------------- save
const photoFailure = ref<{ itemId: string; failed: number; addAnother: boolean } | null>(null)

async function focusFirstError() {
  await nextTick()
  const first = fieldOrder.find((k) => errors.value[k])
  const el = first ? document.getElementById(`field-${first}`) : null
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  const focusable = el.matches('input, textarea, select')
    ? el
    : el.querySelector<HTMLElement>('input, textarea, select, button')
  focusable?.focus({ preventScroll: true })
}

function resetForAnother() {
  const keep = values.value
  photos.reset()
  values.value = {
    ...emptyValues(),
    category: keep.category,
    lotId: keep.lotId,
    overrideLotCost: keep.overrideLotCost,
    source: keep.source,
    purchasedAt: keep.purchasedAt,
    storageLocation: keep.storageLocation,
  }
  errors.value = {}
  markClean()
  void nextTick(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    document.getElementById('field-name')?.focus({ preventScroll: true })
  })
}

function finish(itemId: string, addAnother: boolean) {
  photoFailure.value = null
  if (addAnother) {
    saving.value = false
    resetForAnother()
    return
  }
  leaving = true
  saving.value = true
  // Stay busy while the item page loads; only re-enable if navigation fails.
  router
    .replace({ name: 'item-detail', params: { id: itemId } })
    .catch(() => (saving.value = false))
}

async function save(addAnother = false) {
  if (saving.value) return
  errors.value = validateItem(values.value, {
    isSetVolume: isSetVolume.value,
    costEditable: costEditable.value,
  })
  if (Object.keys(errors.value).length) {
    toast.error('Check the highlighted fields.')
    void focusFirstError()
    return
  }

  saving.value = true
  const result = props.itemId
    ? await form.updateItem(props.itemId, values.value, photos)
    : await form.createItem(values.value, photos)
  // On success the buttons stay busy until finish() is done.
  if (!result.ok || !result.itemId || result.failedPhotos > 0) saving.value = false

  if (!result.ok || !result.itemId) {
    toast.error(`Couldn't save. ${result.message ?? ''}`.trim())
    return
  }
  markClean()
  if (!isEdit.value) {
    addedThisSession.value += 1
    sessionStorage.setItem('kura-added-count', String(addedThisSession.value))
  }
  toast.success(isEdit.value ? 'Saved.' : `Added ${values.value.name.trim() || 'item'}.`)

  if (result.failedPhotos > 0) {
    photoFailure.value = { itemId: result.itemId, failed: result.failedPhotos, addAnother }
    return
  }
  finish(result.itemId, addAnother)
}

const retrying = ref(false)
async function retryPhotos() {
  const failure = photoFailure.value
  if (!failure) return
  retrying.value = true
  try {
    const failed = await form.syncPhotos(failure.itemId, photos)
    if (failed === 0) {
      toast.success('Photos uploaded.')
      finish(failure.itemId, failure.addAnother)
    } else {
      photoFailure.value = { ...failure, failed }
    }
  } catch {
    toast.error("Photos still didn't upload.")
  } finally {
    retrying.value = false
  }
}

// "Sold" comes from recording a sale (Mark sold), not from this field.
const statusOptions = computed(() =>
  itemStatuses
    .filter((s) => s !== 'sold' || values.value.status === 'sold')
    .map((s) => ({ value: s, label: statusLabels[s] })),
)
const categoryOptions = itemCategories.map((c) => ({ value: c, label: categoryLabels[c] }))
const conditionOptions = itemConditions.map((c) => ({ value: c, label: conditionLabels[c] }))
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <div v-if="loading" class="space-y-4" aria-busy="true">
      <div v-for="n in 4" :key="n" class="h-24 animate-pulse rounded-2xl bg-surface-2" />
      <span class="sr-only" role="status">Loading</span>
    </div>

    <form v-else class="space-y-6 pb-28 lg:pb-6" novalidate @submit.prevent="save(false)">
      <!-- Set volume header -->
      <div
        v-if="isSetVolume && form.set.value"
        class="rounded-2xl border border-line bg-surface p-4"
      >
        <p class="text-sm text-ink-2">Volume {{ values.volumeNumber }} of</p>
        <RouterLink
          :to="{ name: 'template-detail', params: { id: form.set.value.id } }"
          class="inline-flex items-center gap-1 text-lg font-bold underline-offset-2 hover:underline"
        >
          {{ form.set.value.name }} <ExternalLink class="size-4" aria-hidden="true" />
        </RouterLink>
      </div>

      <!-- 1. Photos -->
      <section class="rounded-2xl border border-line bg-surface p-4">
        <PhotoPicker
          :list="photos"
          :label="isSetVolume ? 'Photos of this copy (optional)' : 'Photos'"
          :hint="
            isSetVolume
              ? 'Without its own photos, this copy uses the set photo.'
              : 'The first photo is the cover.'
          "
          :fallback-cover-path="isSetVolume ? (form.set.value?.coverPath ?? null) : null"
        />
      </section>

      <!-- 2. Basics -->
      <section
        class="space-y-4 rounded-2xl border border-line bg-surface p-4"
        aria-labelledby="basics-heading"
      >
        <h2 id="basics-heading" class="text-lg font-bold">Basics</h2>

        <template v-if="isSetVolume">
          <div v-if="!values.nameIsCustom" class="rounded-lg bg-surface-2 px-3 py-2">
            <p class="text-xs text-ink-2">Title (from the set)</p>
            <p class="font-semibold">{{ values.name }}</p>
          </div>
          <BaseInput
            v-else
            id="field-name"
            v-model="values.name"
            label="Custom title"
            :error="errors.name"
            required
          />
          <label class="flex min-h-11 items-center gap-3">
            <input v-model="values.nameIsCustom" type="checkbox" class="size-5" />
            <span>Use a custom title</span>
          </label>
        </template>
        <BaseInput
          v-else
          id="field-name"
          v-model="values.name"
          label="Name"
          placeholder="e.g. Nendoroid Gojo Satoru"
          :error="errors.name"
          autocomplete="off"
          required
        />

        <ChipSelect
          id="field-category"
          v-model="values.category"
          label="Category"
          :options="categoryOptions"
          :error="errors.category"
          required
        />

        <div v-if="!isSetVolume" class="grid grid-cols-[1fr_7rem] gap-3">
          <BaseInput
            v-model="values.series"
            label="Series"
            placeholder="e.g. Akira"
            autocomplete="off"
          />
          <BaseInput
            id="field-volumeNumber"
            v-model="values.volumeNumber"
            label="Volume"
            inputmode="numeric"
            :error="errors.volumeNumber"
          />
        </div>

        <div>
          <div class="flex items-end gap-2">
            <BaseInput
              id="field-isbn"
              v-model="values.isbn"
              class="flex-1"
              label="ISBN"
              inputmode="numeric"
              autocomplete="off"
              :error="errors.isbn"
            />
            <BaseButton variant="secondary" :loading="looking" @click="scannerOpen = true">
              <ScanBarcode v-if="!looking" class="size-5" aria-hidden="true" /> Scan
            </BaseButton>
          </div>
          <p v-if="looking" class="mt-1.5 flex items-center gap-2 text-sm text-ink-2" role="status">
            <LoaderCircle class="size-4 animate-spin" aria-hidden="true" /> Looking up the book…
          </p>
        </div>

        <ChipSelect
          id="field-condition"
          v-model="values.condition"
          label="Condition"
          :options="conditionOptions"
          clearable
        />

        <QuantityStepper
          v-if="!isEdit"
          id="field-quantity"
          v-model="values.quantity"
          label="Quantity"
        />
        <div
          v-else
          class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2"
        >
          <p class="text-sm">
            <span class="text-ink-2">Quantity:</span>
            <span class="font-semibold">
              {{ form.item.value?.quantity }} bought, {{ form.item.value?.units_left }} left</span
            >
          </p>
          <RouterLink
            :to="{ name: 'item-detail', params: { id: itemId }, hash: '#copies' }"
            class="text-sm font-semibold text-primary underline-offset-2 hover:underline"
            >Add copies</RouterLink
          >
        </div>
      </section>

      <!-- 3. Money -->
      <section
        class="space-y-4 rounded-2xl border border-line bg-surface p-4"
        aria-labelledby="money-heading"
      >
        <h2 id="money-heading" class="text-lg font-bold">Money</h2>

        <template v-if="costEditable">
          <div
            v-if="values.lotId && !values.overrideLotCost"
            class="rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-2"
          >
            Cost will be set by the lot split.
          </div>
          <BaseInput
            v-else
            id="field-cost"
            v-model="values.cost"
            :label="values.quantity > 1 ? 'What we paid each' : 'What we paid'"
            prefix="$"
            inputmode="decimal"
            autocomplete="off"
            :error="errors.cost"
            required
          />
          <label v-if="values.lotId" class="flex min-h-11 items-center gap-3">
            <input v-model="values.overrideLotCost" type="checkbox" class="size-5" />
            <span>Enter the cost myself instead</span>
          </label>
        </template>
        <div v-else class="rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <p>
            <span class="text-ink-2">Average cost:</span>
            <span class="font-semibold"> {{ formatCents(form.item.value?.cost_cents ?? 0) }}</span>
            from {{ form.acquisitions.value.length }} purchases.
          </p>
          <ul class="mt-1 text-ink-2">
            <li v-for="a in form.acquisitions.value" :key="a.id">
              {{ a.quantity }} × {{ formatCents(a.unitCostCents) }} ·
              {{ formatDate(a.purchasedAt) }}
            </li>
          </ul>
          <RouterLink
            :to="{ name: 'item-detail', params: { id: itemId }, hash: '#copies' }"
            class="mt-1 inline-block font-semibold text-primary underline-offset-2 hover:underline"
            >Manage copies</RouterLink
          >
        </div>

        <BaseInput
          id="field-price"
          v-model="values.price"
          label="Asking price"
          prefix="$"
          inputmode="decimal"
          autocomplete="off"
          :error="errors.price"
        />
        <MarginLine
          :price-cents="priceCents"
          :cost-cents="marginCost"
          :rule="settings.defaultFeeRule.value"
          :platform="settings.defaultPlatform.value"
        />
      </section>

      <!-- 4. Sourcing -->
      <section
        v-if="costEditable"
        class="space-y-4 rounded-2xl border border-line bg-surface p-4"
        aria-labelledby="sourcing-heading"
      >
        <h2 id="sourcing-heading" class="text-lg font-bold">Sourcing</h2>
        <LotPicker v-model="values.lotId" :lots="form.lots.value" :create-lot="form.createLot" />
        <BaseInput
          v-model="values.source"
          label="Where we bought it"
          placeholder="e.g. Half Price Books"
          list="recent-sources"
          autocomplete="off"
        />
        <datalist id="recent-sources">
          <option v-for="s in form.recentSources.value" :key="s" :value="s" />
        </datalist>
        <BaseInput
          id="field-purchasedAt"
          v-model="values.purchasedAt"
          label="Purchase date"
          type="date"
          :error="errors.purchasedAt"
        />
      </section>

      <!-- 5. Details -->
      <section
        class="space-y-4 rounded-2xl border border-line bg-surface p-4"
        aria-labelledby="details-heading"
      >
        <h2 id="details-heading" class="text-lg font-bold">Details</h2>

        <template v-if="isSetVolume && form.set.value?.description && !ownDescription">
          <div>
            <p class="mb-1.5 text-sm font-semibold text-ink-2">Description (from the set)</p>
            <p class="rounded-lg bg-surface-2 px-3 py-2 text-sm whitespace-pre-line text-muted">
              {{ form.set.value.description }}
            </p>
          </div>
          <BaseButton variant="ghost" size="sm" @click="ownDescription = true">
            Write a description just for this copy
          </BaseButton>
        </template>
        <BaseTextarea
          v-else
          v-model="values.description"
          :label="isSetVolume ? 'Description for this copy' : 'Description'"
          :rows="4"
        />

        <TagInput v-model="values.tags" label="Tags" hint="Type a tag and press Enter." />
        <BaseInput
          v-model="values.storageLocation"
          label="Storage location"
          placeholder="e.g. Bin 3"
          autocomplete="off"
        />
        <div v-if="soldOut" id="field-status" class="rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <p>
            <span class="text-ink-2">Status:</span>
            <span class="font-semibold"> Sold</span>
            ({{ form.item.value?.units_sold }} of {{ form.item.value?.quantity }} sold)
          </p>
          <p class="mt-1 text-ink-2">
            To put it back in stock, delete the sale (use "Edit sale" in this item's History, or the
            <RouterLink
              :to="{ name: 'sales' }"
              class="font-semibold text-primary underline-offset-2 hover:underline"
              >Sales page</RouterLink
            >), or
            <RouterLink
              :to="{ name: 'item-detail', params: { id: itemId }, hash: '#copies' }"
              class="font-semibold text-primary underline-offset-2 hover:underline"
              >add copies</RouterLink
            >.
          </p>
        </div>
        <BaseSelect
          v-else
          id="field-status"
          v-model="values.status"
          label="Status"
          :options="statusOptions"
        />

        <p v-if="isEdit && form.item.value" class="text-sm text-ink-2">
          Date entered:
          <span class="font-semibold text-ink">{{ formatDate(form.item.value.created_at) }}</span>
        </p>
      </section>

      <!-- Photos that didn't upload -->
      <div
        v-if="photoFailure"
        class="flex flex-wrap items-center gap-3 rounded-2xl border border-danger/40 bg-danger/10 p-4"
        role="alert"
      >
        <CircleAlert class="size-5 shrink-0 text-danger" aria-hidden="true" />
        <p class="min-w-0 flex-1 text-sm">
          The item was saved, but {{ photoFailure.failed }} photo{{
            photoFailure.failed === 1 ? '' : 's'
          }}
          didn't upload.
        </p>
        <BaseButton size="sm" :loading="retrying" @click="retryPhotos">
          <RotateCw class="size-4" aria-hidden="true" /> Retry
        </BaseButton>
        <BaseButton
          size="sm"
          variant="ghost"
          @click="finish(photoFailure.itemId, photoFailure.addAnother)"
        >
          Continue without them
        </BaseButton>
      </div>

      <!-- Save bar: fixed above the tab bar (or the keyboard) on phones -->
      <div
        class="fixed inset-x-0 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:static lg:rounded-2xl lg:border lg:px-4"
        :style="{
          bottom: keyboardInset ? `${keyboardInset}px` : 'calc(4rem + env(safe-area-inset-bottom))',
        }"
      >
        <div class="mx-auto flex max-w-2xl flex-wrap items-center gap-2">
          <span v-if="!isEdit && addedThisSession" class="mr-auto text-sm text-ink-2">
            {{ addedThisSession }} added this session
          </span>
          <BaseButton
            v-if="!isEdit"
            variant="secondary"
            :loading="saving"
            :class="addedThisSession ? '' : 'mr-auto'"
            @click="save(true)"
          >
            Save and add another
          </BaseButton>
          <BaseButton type="submit" :loading="saving" :class="{ 'ml-auto': isEdit }"
            >Save</BaseButton
          >
        </div>
      </div>
    </form>

    <ScannerSheet v-model:open="scannerOpen" @isbn="onIsbn" />
    <IsbnResultSheet
      v-model:open="isbnSheetOpen"
      :result="isbnResult"
      @use-details="useBookDetails"
      @keep-isbn="() => undefined"
      @add-to-set="addToSet"
      @add-copy="startAddCopy"
      @open-item="openExisting"
    />
    <AddCopiesSheet
      v-model:open="copySheetOpen"
      :item-name="copyTarget?.name ?? ''"
      :lots="form.lots.value"
      :saving="savingCopy"
      :default-cost-cents="copyTarget?.costCents ?? 0"
      @submit="submitCopy"
    />
  </div>
</template>
