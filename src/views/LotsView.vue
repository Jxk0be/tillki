<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Layers, Plus } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import LotSheet from '@/components/sales/LotSheet.vue'
import { useDataVersion } from '@/composables/useDataChanged'
import { listLots, type LotRow } from '@/composables/useLots'
import { formatDate } from '@/lib/dates'
import { formatCents } from '@/lib/money'

const router = useRouter()
const lots = ref<LotRow[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const newOpen = ref(false)

async function load() {
  try {
    lots.value = await listLots()
    error.value = null
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong.'
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(useDataVersion(), load)

function units(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <div class="mb-4 flex justify-end">
      <BaseButton @click="newOpen = true"
        ><Plus class="size-4" aria-hidden="true" /> New lot</BaseButton
      >
    </div>

    <p
      v-if="error"
      class="rounded-xl border border-danger/40 bg-danger/10 p-3 text-danger"
      role="alert"
    >
      {{ error }}
    </p>
    <div v-else-if="loading" class="space-y-3" aria-busy="true">
      <div v-for="n in 3" :key="n" class="h-24 animate-pulse rounded-2xl bg-surface-2" />
    </div>
    <EmptyState
      v-else-if="lots.length === 0"
      :icon="Layers"
      title="No lots yet"
      message="A lot is a bulk buy, like 24 volumes for $60. Its cost gets split across the items so each has a real cost."
      action-label="Create a lot"
      @action="newOpen = true"
    />

    <ul v-else class="space-y-3">
      <li v-for="lot in lots" :key="lot.id">
        <RouterLink
          :to="{ name: 'lot-detail', params: { id: lot.id } }"
          class="block rounded-2xl border border-line bg-surface p-4 hover:border-ink-2"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-x-3">
            <p class="text-lg font-bold">{{ lot.name }}</p>
            <p class="text-lg font-bold tabular-nums">{{ formatCents(lot.total_cost_cents) }}</p>
          </div>
          <p class="text-sm text-ink-2">
            {{
              [formatDate(lot.purchased_at), lot.source].filter(Boolean).join(' · ') || 'No date'
            }}
          </p>
          <p class="mt-2 text-sm tabular-nums">
            {{ lot.units_bought }} bought · {{ units(lot.units_sold) }} sold ·
            {{ formatCents(lot.net_revenue_cents) }} back
          </p>
          <div class="mt-2 flex items-center gap-3">
            <div
              class="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              :aria-valuenow="lot.paid_back_percent ?? 0"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-label="`${lot.name} paid back`"
            >
              <div
                class="h-full rounded-full"
                :class="(lot.paid_back_percent ?? 0) >= 100 ? 'bg-success' : 'bg-ink'"
                :style="{ width: `${Math.min(100, lot.paid_back_percent ?? 0)}%` }"
              />
            </div>
            <span class="w-28 text-right text-sm font-semibold">
              paid back {{ lot.paid_back_percent ?? 0 }}%
            </span>
          </div>
        </RouterLink>
      </li>
    </ul>

    <LotSheet
      v-model:open="newOpen"
      :lot="null"
      @saved="(id) => router.push({ name: 'lot-detail', params: { id } })"
    />
  </div>
</template>
