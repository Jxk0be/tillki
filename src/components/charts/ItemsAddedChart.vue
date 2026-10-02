<script setup lang="ts">
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import type { ChartData, ChartOptions } from 'chart.js'
import { baseOptions, useChartTheme, withAlpha } from '@/composables/useChartTheme'
import type { AddedRow } from '@/composables/useDashboard'
import { monthLabels, shortDay } from '@/lib/dateRange'

/** Items entered per week (or month), stacked by who entered them. */
const props = defineProps<{ rows: AddedRow[]; grain: 'week' | 'month' }>()
const { theme, key } = useChartTheme()

const periods = computed(() => [...new Set(props.rows.map((r) => r.period))].sort())
const people = computed(() => [...new Set(props.rows.map((r) => r.added_by))].sort())

const data = computed<ChartData<'bar'>>(() => {
  const t = theme.value
  const counts = new Map(props.rows.map((r) => [`${r.period}|${r.added_by}`, r.item_count]))
  return {
    labels:
      props.grain === 'month' ? monthLabels(periods.value) : periods.value.map((p) => shortDay(p)),
    datasets: people.value.map((who, i) => ({
      label: who,
      data: periods.value.map((p) => counts.get(`${p}|${who}`) ?? 0),
      backgroundColor: withAlpha(t.series[i % 7] ?? t.ink, 0.8),
      borderRadius: 3,
      maxBarThickness: 28,
    })),
  }
})

const options = computed<ChartOptions<'bar'>>(() => {
  const base = baseOptions<'bar'>(theme.value, { moneyAxis: null, stacked: true })
  return {
    ...base,
    plugins: {
      ...base.plugins,
      tooltip: {
        ...base.plugins?.tooltip,
        callbacks: {
          title: (items) => {
            const p = periods.value[items[0]?.dataIndex ?? -1]
            if (!p) return ''
            return props.grain === 'week' ? `Week of ${shortDay(p)}` : (monthLabels([p])[0] ?? '')
          },
        },
      },
    },
  }
})
</script>

<template>
  <Bar :key="key" :data="data" :options="options" aria-label="Items added over time, by person" />
</template>
