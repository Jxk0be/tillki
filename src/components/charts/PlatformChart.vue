<script setup lang="ts">
import { computed } from 'vue'
import { Doughnut } from 'vue-chartjs'
import type { ChartData, ChartOptions } from 'chart.js'
import { baseOptions, useChartTheme } from '@/composables/useChartTheme'
import type { PlatformRow } from '@/composables/useDashboard'
import { platformLabels } from '@/lib/labels'
import { formatCents, formatSignedCents } from '@/lib/money'

/** Revenue share per platform, with each platform's net profit in the legend. */
const props = defineProps<{ platforms: PlatformRow[] }>()
const { theme, key } = useChartTheme()

const colors = computed(() => props.platforms.map((_, i) => theme.value.series[i % 7] ?? ''))

const data = computed<ChartData<'doughnut'>>(() => ({
  labels: props.platforms.map((p) => platformLabels[p.platform]),
  datasets: [
    {
      label: 'Revenue',
      data: props.platforms.map((p) => p.revenue_cents),
      backgroundColor: colors.value,
      borderColor: theme.value.surface,
      borderWidth: 2,
    },
  ],
}))

const options = computed<ChartOptions<'doughnut'>>(() => {
  const base = baseOptions<'doughnut'>(theme.value, { moneyAxis: null, legend: false })
  return {
    ...base,
    scales: {},
    cutout: '62%',
    interaction: { mode: 'nearest', intersect: true },
    plugins: {
      ...base.plugins,
      tooltip: {
        ...base.plugins?.tooltip,
        callbacks: {
          label: (item) => {
            const p = props.platforms[item.dataIndex]
            return p ? `${formatCents(p.revenue_cents)} revenue, ${p.units_sold} sold` : ''
          },
        },
      },
    },
  }
})
</script>

<template>
  <div class="flex h-full flex-col items-center gap-4 sm:flex-row">
    <div class="relative h-44 w-44 shrink-0">
      <Doughnut :key="key" :data="data" :options="options" aria-label="Revenue by platform" />
    </div>
    <table class="w-full min-w-0 text-sm">
      <caption class="sr-only">
        Revenue and net profit by platform
      </caption>
      <thead class="text-xs text-muted">
        <tr>
          <th class="pb-1 text-left font-medium">Platform</th>
          <th class="pb-1 text-right font-medium">Revenue</th>
          <th class="pb-1 text-right font-medium">Net profit</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(p, i) in platforms" :key="p.platform">
          <td class="py-1">
            <span class="flex min-w-0 items-center gap-2">
              <span
                class="size-3 shrink-0 rounded-sm"
                :style="{ backgroundColor: colors[i] }"
                aria-hidden="true"
              />
              <span class="truncate font-medium">{{ platformLabels[p.platform] }}</span>
            </span>
          </td>
          <td class="py-1 text-right text-ink-2 tabular-nums">
            {{ formatCents(p.revenue_cents) }}
          </td>
          <td
            class="py-1 text-right font-semibold tabular-nums"
            :class="p.net_profit_cents >= 0 ? 'text-success' : 'text-danger'"
          >
            {{ formatSignedCents(p.net_profit_cents) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
