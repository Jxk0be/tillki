<script setup lang="ts">
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import type { ChartData, ChartOptions } from 'chart.js'
import { baseOptions, useChartTheme, withAlpha } from '@/composables/useChartTheme'
import type { AgingBucket } from '@/composables/useDashboard'
import { formatCents } from '@/lib/money'

/**
 * How long in-stock and listed items have been sitting. Tapping a bar (or the
 * button under it, for keyboards) opens the inventory filtered to that bucket.
 */
const props = defineProps<{ buckets: AgingBucket[] }>()
const emit = defineEmits<{ select: [bucket: AgingBucket] }>()
const { theme, key } = useChartTheme()

const label = (b: AgingBucket) =>
  b.max_days === null ? `${b.min_days - 1}+ days` : `${b.bucket} days`

const data = computed<ChartData<'bar'>>(() => {
  const t = theme.value
  // Older buckets get warmer colors.
  const colors = [t.series[2], t.series[3], t.series[1], t.danger]
  return {
    labels: props.buckets.map(label),
    datasets: [
      {
        label: 'Items',
        data: props.buckets.map((b) => b.item_count),
        backgroundColor: props.buckets.map((_, i) => withAlpha(colors[i] ?? t.muted, 0.8)),
        borderRadius: 4,
        maxBarThickness: 56,
      },
    ],
  }
})

const options = computed<ChartOptions<'bar'>>(() => {
  const base = baseOptions<'bar'>(theme.value, { moneyAxis: null, legend: false })
  return {
    ...base,
    interaction: { mode: 'index', intersect: false },
    onClick: (_event, _elements, chart) => {
      const index = chart.tooltip?.dataPoints?.[0]?.dataIndex
      const b = index === undefined ? undefined : props.buckets[index]
      if (b) emit('select', b)
    },
    plugins: {
      ...base.plugins,
      tooltip: {
        ...base.plugins?.tooltip,
        callbacks: {
          label: (item) => {
            const b = props.buckets[item.dataIndex]
            return b
              ? [`${b.item_count} items (${b.units} copies)`, `Cost ${formatCents(b.cost_cents)}`]
              : ''
          },
          footer: () => 'Tap to see them',
        },
      },
    },
  }
})
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="relative min-h-0 flex-1">
      <Bar :key="key" :data="data" :options="options" aria-label="Items by days in stock" />
    </div>
    <div class="mt-2 grid grid-cols-4 gap-1">
      <button
        v-for="b in buckets"
        :key="b.bucket"
        type="button"
        class="min-h-11 rounded-lg px-1 text-xs font-semibold text-primary hover:bg-surface-2"
        :aria-label="`Show the ${b.item_count} items in stock ${label(b)}`"
        @click="emit('select', b)"
      >
        {{ b.item_count }} items<br /><span class="font-normal text-ink-2">{{
          formatCents(b.cost_cents)
        }}</span>
      </button>
    </div>
  </div>
</template>
