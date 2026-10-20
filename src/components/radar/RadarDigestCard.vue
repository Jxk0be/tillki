<script setup lang="ts">
import { computed } from 'vue'
import { Sparkles } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import type { RadarDigest } from '@/composables/useRadar'
import { formatDate } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import type { DigestPick } from '@/lib/radar'

/** The latest weekly buy list from Claude. Each pick opens its series. */
const props = defineProps<{
  digest: RadarDigest | null
  names: ReadonlyMap<string, string>
  running: boolean
}>()
const emit = defineEmits<{ open: [templateId: string]; run: [] }>()

const sections = computed(() => {
  const c = props.digest?.content
  if (!c) return []
  return (
    [
      { key: 'buy', title: 'Buy', picks: c.buy },
      { key: 'finish', title: 'Finish these sets', picks: c.finish_sets },
      { key: 'stop', title: 'Stop buying', picks: c.stop_buying },
      { key: 'watch', title: 'Keep an eye on', picks: c.watch },
    ] as { key: string; title: string; picks: DigestPick[] }[]
  ).filter((s) => s.picks.length)
})
</script>

<template>
  <section
    class="space-y-3 rounded-2xl border border-line bg-surface p-4"
    aria-labelledby="digest-heading"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 id="digest-heading" class="flex items-center gap-2 font-bold">
        <Sparkles class="size-4" aria-hidden="true" /> This week's buy list
      </h3>
      <BaseButton size="sm" variant="ghost" :loading="running" @click="emit('run')">
        {{ digest ? 'Write a new one' : 'Write it now' }}
      </BaseButton>
    </div>

    <p v-if="!digest" class="text-sm text-ink-2">
      Claude writes a short buy list from these scores every Sunday morning. It only uses the
      numbers on this page.
    </p>
    <template v-else>
      <p class="text-xs text-ink-2">
        Written {{ formatDate(digest.created_at.slice(0, 10)) }} from the scores and your sales.
      </p>
      <p v-if="digest.content.notes" class="text-sm">{{ digest.content.notes }}</p>
      <div v-for="s in sections" :key="s.key" class="space-y-1">
        <h4 class="text-sm font-semibold text-ink-2">{{ s.title }}</h4>
        <ul class="space-y-1">
          <li v-for="p in s.picks" :key="p.series_id">
            <button
              type="button"
              class="w-full rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
              @click="emit('open', p.series_id)"
            >
              <span class="font-semibold">{{ names.get(p.series_id) ?? 'Unknown set' }}</span>
              <span v-if="p.suggested_max_cents !== null" class="text-sm tabular-nums">
                · up to {{ formatCents(p.suggested_max_cents) }} each</span
              >
              <span class="block text-sm text-ink-2">{{ p.why }}</span>
            </button>
          </li>
        </ul>
      </div>
      <p v-if="sections.length === 0" class="text-sm text-ink-2">Nothing stood out this week.</p>
    </template>
  </section>
</template>
