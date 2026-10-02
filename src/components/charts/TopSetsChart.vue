<script setup lang="ts">
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import type { ChartData, ChartOptions } from 'chart.js'
import { baseOptions, useChartTheme, withAlpha } from '@/composables/useChartTheme'
import type { SetRow } from '@/composables/useDashboard'
import { formatSignedCents } from '@/lib/money'

/** Sets and series ranked by net profit, as horizontal bars. */
const props = defineProps<{ rows: SetRow[] }>()
const { theme, key } = useChartTheme()

const shorten = (s: string) => (s.length > 22 ? `${s.slice(0, 21)}…` : s)

const data = computed<ChartData<'bar'>>(() => {
  const t = theme.value
  return {
    labels: props.rows.map((r) => shorten(r.label ?? '')),
    datasets: [
      {
        label: 'Net profit',
        data: props.rows.map((r) => r.net_profit_cents),
        backgroundColor: props.rows.map((r) =>
          withAlpha(r.net_profit_cents >= 0 ? t.success : t.danger, 0.8),
        ),
        borderRadius: 4,
        maxBarThickness: 22,
      },
    ],
  }
})

const options = computed<ChartOptions<'bar'>>(() => {
  const base = baseOptions<'bar'>(theme.value, { moneyAxis: 'x', legend: false })
  return {
    ...base,
    indexAxis: 'y',
    interaction: { mode: 'nearest', axis: 'y', intersect: false },
    plugins: {
      ...base.plugins,
      tooltip: {
        ...base.plugins?.tooltip,
        callbacks: {
          title: (items) => props.rows[items[0]?.dataIndex ?? -1]?.label ?? '',
          label: (item) => {
            const r = props.rows[item.dataIndex]
            if (!r) return ''
            const lines = [`Net profit ${formatSignedCents(r.net_profit_cents)}`]
            lines.push(`${r.units_sold} sold, ${r.units_in_stock} in stock`)
            if (r.group_kind === 'set' && r.total_volumes)
              lines.push(`Own ${r.volumes_owned ?? 0} of ${r.total_volumes} volumes`)
            return lines
          },
        },
      },
    },
  }
})
</script>

<template>
  <Bar :key="key" :data="data" :options="options" aria-label="Top sets and series by net profit" />
</template>
