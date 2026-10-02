import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * How many pixels at the bottom of the screen are covered by the on-screen
 * keyboard (0 when it's closed). Used to keep a bottom save bar visible above
 * the keyboard on phones.
 */
export function useKeyboardInset() {
  const inset = ref(0)
  const viewport = typeof window !== 'undefined' ? window.visualViewport : null

  function update() {
    if (!viewport) return
    const covered = window.innerHeight - viewport.height - viewport.offsetTop
    inset.value = covered > 80 ? Math.round(covered) : 0
  }

  onMounted(() => {
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', update)
    update()
  })
  onBeforeUnmount(() => {
    viewport?.removeEventListener('resize', update)
    viewport?.removeEventListener('scroll', update)
  })

  return inset
}
