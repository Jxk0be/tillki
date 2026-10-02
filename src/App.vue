<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'
import BareLayout from '@/layouts/BareLayout.vue'
import BaseToast from '@/components/ui/BaseToast.vue'
import RouteProgress from '@/components/ui/RouteProgress.vue'
import { useTheme } from '@/composables/useTheme'

useTheme()

const route = useRoute()
const layout = computed(() => (route.meta.layout === 'bare' ? BareLayout : AppLayout))
</script>

<template>
  <RouteProgress />
  <component :is="layout">
    <RouterView />
  </component>
  <BaseToast />
</template>
