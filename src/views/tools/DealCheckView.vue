<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Camera,
  CircleCheck,
  CircleX,
  Handshake,
  PackagePlus,
  ScanBarcode,
  X,
} from 'lucide-vue-next'
import ScannerSheet from '@/components/inventory/ScannerSheet.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import ChipSelect from '@/components/ui/ChipSelect.vue'
import QuantityStepper from '@/components/ui/QuantityStepper.vue'
import { lookupIsbn } from '@/composables/useBookLookup'
import { blobToBase64, checkDeal, type DealResult } from '@/composables/useDealCheck'
import { useToast } from '@/composables/useToast'
import { compressPhoto } from '@/lib/images'
import { categoryLabels, conditionLabels, itemCategories, itemConditions } from '@/lib/labels'
import { formatCents, formatSignedCents, parseMoneyToCents } from '@/lib/money'
import { formatRanges, parseVolumeInput } from '@/lib/volumes'
import { useInventoryStore } from '@/stores/inventory'
import type { ItemCategory, ItemCondition } from '@/types/inventory'

/** Should we buy this? Judged on our own sales history and target margin. */
const router = useRouter()
const toast = useToast()
const inventory = useInventoryStore()
onMounted(() => void inventory.loadSetOptions())

const description = ref('')
const setId = ref<string>('')
const series = ref('')
const category = ref<ItemCategory | null>(null)
const volumesText = ref('')
const quantity = ref(1)
const condition = ref<ItemCondition | null>(null)
const price = ref('')
const photo = ref<{ blob: Blob; type: string; url: string } | null>(null)
const errors = ref<{ description?: string; price?: string; volumes?: string }>({})
const checking = ref(false)
const result = ref<DealResult | null>(null)
const failure = ref('')

const setOptions = computed(() => inventory.setOptions.map((s) => ({ value: s.id, label: s.name })))
const setName = computed(() => inventory.setOptions.find((s) => s.id === setId.value)?.name ?? null)
const parsedVolumes = computed(() => parseVolumeInput(volumesText.value))

// ---------------------------------------------------------------- ISBN scan
const scannerOpen = ref(false)
async function onIsbn(isbn: string) {
  scannerOpen.value = false
  const book = await lookupIsbn(isbn).catch(() => null)
  if (!book) {
    toast.error(`Couldn't find ISBN ${isbn}. Type what it is instead.`)
    return
  }
  description.value = book.title
  const match = inventory.setOptions.find((s) => s.name.toLowerCase() === book.series.toLowerCase())
  if (match) setId.value = match.id
  else series.value = book.series
  if (book.volume) volumesText.value = String(book.volume)
  category.value = 'manga'
}

// ---------------------------------------------------------------- photo
const fileInput = ref<HTMLInputElement | null>(null)
async function onPhoto(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const compressed = await compressPhoto(file)
    if (photo.value) URL.revokeObjectURL(photo.value.url)
    photo.value = { ...compressed, url: URL.createObjectURL(compressed.blob) }
  } catch {
    toast.error("Couldn't read that photo.")
  }
}
function clearPhoto() {
  if (photo.value) URL.revokeObjectURL(photo.value.url)
  photo.value = null
}

// ---------------------------------------------------------------- check
async function check() {
  errors.value = {}
  failure.value = ''
  const askingCents = parseMoneyToCents(price.value)
  if (!description.value.trim()) errors.value.description = 'Say what it is, like "Naruto 1-10".'
  if (askingCents === null) errors.value.price = 'Enter the asking price, like 45.'
  if (parsedVolumes.value.errors.length) errors.value.volumes = parsedVolumes.value.errors[0]
  if (Object.keys(errors.value).length || askingCents === null) return

  checking.value = true
  result.value = null
  try {
    const volumes = parsedVolumes.value.volumes
    result.value = await checkDeal({
      description: description.value.trim(),
      template_id: setId.value || undefined,
      series: setId.value ? undefined : series.value.trim() || undefined,
      category: setId.value ? undefined : (category.value ?? undefined),
      volumes: volumes.length ? volumes : undefined,
      quantity: volumes.length ? undefined : quantity.value,
      condition: condition.value ? conditionLabels[condition.value] : undefined,
      asking_price_cents: askingCents,
      photo: photo.value
        ? {
            media_type: photo.value.type === 'image/webp' ? 'image/webp' : 'image/jpeg',
            data: await blobToBase64(photo.value.blob),
          }
        : undefined,
    })
  } catch (e) {
    failure.value = e instanceof Error ? e.message : "Couldn't check the deal."
  } finally {
    checking.value = false
  }
}

// ---------------------------------------------------------------- result
const verdictStyle = computed(() => {
  switch (result.value?.verdict.verdict) {
    case 'buy':
      return {
        label: 'Buy',
        icon: CircleCheck,
        tone: 'text-success border-success/50 bg-success/10',
      }
    case 'negotiate':
      return { label: 'Negotiate', icon: Handshake, tone: 'text-ink border-line bg-surface-2' }
    default:
      return { label: 'Pass', icon: CircleX, tone: 'text-danger border-danger/50 bg-danger/10' }
  }
})
const basisLabel = computed(() => {
  const r = result.value
  if (!r) return ''
  if (r.basis === 'set') return `our sales of ${setName.value ?? 'this set'}`
  if (r.basis === 'series') return `our sales of ${series.value || setName.value || 'this series'}`
  if (r.basis === 'category')
    return `all our ${categoryLabels[category.value ?? 'other'].toLowerCase()} sales`
  return 'no past sales at all'
})
const stats = computed(() => {
  const h = result.value?.history
  if (!h) return []
  const money = (c: number | null) => (c === null ? '—' : formatCents(c))
  return [
    { label: 'Past sales', value: String(h.sale_count) },
    { label: 'Avg sale per unit', value: money(h.avg_sale_price_per_unit_cents) },
    {
      label: 'Avg profit per unit',
      value:
        h.avg_net_profit_per_unit_cents === null
          ? '—'
          : formatSignedCents(h.avg_net_profit_per_unit_cents),
    },
    {
      label: 'Avg days to sell',
      value: h.avg_days_to_sell === null ? '—' : `${h.avg_days_to_sell}`,
    },
    { label: 'In stock now', value: String(h.units_in_stock) },
    {
      label: 'Sell-through',
      value: h.sell_through === null ? '—' : `${Math.round(h.sell_through * 100)}%`,
    },
  ]
})

function boughtIt() {
  if (setId.value) {
    void router.push({
      name: 'template-add-volumes',
      params: { id: setId.value },
      query: volumesText.value.trim() ? { v: formatRanges(parsedVolumes.value.volumes) } : {},
    })
    return
  }
  const cents = parseMoneyToCents(price.value)
  void router.push({
    name: 'item-new',
    query: {
      type: 'one_off',
      name: description.value.trim(),
      ...(cents !== null ? { cost: String(Math.round(cents / Math.max(quantity.value, 1))) } : {}),
      qty: String(quantity.value),
      ...(category.value ? { category: category.value } : {}),
      ...(condition.value ? { condition: condition.value } : {}),
    },
  })
}
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-5">
    <p class="text-ink-2">
      Tell it what's on offer. It compares the price with how similar stock has sold for
      <em>us</em>, and our target margin.
    </p>

    <form
      class="space-y-4 rounded-2xl border border-line bg-surface p-4"
      novalidate
      @submit.prevent="check"
    >
      <div class="flex items-end gap-2">
        <BaseInput
          v-model="description"
          class="min-w-0 flex-1"
          label="What is it?"
          placeholder="e.g. Naruto 1-10, Funko Pop Luffy"
          autocomplete="off"
          :error="errors.description"
        />
        <button
          type="button"
          class="grid size-11 shrink-0 place-items-center rounded-lg border-2 border-line bg-surface"
          :class="{ 'mb-6': errors.description }"
          aria-label="Scan an ISBN"
          @click="scannerOpen = true"
        >
          <ScanBarcode class="size-5" aria-hidden="true" />
        </button>
      </div>

      <BaseSelect
        v-model="setId"
        label="One of our sets? (optional)"
        placeholder="Not one of our sets"
        :options="setOptions"
      />

      <template v-if="!setId">
        <BaseInput
          v-model="series"
          label="Series (optional)"
          placeholder="e.g. Naruto"
          autocomplete="off"
        />
        <ChipSelect
          v-model="category"
          label="Category"
          clearable
          :options="itemCategories.map((c) => ({ value: c, label: categoryLabels[c] }))"
        />
      </template>

      <div class="grid gap-3 sm:grid-cols-2">
        <BaseInput
          v-model="volumesText"
          label="Volumes offered (optional)"
          placeholder="e.g. 1-12"
          inputmode="numeric"
          autocomplete="off"
          :error="errors.volumes"
          :hint="
            parsedVolumes.volumes.length
              ? `${parsedVolumes.volumes.length} volumes: ${formatRanges(parsedVolumes.volumes)}`
              : undefined
          "
        />
        <QuantityStepper v-if="!parsedVolumes.volumes.length" v-model="quantity" label="How many" />
      </div>

      <ChipSelect
        v-model="condition"
        label="Condition"
        clearable
        :options="itemConditions.map((c) => ({ value: c, label: conditionLabels[c] }))"
      />

      <BaseInput
        v-model="price"
        label="Asking price (whole deal)"
        prefix="$"
        inputmode="decimal"
        autocomplete="off"
        :error="errors.price"
      />

      <div class="flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="inline-flex min-h-11 items-center gap-2 rounded-lg border-2 border-line bg-surface px-3 text-sm font-semibold"
          @click="fileInput?.click()"
        >
          <Camera class="size-4" aria-hidden="true" />
          {{ photo ? 'Change photo' : 'Add a photo (optional)' }}
        </button>
        <span v-if="photo" class="relative">
          <img :src="photo.url" alt="Deal photo" class="size-14 rounded-lg object-cover" />
          <button
            type="button"
            class="absolute -top-2 -right-2 grid size-7 place-items-center rounded-full bg-ink text-bg"
            aria-label="Remove the photo"
            @click="clearPhoto"
          >
            <X class="size-4" aria-hidden="true" />
          </button>
        </span>
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          capture="environment"
          class="sr-only"
          tabindex="-1"
          aria-hidden="true"
          @change="onPhoto"
        />
      </div>

      <BaseButton type="submit" block :loading="checking">Check this deal</BaseButton>
      <p v-if="failure" class="text-sm text-danger" role="alert">{{ failure }}</p>
    </form>

    <!-- Verdict -->
    <section v-if="result" class="space-y-4" aria-live="polite" aria-label="Verdict">
      <div class="rounded-2xl border-2 p-5" :class="verdictStyle.tone">
        <div class="flex items-center gap-3">
          <component :is="verdictStyle.icon" class="size-10 shrink-0" aria-hidden="true" />
          <div>
            <p class="text-3xl font-black tracking-tight">{{ verdictStyle.label }}</p>
            <p class="font-semibold text-ink">
              Pay at most {{ formatCents(result.verdict.max_price_cents) }}
              <span class="font-normal text-ink-2"
                >for a {{ result.target_margin_percent }}% margin</span
              >
            </p>
          </div>
        </div>
        <p class="mt-3 text-ink">{{ result.verdict.reasoning }}</p>
      </div>

      <div class="rounded-2xl border border-line bg-surface p-4">
        <p class="flex flex-wrap items-center gap-2 text-sm">
          <span
            class="rounded-full px-2.5 py-0.5 font-semibold"
            :class="
              result.verdict.confidence === 'low'
                ? 'bg-danger/15 text-danger'
                : 'bg-surface-2 text-ink'
            "
            >{{
              result.verdict.confidence[0]?.toUpperCase() + result.verdict.confidence.slice(1)
            }}
            confidence</span
          >
          <span class="text-ink-2"
            >Based only on {{ basisLabel }}, not market prices.<template
              v-if="result.history.sale_count < 3"
            >
              With fewer than 3 past sales, treat this as a rough guide.</template
            ></span
          >
        </p>
        <dl class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div v-for="s in stats" :key="s.label" class="rounded-xl bg-surface-2 p-3">
            <dt class="text-xs text-ink-2">{{ s.label }}</dt>
            <dd class="text-lg font-bold tabular-nums">{{ s.value }}</dd>
          </div>
        </dl>
        <p v-if="result.formula_max_price_cents !== null" class="mt-3 text-sm text-ink-2">
          By the numbers alone: {{ result.units }} unit{{ result.units === 1 ? '' : 's' }} keeping
          about {{ formatCents(result.history.avg_kept_per_unit_cents ?? 0) }} each after fees and
          shipping, so up to {{ formatCents(result.formula_max_price_cents) }} hits the margin.
        </p>
      </div>

      <div v-if="result.offered" class="rounded-2xl border border-line bg-surface p-4 text-sm">
        <h2 class="mb-2 font-bold">Against our {{ setName }}</h2>
        <p v-if="result.offered.fills_gaps.length">
          <span class="font-semibold text-success">Fills gaps:</span>
          {{ formatRanges(result.offered.fills_gaps) }}
        </p>
        <p v-if="result.offered.duplicates.length">
          <span class="font-semibold text-danger">Already have:</span>
          {{ formatRanges(result.offered.duplicates) }}
        </p>
        <p v-if="result.offered.beyond_total.length">
          <span class="font-semibold">Past the set's last volume:</span>
          {{ formatRanges(result.offered.beyond_total) }}
        </p>
      </div>

      <BaseButton block variant="secondary" @click="boughtIt">
        <PackagePlus class="size-4" aria-hidden="true" /> Bought it, add to inventory
      </BaseButton>
    </section>

    <ScannerSheet v-model:open="scannerOpen" @isbn="onIsbn" />
  </div>
</template>
