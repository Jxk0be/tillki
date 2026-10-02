import { computed, nextTick, ref, watch } from 'vue'
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions,
  type ChartType,
  type TooltipItem,
} from 'chart.js'
import { formatCents, formatCompactCents } from '@/lib/money'
import { useTheme } from './useTheme'

Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
)
Chart.defaults.font.family = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
Chart.defaults.font.size = 12

export interface ChartTheme {
  ink: string
  ink2: string
  muted: string
  line: string
  surface: string
  success: string
  danger: string
  /** Series colors, in order. */
  series: string[]
}

function readTheme(): ChartTheme {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(`--kura-${name}`).trim()
  return {
    ink: v('ink'),
    ink2: v('ink-2'),
    muted: v('muted'),
    line: v('line'),
    surface: v('surface'),
    success: v('success'),
    danger: v('danger'),
    series: [1, 2, 3, 4, 5, 6, 7].map((n) => v(`chart-${n}`)),
  }
}

/** Adds transparency to a "#rrggbb" color. */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')
  return /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${a}` : hex
}

// Shared by every chart: re-read after the `dark` class has been applied.
const theme = ref<ChartTheme | null>(null)
let watching = false

/**
 * Chart colors from the CSS variables, so dark mode works. `key` changes on
 * every theme change; use it as the chart's :key to redraw from scratch.
 */
export function useChartTheme() {
  const { isDark } = useTheme()
  if (!watching) {
    watching = true
    theme.value = readTheme()
    watch(isDark, async () => {
      await nextTick()
      theme.value = readTheme()
    })
  }
  const current = computed(() => theme.value ?? readTheme())
  const key = computed(() => (isDark.value ? 'dark' : 'light'))
  return { theme: current, key }
}

type Axis = 'x' | 'y'

/** Options every chart shares: no fixed aspect ratio, tap-friendly tooltips, themed text and grid. */
export function baseOptions<T extends ChartType>(
  t: ChartTheme,
  opts: { moneyAxis?: Axis | null; legend?: boolean; stacked?: boolean } = {},
): ChartOptions<T> {
  const { moneyAxis = 'y', legend = true, stacked = false } = opts
  const tick = { color: t.ink2 }
  const grid = { color: withAlpha(t.line, 0.9) }
  // Only the money axis gets a formatter; the other keeps Chart.js's default labels.
  const ticksFor = (axis: Axis) =>
    moneyAxis === axis
      ? { ...tick, callback: (v: string | number) => formatCompactCents(Number(v)) }
      : tick
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: legend,
        position: 'bottom',
        labels: { color: t.ink, boxWidth: 12, boxHeight: 12, padding: 12 },
      },
      tooltip: {
        backgroundColor: t.surface,
        titleColor: t.ink,
        bodyColor: t.ink,
        borderColor: t.line,
        borderWidth: 1,
        padding: 10,
        callbacks: moneyAxis
          ? {
              label: (item: TooltipItem<ChartType>) => {
                const raw = moneyAxis === 'x' ? item.parsed.x : item.parsed.y
                return `${item.dataset.label ?? ''}: ${formatCents(Number(raw))}`
              },
            }
          : {},
      },
    },
    scales: {
      x: {
        stacked,
        ticks: { ...ticksFor('x'), autoSkip: true, maxRotation: 0 },
        grid: { ...grid, display: moneyAxis === 'x' },
        border: { color: t.line },
      },
      y: {
        stacked,
        beginAtZero: true,
        ticks: { ...ticksFor('y'), precision: 0 },
        grid: { ...grid, display: moneyAxis !== 'x' },
        border: { display: false },
      },
    },
  } as ChartOptions<T>
}
