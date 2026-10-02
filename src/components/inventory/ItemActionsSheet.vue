<script setup lang="ts">
import { computed } from 'vue'
import { Archive, ArchiveRestore, Copy, PackageCheck, Pencil, Store, Tag } from 'lucide-vue-next'
import BaseSheet from '@/components/ui/BaseSheet.vue'
import type { InventoryItem, ItemAction } from '@/types/inventory'

/** Quick actions for one item (list menu and item detail). */
const props = defineProps<{ item: InventoryItem | null }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ action: [action: ItemAction, item: InventoryItem] }>()

const actions = computed(() => {
  const item = props.item
  if (!item) return []
  const list: { action: ItemAction; label: string; icon: typeof Tag; danger?: boolean }[] = []
  if (item.status !== 'listed' && item.units_left > 0)
    list.push({ action: 'list', label: 'Mark listed', icon: Tag })
  if (item.status === 'listed')
    list.push({ action: 'unlist', label: 'Mark in stock (unlist)', icon: Store })
  if (item.units_left > 0) list.push({ action: 'sell', label: 'Mark sold', icon: PackageCheck })
  list.push({ action: 'edit', label: 'Edit', icon: Pencil })
  if (item.kind === 'one_off') list.push({ action: 'duplicate', label: 'Duplicate', icon: Copy })
  if (item.archived_at) list.push({ action: 'unarchive', label: 'Unarchive', icon: ArchiveRestore })
  else list.push({ action: 'archive', label: 'Archive', icon: Archive, danger: true })
  return list
})

function choose(action: ItemAction) {
  if (!props.item) return
  open.value = false
  emit('action', action, props.item)
}
</script>

<template>
  <BaseSheet v-model:open="open" :title="item?.name ?? 'Item'">
    <ul class="-mx-1">
      <li v-for="a in actions" :key="a.action">
        <button
          type="button"
          class="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-left font-medium hover:bg-surface-2"
          :class="{ 'text-danger': a.danger }"
          @click="choose(a.action)"
        >
          <component :is="a.icon" class="size-5" aria-hidden="true" />
          {{ a.label }}
        </button>
      </li>
    </ul>
  </BaseSheet>
</template>
