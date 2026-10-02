<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { BookPlus } from 'lucide-vue-next'
import BaseSheet from '@/components/ui/BaseSheet.vue'
import type { VolumeStatusRow } from '@/lib/volumes'

/**
 * Every volume of a set as a numbered cell. States are told apart without
 * color: owned = filled (×2 when more than one copy is left), listed = filled
 * with a dot, sold = struck through, missing = dashed outline, kept / written
 * off = dotted outline.
 */
const props = withDefaults(
  defineProps<{ rows: VolumeStatusRow[]; templateId: string; showLegend?: boolean }>(),
  { showLegend: true },
)

const router = useRouter()
const missingVolume = ref<number | null>(null)
const sheetOpen = ref(false)

function describe(row: VolumeStatusRow): string {
  const parts = [`Volume ${row.volume_number}`]
  if (row.state === 'owned') {
    parts.push(row.status === 'listed' ? 'owned, listed' : 'owned')
    if (row.units_left > 1) parts.push(`${row.units_left} copies left`)
  } else if (row.state === 'written_off') {
    parts.push('written off')
  } else {
    parts.push(row.state)
  }
  return parts.join(', ')
}

function open(row: VolumeStatusRow) {
  if (row.item_id) {
    void router.push({ name: 'item-detail', params: { id: row.item_id } })
    return
  }
  missingVolume.value = row.volume_number
  sheetOpen.value = true
}

function addMissing() {
  sheetOpen.value = false
  void router.push({
    name: 'template-add-volumes',
    params: { id: props.templateId },
    query: { v: String(missingVolume.value) },
  })
}
</script>

<template>
  <div>
    <ul class="flex flex-wrap gap-1.5" aria-label="Volumes">
      <li v-for="row in rows" :key="row.volume_number">
        <button
          type="button"
          class="relative grid size-9 place-items-center rounded-md text-sm font-bold tabular-nums transition"
          :class="{
            'bg-ink text-bg': row.state === 'owned',
            'border border-line text-muted line-through': row.state === 'sold',
            'border-2 border-dashed border-line text-muted': row.state === 'missing',
            'border-2 border-dotted border-line text-ink-2':
              row.state === 'kept' || row.state === 'written_off',
          }"
          :aria-label="describe(row)"
          :title="describe(row)"
          @click="open(row)"
        >
          {{ row.volume_number }}
          <span
            v-if="row.state === 'owned' && row.units_left > 1"
            class="absolute -top-1.5 -right-1.5 rounded-full border border-bg bg-accent px-1 text-[10px] leading-4 text-white"
            aria-hidden="true"
            >×{{ row.units_left }}</span
          >
          <span
            v-if="row.state === 'owned' && row.status === 'listed'"
            class="absolute bottom-1 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-bg"
            aria-hidden="true"
          />
        </button>
      </li>
    </ul>

    <ul
      v-if="showLegend"
      class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2"
      aria-label="Legend"
    >
      <li class="flex items-center gap-1.5">
        <span class="size-3.5 rounded-sm bg-ink" aria-hidden="true" />Owned
      </li>
      <li class="flex items-center gap-1.5">
        <span class="relative size-3.5 rounded-sm bg-ink" aria-hidden="true"
          ><span class="absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-bg"
        /></span>
        Listed
      </li>
      <li class="flex items-center gap-1.5">
        <span class="text-muted line-through" aria-hidden="true">00</span>Sold
      </li>
      <li class="flex items-center gap-1.5">
        <span
          class="size-3.5 rounded-sm border-2 border-dashed border-line"
          aria-hidden="true"
        />Missing
      </li>
      <li class="flex items-center gap-1.5">
        <span
          class="rounded-full bg-accent px-1 text-[10px] leading-4 text-white"
          aria-hidden="true"
          >×2</span
        >
        Extra copies
      </li>
    </ul>

    <BaseSheet v-model:open="sheetOpen" :title="`Volume ${missingVolume ?? ''}`">
      <p class="text-ink-2">You don't have volume {{ missingVolume }} of this set right now.</p>
      <template #footer>
        <button
          type="button"
          class="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 font-semibold text-primary-ink"
          @click="addMissing"
        >
          <BookPlus class="size-5" aria-hidden="true" />
          Add Volume {{ missingVolume }}
        </button>
      </template>
    </BaseSheet>
  </div>
</template>
