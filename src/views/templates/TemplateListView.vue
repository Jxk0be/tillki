<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { LibraryBig } from 'lucide-vue-next'
import EmptyState from '@/components/ui/EmptyState.vue'

const route = useRoute()
// Opened from Add > "Volumes of a set": the list becomes a picker that leads to add-volumes.
const picking = computed(() => route.query.pick === 'add-volumes')
</script>

<template>
  <EmptyState
    :icon="LibraryBig"
    :title="picking ? 'Pick a set to add volumes to' : 'Sets'"
    message="This screen gets built in step 7."
    action-label="Create a new set"
    to="/templates/new"
  />
</template>
