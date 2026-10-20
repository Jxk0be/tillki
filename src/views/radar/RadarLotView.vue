<script setup lang="ts">
import { computed, onMounted, ref, type Component } from 'vue'
import { useRouter } from 'vue-router'
import {
  CircleCheck,
  CircleHelp,
  CircleX,
  CircleAlert,
  Plus,
  ScanBarcode,
  Trash2,
} from 'lucide-vue-next'
import ScannerSheet from '@/components/inventory/ScannerSheet.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import { useAppSettings } from '@/composables/useAppSettings'
import { lookupIsbn } from '@/composables/useBookLookup'
import { findByIsbn, loadLotContexts } from '@/composables/useRadar'
import { useToast } from '@/composables/useToast'
import { conditionLabels, itemConditions } from '@/lib/labels'
import {
  checkLot,
  splitAsking,
  type LotLine,
  type LotSetContext,
  type LotVerdict,
} from '@/lib/lotCheck'
import { formatCents, parseMoneyToCents } from '@/lib/money'
import { actionLabels } from '@/lib/radar'
import { formatRanges, parseVolumeInput } from '@/lib/volumes'
import type { ItemCondition } from '@/types/inventory'

/** At a sale: list the volumes in a lot, enter the asking price, get buy / fair / pass and a max price. */
const router = useRouter()
const toast = useToast()
const settings = useAppSettings()

const contexts = ref<LotSetContext[]>([])
const loading = ref(true)
const error = ref('')
const lines = ref<LotLine[]>([])

onMounted(async () => {
  try {
    await settings.ready
    contexts.value = await loadLotContexts()
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Couldn't load your sets."
  } finally {
    loading.value = false
  }
})

// ---------------------------------------------------------------- adding volumes
const setId = ref('')
const volumesText = ref('')
const volumesError = ref('')
const setOptions = computed(() =>
  contexts.value.map((c) => ({ value: c.template_id, label: c.name })),
)

function addVolumes(templateId: string, volumes: number[]) {
  const existing = lines.value.find((l) => l.template_id === templateId)
  if (existing)
    existing.volumes = [...new Set([...existing.volumes, ...volumes])].sort((a, b) => a - b)
  else lines.value.push({ template_id: templateId, volumes: [...volumes].sort((a, b) => a - b) })
}

function addLine() {
  volumesError.value = ''
  if (!setId.value) {
    volumesError.value = 'Pick a set first.'
    return
  }
  const parsed = parseVolumeInput(volumesText.value)
  if (parsed.errors.length || parsed.volumes.length === 0) {
    volumesError.value = parsed.errors[0] ?? 'Enter volumes like 1-12 or 1, 3, 5.'
    return
  }
  addVolumes(setId.value, parsed.volumes)
  volumesText.value = ''
}

function removeLine(templateId: string) {
  lines.value = lines.value.filter((l) => l.template_id !== templateId)
}

const nameOf = (id: string) => contexts.value.find((c) => c.template_id === id)?.name ?? 'Set'

// ---------------------------------------------------------------- scanning
const scannerOpen = ref(false)
const simplify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

async function onIsbn(isbn: string) {
  try {
    const known = await findByIsbn(isbn)
    if (known) {
      addVolumes(known.template_id, [known.volume_number])
      toast.success(`Added ${nameOf(known.template_id)} vol ${known.volume_number}.`)
      return
    }
    const info = await lookupIsbn(isbn)
    const match = info
      ? contexts.value.find((c) => simplify(c.name) === simplify(info.series))
      : undefined
    if (info && match && info.volume) {
      addVolumes(match.template_id, [info.volume])
      toast.success(`Added ${match.name} vol ${info.volume}.`)
    } else if (info) {
      toast.error(`"${info.title}" isn't one of your sets yet. Add it by hand below.`)
    } else {
      toast.error("Couldn't find that ISBN. Add the volumes by hand below.")
    }
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Couldn't look up that ISBN.")
  }
}

// ---------------------------------------------------------------- price and result
const askingText = ref('')
const condition = ref<ItemCondition | ''>('')
const askingCents = computed(() => parseMoneyToCents(askingText.value))
const conditionOptions = itemConditions.map((c) => ({ value: c, label: conditionLabels[c] }))

const result = computed(() =>
  lines.value.length && askingCents.value !== null
    ? checkLot(
        lines.value,
        contexts.value,
        askingCents.value,
        settings.targetMarginPercent.value,
        settings.defaultFeeRule.value,
      )
    : null,
)

const verdictText: Record<LotVerdict, string> = {
  good: 'Good buy',
  fair: 'Fair',
  pass: 'Pass',
  unknown: 'Not enough data',
}
const verdictIcon: Record<LotVerdict, Component> = {
  good: CircleCheck,
  fair: CircleAlert,
  pass: CircleX,
  unknown: CircleHelp,
}
const verdictClass: Record<LotVerdict, string> = {
  good: 'border-success bg-success/10',
  fair: 'border-accent bg-accent/10',
  pass: 'border-danger bg-danger/10',
  unknown: 'border-line bg-surface-2',
}

const shares = computed(() =>
  result.value && askingCents.value !== null
    ? splitAsking(askingCents.value, result.value.sets)
    : [],
)

function buy(index: number) {
  const s = result.value?.sets[index]
  if (!s) return
  void router.push({
    name: 'template-add-volumes',
    params: { id: s.template_id },
    query: {
      v: formatRanges(s.volumes),
      total: String(shares.value[index] ?? 0),
      ...(condition.value ? { condition: condition.value } : {}),
    },
  })
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-4">
    <RouterLink :to="{ name: 'radar' }" class="text-sm font-semibold text-ink-2 hover:underline"
      >Buy Radar</RouterLink
    >
    <p class="text-ink-2">
      List what's in the lot and what they want for it. The verdict uses your own sale prices and
      any eBay prices Radar has collected, after
      {{ settings.defaultFeeRule.value.percent }}% fees, against your
      {{ settings.targetMarginPercent.value }}% target margin (change it in Settings).
    </p>

    <p
      v-if="error"
      class="rounded-xl border border-danger/40 bg-danger/10 p-3 text-danger"
      role="alert"
    >
      {{ error }}
    </p>
    <div v-else-if="loading" class="h-40 animate-pulse rounded-2xl bg-surface-2" aria-busy="true" />

    <template v-else>
      <!-- What's in the lot -->
      <section
        class="space-y-3 rounded-2xl border border-line bg-surface p-4"
        aria-labelledby="lot-heading"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 id="lot-heading" class="font-bold">What's in the lot</h3>
          <BaseButton size="sm" variant="secondary" @click="scannerOpen = true">
            <ScanBarcode class="size-4" aria-hidden="true" /> Scan a book
          </BaseButton>
        </div>

        <form
          class="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end"
          novalidate
          @submit.prevent="addLine"
        >
          <BaseSelect v-model="setId" label="Set" placeholder="Pick a set" :options="setOptions" />
          <BaseInput
            v-model="volumesText"
            label="Volumes"
            placeholder="1-12"
            :error="volumesError"
          />
          <BaseButton type="submit" variant="secondary">
            <Plus class="size-4" aria-hidden="true" /> Add
          </BaseButton>
        </form>
        <p class="text-xs text-ink-2">
          Not one of your sets yet? Create the set first, then check the lot.
        </p>

        <ul v-if="lines.length" class="divide-y divide-line rounded-xl border border-line">
          <li
            v-for="l in lines"
            :key="l.template_id"
            class="flex items-center justify-between gap-2 px-3 py-1"
          >
            <span class="min-w-0">
              <span class="font-medium break-words">{{ nameOf(l.template_id) }}</span>
              <span class="text-sm text-ink-2"> · {{ formatRanges(l.volumes) }}</span>
            </span>
            <button
              type="button"
              class="grid size-11 shrink-0 place-items-center rounded-full hover:bg-surface-2"
              :aria-label="`Remove ${nameOf(l.template_id)}`"
              @click="removeLine(l.template_id)"
            >
              <Trash2 class="size-4" aria-hidden="true" />
            </button>
          </li>
        </ul>

        <div class="grid gap-3 sm:grid-cols-2">
          <BaseInput
            v-model="askingText"
            label="Asking price for the whole lot"
            prefix="$"
            inputmode="decimal"
          />
          <BaseSelect
            v-model="condition"
            label="Condition (optional)"
            placeholder="Not set"
            :options="conditionOptions"
          />
        </div>
      </section>

      <!-- Result -->
      <section v-if="result" class="space-y-3" aria-live="polite" aria-labelledby="verdict-heading">
        <div class="rounded-2xl border-2 p-4" :class="verdictClass[result.verdict]">
          <h3 id="verdict-heading" class="flex items-center gap-2 text-xl font-black">
            <component :is="verdictIcon[result.verdict]" class="size-6" aria-hidden="true" />
            {{ verdictText[result.verdict] }}
          </h3>
          <p v-if="result.verdict === 'unknown'" class="mt-1 text-sm">
            None of these sets has sales or eBay prices yet, so there's nothing to price the lot
            against. Use the scores below as a guide.
          </p>
          <template v-else>
            <p class="mt-1 text-lg">
              Pay up to
              <strong class="tabular-nums">{{ formatCents(result.max_price_cents ?? 0) }}</strong>
              to hit {{ settings.targetMarginPercent.value }}%.
            </p>
            <dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <dt class="text-xs text-ink-2">Expected resale</dt>
                <dd class="tabular-nums">{{ formatCents(result.expected_resale_cents) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-ink-2">Kept after fees</dt>
                <dd class="tabular-nums">{{ formatCents(result.expected_keep_cents) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-ink-2">Profit at asking</dt>
                <dd class="tabular-nums">{{ formatCents(result.profit_cents ?? 0) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-ink-2">Margin</dt>
                <dd class="tabular-nums">{{ result.margin_percent }}%</dd>
              </div>
            </dl>
            <p v-if="result.priced_books < result.books" class="mt-2 text-xs text-ink-2">
              Priced {{ result.priced_books }} of {{ result.books }} books. The rest have no price
              data, so they're extra upside. Shipping costs aren't included.
            </p>
          </template>
        </div>

        <ul class="space-y-2">
          <li
            v-for="(s, i) in result.sets"
            :key="s.template_id"
            class="space-y-2 rounded-2xl border border-line bg-surface p-4"
          >
            <div class="flex flex-wrap items-baseline justify-between gap-x-3">
              <span class="font-semibold break-words"
                >{{ s.name }} · {{ formatRanges(s.volumes) }}</span
              >
              <span v-if="s.score !== null" class="text-sm tabular-nums"
                >Score {{ s.score
                }}<template v-if="s.action"> · {{ actionLabels[s.action] }}</template></span
              >
            </div>
            <ul class="space-y-0.5 text-sm">
              <li v-if="s.completes_set" class="font-semibold">Completes the set</li>
              <li v-else-if="s.fills_gaps.length">Fills gaps: {{ formatRanges(s.fills_gaps) }}</li>
              <li v-if="s.duplicates.length">
                Already have {{ formatRanges(s.duplicates) }} (adds copies)
              </li>
              <li>
                <template v-if="s.unit_resale_cents !== null">
                  About {{ formatCents(s.unit_resale_cents) }} each ({{ s.basis }})
                </template>
                <span v-else class="text-ink-2">No price data for this set</span>
              </li>
            </ul>
            <BaseButton size="sm" variant="secondary" @click="buy(i)">
              Buy and add these volumes
              <span v-if="result.sets.length > 1" class="tabular-nums">
                ({{ formatCents(shares[i] ?? 0) }} share)</span
              >
            </BaseButton>
          </li>
        </ul>
      </section>
      <p v-else-if="lines.length" class="text-sm text-ink-2">
        Enter the asking price to see the verdict.
      </p>
    </template>

    <ScannerSheet v-model:open="scannerOpen" @isbn="onIsbn" />
  </div>
</template>
