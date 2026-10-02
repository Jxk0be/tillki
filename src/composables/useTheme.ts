import { computed, ref, watchEffect } from 'vue'
import { useMediaQuery } from '@vueuse/core'

export type ThemeMode = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'kura-theme'

function readStoredMode(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'light' || value === 'dark' || value === 'system') return value
  } catch {
    // Storage can be blocked (private mode); fall back to following the system.
  }
  return 'system'
}

// Module-level so every caller shares one theme.
const mode = ref<ThemeMode>(readStoredMode())
let initialized = false

export function useTheme() {
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')
  const isDark = computed(
    () => mode.value === 'dark' || (mode.value === 'system' && systemDark.value),
  )

  if (!initialized) {
    initialized = true
    watchEffect(() => {
      document.documentElement.classList.toggle('dark', isDark.value)
    })
  }

  function setMode(next: ThemeMode) {
    mode.value = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Ignore; the choice still applies for this visit.
    }
  }

  return { mode, isDark, setMode }
}
