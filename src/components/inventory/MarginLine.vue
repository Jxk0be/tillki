<script setup lang="ts">
import { computed } from 'vue'
import { calculateMargin, type FeeRule } from '@/lib/fees'
import { formatCents, formatSignedCents } from '@/lib/money'
import { platformLabels } from '@/lib/labels'
import type { SalesPlatform } from '@/types/inventory'

/** "After ~13.6% + $0.40 eBay fees you'd keep $X, profit $Y (Z%)". */
const props = defineProps<{
  priceCents: number | null
  costCents: number | null
  rule: FeeRule
  platform: SalesPlatform
}>()

const margin = computed(() =>
  props.priceCents === null || props.priceCents <= 0
    ? null
    : calculateMargin(props.priceCents, props.costCents ?? 0, props.rule),
)
const feeText = computed(() => {
  const parts = [`~${props.rule.percent}%`]
  if (props.rule.fixed_cents) parts.push(formatCents(props.rule.fixed_cents))
  return `${parts.join(' + ')} ${platformLabels[props.platform]} fees`
})
</script>

<template>
  <p v-if="margin" class="rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-2" aria-live="polite">
    After {{ feeText }} you'd keep
    <span class="font-semibold text-ink">{{ formatCents(margin.keepCents) }}</span
    >, profit
    <span class="font-semibold" :class="margin.profitCents >= 0 ? 'text-success' : 'text-danger'"
      >{{ formatSignedCents(margin.profitCents)
      }}<template v-if="margin.marginPercent !== null">
        ({{ margin.marginPercent }}%)</template
      ></span
    >
    <template v-if="costCents === null">, before what you paid</template>.
  </p>
</template>
