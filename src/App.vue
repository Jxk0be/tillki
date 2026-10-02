<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { useOnline } from '@vueuse/core'
import { WifiOff } from 'lucide-vue-next'
import AppLayout from '@/layouts/AppLayout.vue'
import BareLayout from '@/layouts/BareLayout.vue'
import BaseToast from '@/components/ui/BaseToast.vue'
import RouteProgress from '@/components/ui/RouteProgress.vue'
import { useTheme } from '@/composables/useTheme'

useTheme()

const route = useRoute()
const online = useOnline()
const layout = computed(() => (route.meta.layout === 'bare' ? BareLayout : AppLayout))
</script>

<template>
  <RouteProgress />
  <div
    v-if="!online"
    class="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-ink px-4 pt-[calc(0.375rem+env(safe-area-inset-top))] pb-1.5 text-sm font-semibold text-bg print:hidden"
    role="status"
  >
    <WifiOff class="size-4" aria-hidden="true" /> You're offline, changes won't save
  </div>
  <component :is="layout">
    <RouterView />
  </component>
  <BaseToast />
</template>
