<script setup lang="ts">
import { onMounted, ref } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import ThemeToggle from '@/components/ui/ThemeToggle.vue'
import { Download } from 'lucide-vue-next'
import { useAppSettings } from '@/composables/useAppSettings'
import { exportEverything, useBackupStatus } from '@/composables/useBackup'
import { notifyDataChanged } from '@/composables/useDataChanged'
import { useToast } from '@/composables/useToast'
import { formatDateTime } from '@/lib/dates'
import { platformLabels } from '@/lib/labels'
import { parseMoneyToCents } from '@/lib/money'
import type { Json } from '@/types/database'
import type { SalesPlatform } from '@/types/inventory'

const settings = useAppSettings()
const toast = useToast()
const platforms = Object.keys(platformLabels) as SalesPlatform[]

const rules = ref<Record<SalesPlatform, { percent: string; fixed: string }>>(
  Object.fromEntries(platforms.map((p) => [p, { percent: '0', fixed: '0.00' }])) as Record<
    SalesPlatform,
    { percent: string; fixed: string }
  >,
)
const defaultPlatform = ref<SalesPlatform>('ebay')
const staleDays = ref('60')
const targetMargin = ref('40')
const defaultFeePercent = ref('13')
const errors = ref<Record<string, string>>({})
const saving = ref(false)
const loaded = ref(false)

onMounted(async () => {
  await settings.reload()
  for (const p of platforms) {
    const rule = settings.feeRules.value[p]
    rules.value[p] = {
      percent: String(rule?.percent ?? 0),
      fixed: ((rule?.fixed_cents ?? 0) / 100).toFixed(2),
    }
  }
  defaultPlatform.value = settings.defaultPlatform.value
  staleDays.value = String(settings.staleDays.value)
  targetMargin.value = String(settings.targetMarginPercent.value)
  defaultFeePercent.value = String(settings.defaultFeePercent.value)
  loaded.value = true
})

const isPercent = (v: string) => /^\d+(\.\d+)?$/.test(v.trim()) && Number(v) <= 100

async function save() {
  errors.value = {}
  const platformRules: Record<string, Json> = {}
  for (const p of platforms) {
    const r = rules.value[p]
    const fixed = parseMoneyToCents(r.fixed || '0')
    if (!isPercent(r.percent))
      errors.value[`${p}-percent`] = 'Use a percent from 0 to 100, like 13.6.'
    if (fixed === null) errors.value[`${p}-fixed`] = 'Use an amount like 0.40.'
    platformRules[p] = { percent: Number(r.percent), fixed_cents: fixed ?? 0 }
  }
  if (!/^\d+$/.test(staleDays.value.trim()) || Number(staleDays.value) < 1)
    errors.value.stale = 'Use a whole number of days.'
  if (!isPercent(targetMargin.value)) errors.value.margin = 'Use a percent from 0 to 100.'
  if (!isPercent(defaultFeePercent.value)) errors.value.feePercent = 'Use a percent from 0 to 100.'
  if (Object.keys(errors.value).length) {
    toast.error('Check the highlighted settings.')
    return
  }

  saving.value = true
  try {
    await settings.save({
      fee_rules: {
        note: 'Editable defaults. Check each platform’s current fees and update these in Settings.',
        platforms: platformRules,
      },
      default_platform: defaultPlatform.value,
      stale_days: Number(staleDays.value),
      target_margin_percent: Number(targetMargin.value),
      default_fee_percent: Number(defaultFeePercent.value),
    })
    notifyDataChanged()
    toast.success('Settings saved.')
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Couldn't save settings.")
  } finally {
    saving.value = false
  }
}

const platformOptions = platforms.map((p) => ({ value: p, label: platformLabels[p] }))

// ---------------------------------------------------------------- backup
const backup = useBackupStatus()
const exporting = ref<string | null>(null)
async function runExport() {
  exporting.value = 'starting'
  try {
    const rows = await exportEverything((table) => (exporting.value = table))
    toast.success(`Exported ${rows} rows. Keep the zip somewhere safe.`)
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Couldn't export.")
  } finally {
    exporting.value = null
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-6 lg:mx-0">
    <section class="rounded-2xl border border-line bg-surface p-4 lg:p-6">
      <h2 class="mb-4 text-lg font-bold">Appearance</h2>
      <ThemeToggle />
    </section>

    <section
      class="rounded-2xl border border-line bg-surface p-4 lg:p-6"
      aria-labelledby="backup-heading"
    >
      <h2 id="backup-heading" class="text-lg font-bold">Backup</h2>
      <p class="mt-1 text-sm text-ink-2">
        Downloads a zip with a spreadsheet (CSV) and a JSON file for every table: items, sets,
        sales, expenses, lots and history. Do this once a month and keep it somewhere safe.
      </p>
      <p class="mt-2 text-sm">
        Last export:
        <strong>{{
          backup.lastExportAt.value ? formatDateTime(backup.lastExportAt.value) : 'never'
        }}</strong>
        <span v-if="backup.due.value" class="text-danger"> · time for a new one</span>
      </p>
      <BaseButton class="mt-3" :loading="exporting !== null" @click="runExport">
        <Download class="size-4" aria-hidden="true" />
        {{ exporting ? `Exporting ${exporting}…` : 'Export everything' }}
      </BaseButton>
    </section>

    <form class="space-y-6" novalidate @submit.prevent="save">
      <section
        class="rounded-2xl border border-line bg-surface p-4 lg:p-6"
        aria-labelledby="fees-heading"
      >
        <h2 id="fees-heading" class="text-lg font-bold">Platform fees</h2>
        <p class="mt-1 mb-4 text-sm text-ink-2">
          Used to estimate fees when you mark something sold. These are starting guesses; check each
          platform's current fees. You can always type the real fee on a sale.
        </p>
        <div v-if="loaded" class="space-y-3">
          <div
            v-for="p in platforms"
            :key="p"
            class="grid grid-cols-[1fr_6rem_7rem] items-start gap-2 sm:grid-cols-[12rem_7rem_8rem]"
          >
            <p class="pt-3 font-medium">{{ platformLabels[p] }}</p>
            <BaseInput
              v-model="rules[p].percent"
              :label="`${platformLabels[p]} percent`"
              hide-label
              inputmode="decimal"
              prefix="%"
              :error="errors[`${p}-percent`]"
            />
            <BaseInput
              v-model="rules[p].fixed"
              :label="`${platformLabels[p]} fixed fee`"
              hide-label
              inputmode="decimal"
              prefix="+$"
              :error="errors[`${p}-fixed`]"
            />
          </div>
        </div>
        <div v-else class="h-40 animate-pulse rounded-xl bg-surface-2" aria-busy="true" />
      </section>

      <section
        class="space-y-4 rounded-2xl border border-line bg-surface p-4 lg:p-6"
        aria-labelledby="defaults-heading"
      >
        <h2 id="defaults-heading" class="text-lg font-bold">Defaults and thresholds</h2>
        <BaseSelect
          v-model="defaultPlatform"
          label="Default platform"
          hint="Used for the fee estimate on the add-item form, and preselected when you mark something sold for the first time."
          :options="platformOptions"
        />
        <div class="grid gap-4 sm:grid-cols-3">
          <BaseInput
            v-model="staleDays"
            label="Stale after (days)"
            inputmode="numeric"
            :error="errors.stale"
          />
          <BaseInput
            v-model="targetMargin"
            label="Target margin %"
            inputmode="decimal"
            :error="errors.margin"
          />
          <BaseInput
            v-model="defaultFeePercent"
            label="Fallback fee %"
            inputmode="decimal"
            hint="For est. profit in lists"
            :error="errors.feePercent"
          />
        </div>
      </section>

      <div class="flex justify-end">
        <BaseButton type="submit" :loading="saving" :disabled="!loaded">Save settings</BaseButton>
      </div>
    </form>
  </div>
</template>
