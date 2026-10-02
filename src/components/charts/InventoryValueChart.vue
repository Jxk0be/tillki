<script setup lang="ts">
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import type { ChartData } from 'chart.js'
import { baseOptions, useChartTheme, withAlpha } from '@/composables/useChartTheme'
import type { Snapshot } from '@/composables/useDashboard'
import { shortDay } from '@/lib/dateRange'

/** Stock on the shelves over time: what it cost us vs what we're asking. */
const props = defineProps<{ snapshots: Snapshot[] }>()
const { theme, key } = useChartTheme()

const data = computed<ChartData<'line'>>(() => {
  const t = theme.value
  return {
    labels: props.snapshots.map((s) => shortDay(s.snapshot_date)),
    datasets: [
      {
        label: 'Asking value',
        data: props.snapshots.map((s) => s.list_value_cents),
        borderColor: t.series[0],
        backgroundColor: withAlpha(t.series[0] ?? t.ink, 0.12),
        fill: true,
        pointRadius: 0,
        pointHitRadius: 8,
        tension: 0.2,
      },
      {
        label: 'Cost basis',
        data: props.snapshots.map((s) => s.cost_basis_cents),
        borderColor: t.series[3],
        backgroundColor: withAlpha(t.series[3] ?? t.muted, 0.15),
        borderDash: [6, 4],
        fill: true,
        pointRadius: 0,
        pointHitRadius: 8,
        tension: 0.2,
      },
    ],
  }
})

const options = computed(() => {
  const o = baseOptions<'line'>(theme.value)
  const x = o.scales?.x
  if (x?.ticks) x.ticks = { ...x.ticks, maxTicksLimit: 7 }
  return o
})
</script>

<template>
  <Line :key="key" :data="data" :options="options" aria-label="Inventory value over time" />
</template>
