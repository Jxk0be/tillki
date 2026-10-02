<script setup lang="ts">
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import type { ChartData } from 'chart.js'
import { baseOptions, useChartTheme, withAlpha } from '@/composables/useChartTheme'
import type { SpendMonth } from '@/composables/useDashboard'
import { monthLabels } from '@/lib/dateRange'

/** Money in (revenue) next to money out (stock bought + expenses, stacked) per month. */
const props = defineProps<{ months: SpendMonth[] }>()
const { theme, key } = useChartTheme()

const data = computed<ChartData<'bar'>>(() => {
  const t = theme.value
  return {
    labels: monthLabels(props.months.map((m) => m.month)),
    datasets: [
      {
        label: 'Money in (revenue)',
        data: props.months.map((m) => m.revenue_cents),
        backgroundColor: withAlpha(t.success, 0.8),
        stack: 'in',
        borderRadius: 4,
        maxBarThickness: 28,
      },
      {
        label: 'Stock bought',
        data: props.months.map((m) => m.purchased_cents),
        backgroundColor: withAlpha(t.series[1] ?? t.danger, 0.8),
        stack: 'out',
        maxBarThickness: 28,
      },
      {
        label: 'Expenses',
        data: props.months.map((m) => m.expenses_cents),
        backgroundColor: withAlpha(t.series[3] ?? t.muted, 0.8),
        stack: 'out',
        borderRadius: 4,
        maxBarThickness: 28,
      },
    ],
  }
})
const options = computed(() => baseOptions<'bar'>(theme.value, { stacked: true }))
</script>

<template>
  <Bar :key="key" :data="data" :options="options" aria-label="Money in and money out by month" />
</template>
