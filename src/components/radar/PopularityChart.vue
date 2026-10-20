<script setup lang="ts">
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import type { ChartData } from 'chart.js'
import { baseOptions, useChartTheme, withAlpha } from '@/composables/useChartTheme'
import { shortDay } from '@/lib/dateRange'

/** AniList popularity over the snapshot history (people who have the series on their lists). */
const props = defineProps<{
  history: { captured_on: string; popularity: number | null }[]
}>()
const { theme, key } = useChartTheme()

const data = computed<ChartData<'line'>>(() => {
  const t = theme.value
  return {
    labels: props.history.map((h) => shortDay(h.captured_on)),
    datasets: [
      {
        label: 'Popularity',
        data: props.history.map((h) => h.popularity),
        borderColor: t.series[0],
        backgroundColor: withAlpha(t.series[0] ?? t.ink, 0.12),
        fill: true,
        pointRadius: props.history.length < 3 ? 3 : 0,
        pointHitRadius: 8,
        tension: 0.2,
      },
    ],
  }
})

const options = computed(() => {
  const o = baseOptions<'line'>(theme.value, { moneyAxis: null, legend: false })
  const x = o.scales?.x
  if (x?.ticks) x.ticks = { ...x.ticks, maxTicksLimit: 6 }
  return o
})
</script>

<template>
  <div class="h-40">
    <Line :key="key" :data="data" :options="options" aria-label="AniList popularity over time" />
  </div>
</template>
