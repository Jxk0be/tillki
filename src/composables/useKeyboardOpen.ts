import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * True while an on-screen keyboard is likely open. Mobile browsers shrink the
 * visual viewport (not the layout viewport) when the keyboard appears, so a big
 * gap between the two means the keyboard is up. Used to tuck the bottom tab bar
 * away instead of letting it float over the keyboard.
 */
export function useKeyboardOpen(threshold = 150) {
  const open = ref(false)
  const viewport = typeof window !== 'undefined' ? window.visualViewport : null

  function update() {
    if (!viewport) return
    open.value = window.innerHeight - viewport.height > threshold
  }

  onMounted(() => {
    viewport?.addEventListener('resize', update)
    update()
  })
  onBeforeUnmount(() => viewport?.removeEventListener('resize', update))

  return open
}
