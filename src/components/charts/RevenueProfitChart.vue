<script setup lang="ts">
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import type { ChartData, ChartDataset } from 'chart.js'
import { baseOptions, useChartTheme, withAlpha } from '@/composables/useChartTheme'
import type { PnlMonth } from '@/composables/useDashboard'
import { monthLabels } from '@/lib/dateRange'

/** Revenue bars per month, with sales profit and profit after expenses as lines. */
const props = defineProps<{ months: PnlMonth[] }>()
const { theme, key } = useChartTheme()

// Bar charts accept line datasets at runtime; Chart.js's types just don't model mixing.
const asBar = (d: ChartDataset<'line'>) => d as unknown as ChartDataset<'bar'>

const data = computed<ChartData<'bar'>>(() => {
  const t = theme.value
  return {
    labels: monthLabels(props.months.map((m) => m.month)),
    datasets: [
      asBar({
        type: 'line',
        label: 'Sales profit',
        data: props.months.map((m) => m.sales_profit_cents),
        borderColor: t.success,
        backgroundColor: t.success,
        pointRadius: 3,
        tension: 0.25,
        order: 0,
      }),
      asBar({
        type: 'line',
        label: 'After expenses',
        data: props.months.map((m) => m.net_profit_cents),
        borderColor: t.series[1],
        backgroundColor: t.series[1],
        borderDash: [6, 4],
        pointRadius: 3,
        pointStyle: 'rectRot',
        tension: 0.25,
        order: 1,
      }),
      {
        label: 'Revenue',
        data: props.months.map((m) => m.revenue_cents),
        backgroundColor: withAlpha(t.series[0] ?? t.ink, 0.75),
        borderRadius: 4,
        maxBarThickness: 36,
        order: 2,
      },
    ],
  }
})
const options = computed(() => baseOptions<'bar'>(theme.value))
</script>

<template>
  <Bar :key="key" :data="data" :options="options" aria-label="Revenue and profit by month" />
</template>
