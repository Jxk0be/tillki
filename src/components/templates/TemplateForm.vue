<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { useEventListener } from '@vueuse/core'
import { CircleAlert, RotateCw } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseTextarea from '@/components/ui/BaseTextarea.vue'
import ChipSelect from '@/components/ui/ChipSelect.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import PhotoPicker from '@/components/ui/PhotoPicker.vue'
import TagInput from '@/components/ui/TagInput.vue'
import { existingPhoto, usePhotoList } from '@/composables/usePhotos'
import { useKeyboardInset } from '@/composables/useKeyboardInset'
import {
  countSetItems,
  createSet,
  getSet,
  retrySetPhotos,
  updateSet,
  type SetFields,
} from '@/composables/useSets'
import { useToast } from '@/composables/useToast'
import { categoryLabels, conditionLabels, itemCategories, itemConditions } from '@/lib/labels'
import { parseMoneyToCents } from '@/lib/money'
import { DEFAULT_TITLE_PATTERN, renderTitle } from '@/lib/sets'
import type { ItemCategory, ItemCondition } from '@/types/inventory'

/** Create or edit a set (template): what every volume shares. */
const props = defineProps<{ templateId?: string }>()

const router = useRouter()
const toast = useToast()
const photos = usePhotoList()
const keyboardInset = useKeyboardInset()
const isEdit = computed(() => !!props.templateId)

interface FormValues {
  name: string
  titlePattern: string
  category: ItemCategory | null
  publisher: string
  language: string
  totalVolumes: string
  isOngoing: boolean
  description: string
  defaultCondition: ItemCondition | null
  defaultCost: string
  defaultPrice: string
  tags: string[]
  notes: string
}

const values = ref<FormValues>({
  name: '',
  titlePattern: DEFAULT_TITLE_PATTERN,
  category: 'manga',
  publisher: '',
  language: 'English',
  totalVolumes: '',
  isOngoing: false,
  description: '',
  defaultCondition: null,
  defaultCost: '',
  defaultPrice: '',
  tags: [],
  notes: '',
})
const original = ref<FormValues | null>(null)
const originalPaths = ref<string[]>([])
const errors = ref<Partial<Record<keyof FormValues, string>>>({})
const loading = ref(false)
const saving = ref(false)

const preview = computed(() =>
  renderTitle(
    values.value.titlePattern || DEFAULT_TITLE_PATTERN,
    values.value.name.trim() || 'One Piece',
    3,
  ),
)

// ---------------------------------------------------------------- unsaved changes
const baseline = ref('')
const snapshot = () =>
  JSON.stringify({ v: values.value, p: photos.photos.value.map((p) => p.path ?? p.key) })
const dirty = computed(() => baseline.value !== '' && snapshot() !== baseline.value)
let leaving = false
onBeforeRouteLeave(() => {
  if (leaving || !dirty.value || saving.value) return true
  return window.confirm('You have unsaved changes. Leave without saving?')
})
useEventListener(window, 'beforeunload', (e: BeforeUnloadEvent) => {
  if (dirty.value) e.preventDefault()
})

const centsToText = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2))

onMounted(async () => {
  if (props.templateId) {
    loading.value = true
    const loaded = await getSet(props.templateId).catch(() => null)
    loading.value = false
    if (!loaded) {
      toast.error("Couldn't load that set.")
      return
    }
    const s = loaded.set
    values.value = {
      name: s.name,
      titlePattern: s.title_pattern,
      category: s.category,
      publisher: s.publisher ?? '',
      language: s.language ?? '',
      totalVolumes: s.total_volumes ? String(s.total_volumes) : '',
      isOngoing: s.is_ongoing,
      description: s.description ?? '',
      defaultCondition: s.default_condition,
      defaultCost: centsToText(s.default_cost_cents),
      defaultPrice: centsToText(s.default_list_price_cents),
      tags: s.tags,
      notes: s.notes ?? '',
    }
    original.value = { ...values.value, tags: [...values.value.tags] }
    originalPaths.value = loaded.photoPaths
    photos.reset(loaded.photoPaths.map(existingPhoto))
  }
  await nextTick()
  baseline.value = snapshot()
})

function validate(): SetFields | null {
  const v = values.value
  const e: typeof errors.value = {}
  if (!v.name.trim()) e.name = 'Give the set a name, like One Piece.'
  if (!v.titlePattern.includes('{n}') && !v.titlePattern.includes('{nn}')) {
    e.titlePattern = 'Include {n} (or {nn}) where the volume number goes.'
  }
  if (!v.category) e.category = 'Pick a category.'
  const total = v.totalVolumes.trim()
  if (total && !(/^\d+$/.test(total) && Number(total) > 0))
    e.totalVolumes = 'Use a whole number, or leave it blank.'
  const cost = v.defaultCost.trim() ? parseMoneyToCents(v.defaultCost) : null
  const price = v.defaultPrice.trim() ? parseMoneyToCents(v.defaultPrice) : null
  if (v.defaultCost.trim() && cost === null) e.defaultCost = 'Use an amount like 3 or 3.50.'
  if (v.defaultPrice.trim() && price === null) e.defaultPrice = 'Use an amount like 8 or 8.50.'
  errors.value = e
  if (Object.keys(e).length) return null
  return {
    name: v.name.trim(),
    title_pattern: v.titlePattern.trim(),
    category: v.category ?? 'manga',
    publisher: v.publisher.trim() || null,
    language: v.language.trim() || null,
    total_volumes: total ? Number(total) : null,
    is_ongoing: v.isOngoing,
    description: v.description.trim() || null,
    default_condition: v.defaultCondition,
    default_cost_cents: cost,
    default_list_price_cents: price,
    tags: v.tags,
    notes: v.notes.trim() || null,
  }
}

// ---------------------------------------------------------------- save
const confirmOpen = ref(false)
const affectedCount = ref(0)
const pendingFields = ref<SetFields | null>(null)
const photoFailure = ref<{ id: string; failed: number; created: boolean } | null>(null)

async function submit() {
  if (saving.value) return
  const fields = validate()
  if (!fields) {
    toast.error('Check the highlighted fields.')
    await nextTick()
    document
      .querySelector<HTMLElement>('[aria-invalid="true"], fieldset:has(.text-danger) button')
      ?.focus()
    return
  }
  const o = original.value
  const sharedChanged =
    !!o &&
    (o.name !== values.value.name ||
      o.titlePattern !== values.value.titlePattern ||
      o.description !== values.value.description)
  if (props.templateId && sharedChanged) {
    saving.value = true
    affectedCount.value = await countSetItems(props.templateId).finally(
      () => (saving.value = false),
    )
    if (affectedCount.value > 0) {
      pendingFields.value = fields
      confirmOpen.value = true
      return
    }
  }
  await persist(fields)
}

async function persist(fields: SetFields) {
  confirmOpen.value = false
  saving.value = true
  const result = props.templateId
    ? await updateSet(props.templateId, fields, photos, originalPaths.value)
    : await createSet(fields, photos)
  // On success the button stays busy until the next page has loaded (see done()).
  if (!result.ok || !result.id || result.failedPhotos > 0) saving.value = false
  if (!result.ok || !result.id) {
    if (result.message?.includes('name')) errors.value.name = result.message
    toast.error(result.message ?? "Couldn't save the set.")
    return
  }
  baseline.value = snapshot()
  if (result.failedPhotos > 0) {
    photoFailure.value = { id: result.id, failed: result.failedPhotos, created: !isEdit.value }
    return
  }
  done(result.id, !isEdit.value)
}

function done(id: string, created: boolean) {
  leaving = true
  saving.value = true
  photoFailure.value = null
  const next = created
    ? { name: 'template-add-volumes', params: { id } }
    : { name: 'template-detail', params: { id } }
  toast.success(
    created ? `Created ${values.value.name.trim()}. Now add the volumes you have.` : 'Set saved.',
  )
  // Stay busy while the next page loads; only re-enable if navigation fails.
  router.replace(next).catch(() => (saving.value = false))
}

const retrying = ref(false)
async function retry() {
  const f = photoFailure.value
  if (!f) return
  retrying.value = true
  const failed = await retrySetPhotos(f.id, photos, originalPaths.value).catch(() => f.failed)
  retrying.value = false
  if (failed === 0) done(f.id, f.created)
  else photoFailure.value = { ...f, failed }
}

const categoryOptions = itemCategories.map((c) => ({ value: c, label: categoryLabels[c] }))
const conditionOptions = itemConditions.map((c) => ({ value: c, label: conditionLabels[c] }))
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <div v-if="loading" class="space-y-4" aria-busy="true">
      <div v-for="n in 3" :key="n" class="h-28 animate-pulse rounded-2xl bg-surface-2" />
    </div>

    <form v-else class="space-y-6 pb-28 lg:pb-6" novalidate @submit.prevent="submit">
      <section
        class="space-y-4 rounded-2xl border border-line bg-surface p-4"
        aria-labelledby="set-basics"
      >
        <h2 id="set-basics" class="text-lg font-bold">The series</h2>
        <BaseInput
          v-model="values.name"
          label="Name"
          placeholder="e.g. One Piece"
          :error="errors.name"
          autocomplete="off"
          required
        />
        <div>
          <BaseInput
            v-model="values.titlePattern"
            label="Volume title pattern"
            :hint="`Use {name} and {n} (or {nn} for 03). Preview: “${preview}”`"
            :error="errors.titlePattern"
            autocomplete="off"
          />
        </div>
        <ChipSelect
          v-model="values.category"
          label="Category"
          :options="categoryOptions"
          :error="errors.category"
          required
        />
        <div class="grid gap-4 sm:grid-cols-2">
          <BaseInput
            v-model="values.publisher"
            label="Publisher"
            placeholder="e.g. VIZ Media"
            autocomplete="off"
          />
          <BaseInput v-model="values.language" label="Language" autocomplete="off" />
        </div>
        <div>
          <BaseInput
            v-model="values.totalVolumes"
            label="Total volumes"
            inputmode="numeric"
            hint="Leave blank if you're not sure; we'll show gaps between the volumes you own."
            :error="errors.totalVolumes"
          />
          <label class="mt-2 flex min-h-11 items-center gap-3">
            <input v-model="values.isOngoing" type="checkbox" class="size-5" />
            <span>Ongoing series (more volumes still coming out)</span>
          </label>
        </div>
        <BaseTextarea
          v-model="values.description"
          label="Shared description"
          hint="Every volume uses this unless it has its own."
          :rows="4"
        />
      </section>

      <section class="rounded-2xl border border-line bg-surface p-4">
        <PhotoPicker
          :list="photos"
          label="Example photos"
          hint="One photo is enough. It becomes the cover for every volume without its own photo."
        />
      </section>

      <section
        class="space-y-4 rounded-2xl border border-line bg-surface p-4"
        aria-labelledby="set-defaults"
      >
        <h2 id="set-defaults" class="text-lg font-bold">Defaults for new volumes</h2>
        <ChipSelect
          v-model="values.defaultCondition"
          label="Condition"
          :options="conditionOptions"
          clearable
        />
        <div class="grid grid-cols-2 gap-3">
          <BaseInput
            v-model="values.defaultCost"
            label="Cost per volume"
            prefix="$"
            inputmode="decimal"
            :error="errors.defaultCost"
          />
          <BaseInput
            v-model="values.defaultPrice"
            label="Asking per volume"
            prefix="$"
            inputmode="decimal"
            :error="errors.defaultPrice"
          />
        </div>
        <TagInput v-model="values.tags" label="Tags" hint="Every new volume gets these tags." />
        <BaseTextarea v-model="values.notes" label="Notes (just for us)" :rows="2" />
      </section>

      <div
        v-if="photoFailure"
        class="flex flex-wrap items-center gap-3 rounded-2xl border border-danger/40 bg-danger/10 p-4"
        role="alert"
      >
        <CircleAlert class="size-5 shrink-0 text-danger" aria-hidden="true" />
        <p class="min-w-0 flex-1 text-sm">
          The set was saved, but {{ photoFailure.failed }} photo{{
            photoFailure.failed === 1 ? '' : 's'
          }}
          didn't upload.
        </p>
        <BaseButton size="sm" :loading="retrying" @click="retry">
          <RotateCw class="size-4" aria-hidden="true" /> Retry
        </BaseButton>
        <BaseButton size="sm" variant="ghost" @click="done(photoFailure.id, photoFailure.created)">
          Continue without them
        </BaseButton>
      </div>

      <div
        class="fixed inset-x-0 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:static lg:rounded-2xl lg:border"
        :style="{
          bottom: keyboardInset ? `${keyboardInset}px` : 'calc(4rem + env(safe-area-inset-bottom))',
        }"
      >
        <div class="mx-auto flex max-w-2xl justify-end">
          <BaseButton type="submit" :loading="saving">
            {{ isEdit ? 'Save set' : 'Create set and add volumes' }}
          </BaseButton>
        </div>
      </div>
    </form>

    <ConfirmDialog
      v-model:open="confirmOpen"
      title="Update every volume?"
      :message="`This updates ${affectedCount} volume${affectedCount === 1 ? '' : 's'}: their titles and shared description change to match the set. Volumes with their own custom title or description keep them.`"
      :confirm-label="`Update ${affectedCount} volume${affectedCount === 1 ? '' : 's'}`"
      :loading="saving"
      @confirm="pendingFields && persist(pendingFields)"
    />
  </div>
</template>
