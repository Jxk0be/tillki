<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'

/**
 * A thin bar across the top while a page change is in progress (loading the
 * page's code, waiting for sign-in checks). Only appears if it takes more than
 * a moment, so quick changes don't flicker.
 */
const router = useRouter()
const visible = ref(false)
const width = ref(0)
let showTimer: ReturnType<typeof setTimeout> | undefined
let creepTimer: ReturnType<typeof setInterval> | undefined

function start() {
  clearTimeout(showTimer)
  clearInterval(creepTimer)
  showTimer = setTimeout(() => {
    visible.value = true
    width.value = 15
    // Creep toward 90% so it never looks finished before it is.
    creepTimer = setInterval(() => {
      width.value = Math.min(90, width.value + (90 - width.value) * 0.1)
    }, 200)
  }, 150)
}

function stop() {
  clearTimeout(showTimer)
  clearInterval(creepTimer)
  if (!visible.value) return
  width.value = 100
  setTimeout(() => {
    visible.value = false
    width.value = 0
  }, 250)
}

const removeBefore = router.beforeEach(() => {
  start()
})
const removeAfter = router.afterEach(() => stop())
const removeError = router.onError(() => stop())

onBeforeUnmount(() => {
  removeBefore()
  removeAfter()
  removeError()
  stop()
})
</script>

<template>
  <div
    v-if="visible"
    class="pointer-events-none fixed inset-x-0 top-0 z-[90] h-0.5 pt-safe"
    role="progressbar"
    aria-label="Loading page"
    :aria-valuenow="Math.round(width)"
    aria-valuemin="0"
    aria-valuemax="100"
  >
    <div
      class="h-full bg-accent transition-[width] duration-200 ease-out"
      :style="{ width: `${width}%` }"
    />
  </div>
</template>
