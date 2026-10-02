import { computed, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { parseFeeRules, type FeeRule, type FeeRules } from '@/lib/fees'
import type { Json } from '@/types/database'
import type { SalesPlatform } from '@/types/inventory'

// Shared, loaded once per visit (Settings, in step 8, refreshes it after saving).
const values = ref<Record<string, Json>>({})
let loading: Promise<void> | null = null

async function fetchSettings() {
  const { data } = await supabase.from('app_settings').select('key, value')
  values.value = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))
}

/** Fee rules, the default platform and thresholds from app_settings. */
export function useAppSettings() {
  loading ??= fetchSettings()

  const feeRules = computed<FeeRules>(() => parseFeeRules(values.value.fee_rules))
  const defaultPlatform = computed<SalesPlatform>(() => {
    const v = values.value.default_platform
    return typeof v === 'string' ? (v as SalesPlatform) : 'ebay'
  })
  const defaultFeePercent = computed(() => {
    const v = values.value.default_fee_percent
    return typeof v === 'number' ? v : Number(v) || 13
  })
  /** The fee rule for the default platform, or the default percent if there isn't one. */
  const defaultFeeRule = computed<FeeRule>(
    () =>
      feeRules.value[defaultPlatform.value] ?? { percent: defaultFeePercent.value, fixed_cents: 0 },
  )

  const staleDays = computed(() => Number(values.value.stale_days) || 60)
  const targetMarginPercent = computed(() => Number(values.value.target_margin_percent) || 40)

  /** Saves settings (upsert by key) and refreshes everyone's copy. */
  async function save(changes: Record<string, Json>) {
    const rows = Object.entries(changes).map(([key, value]) => ({ key, value }))
    const { error } = await supabase.from('app_settings').upsert(rows, { onConflict: 'key' })
    if (error) throw error
    await reload()
  }

  async function reload() {
    loading = fetchSettings()
    await loading
  }

  return {
    ready: loading,
    values,
    feeRules,
    defaultPlatform,
    defaultFeePercent,
    defaultFeeRule,
    staleDays,
    targetMarginPercent,
    save,
    reload,
  }
}
