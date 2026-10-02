<script setup lang="ts">
import { Monitor, Moon, Sun } from 'lucide-vue-next'
import { useTheme, type ThemeMode } from '@/composables/useTheme'

const { mode, setMode } = useTheme()

const options: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]
</script>

<template>
  <fieldset>
    <legend class="mb-2 text-sm font-semibold text-ink-2">Theme</legend>
    <div class="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
      <label
        v-for="option in options"
        :key="option.value"
        class="flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-sm font-semibold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-accent"
        :class="mode === option.value ? 'bg-surface text-ink shadow-sm' : 'text-muted'"
      >
        <input
          type="radio"
          name="theme"
          class="sr-only"
          :value="option.value"
          :checked="mode === option.value"
          @change="setMode(option.value)"
        />
        <component :is="option.icon" class="size-4" aria-hidden="true" />
        {{ option.label }}
      </label>
    </div>
  </fieldset>
</template>
