import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from './useToast'
import type { ActionResult } from '@/stores/inventory'
import type { InventoryItem, ItemAction, ItemStatus } from '@/types/inventory'

interface ItemActionHandlers {
  setStatus: (ids: string[], status: ItemStatus) => Promise<ActionResult>
  setArchived: (ids: string[], archived: boolean) => Promise<ActionResult>
  /** Called after an archive is undone, to bring the item back on screen. */
  afterUndo?: () => void | Promise<void>
}

/**
 * Runs the quick actions from the item menu and item detail, with the toasts
 * and the archive confirmation. The page decides how data is updated.
 */
export function useItemActions(handlers: ItemActionHandlers) {
  const router = useRouter()
  const toast = useToast()

  const confirmArchiveOpen = ref(false)
  const archiveTarget = ref<InventoryItem | null>(null)
  const archiving = ref(false)

  async function changeStatus(item: InventoryItem, status: ItemStatus, message: string) {
    const result = await handlers.setStatus([item.id], status)
    if (result.ok) toast.success(message)
    else toast.error(`Couldn't update ${item.name}. ${result.message ?? ''}`.trim())
  }

  async function run(action: ItemAction, item: InventoryItem) {
    switch (action) {
      case 'list':
        await changeStatus(item, 'listed', 'Marked listed.')
        break
      case 'unlist':
        await changeStatus(item, 'in_stock', 'Back in stock (not listed).')
        break
      case 'sell':
        toast.show('Recording a sale arrives in step 8.')
        break
      case 'edit':
        await router.push({ name: 'item-edit', params: { id: item.id } })
        break
      case 'duplicate':
        await router.push({ name: 'item-new', query: { duplicate: item.id } })
        break
      case 'archive':
        archiveTarget.value = item
        confirmArchiveOpen.value = true
        break
      case 'unarchive': {
        const result = await handlers.setArchived([item.id], false)
        if (result.ok) toast.success('Unarchived.')
        else toast.error(`Couldn't unarchive. ${result.message ?? ''}`.trim())
        break
      }
    }
  }

  async function confirmArchive() {
    const item = archiveTarget.value
    if (!item) return
    archiving.value = true
    const result = await handlers.setArchived([item.id], true)
    archiving.value = false
    confirmArchiveOpen.value = false
    if (!result.ok) {
      toast.error(`Couldn't archive ${item.name}. ${result.message ?? ''}`.trim())
      return
    }
    toast.show(`Archived ${item.name}.`, {
      action: {
        label: 'Undo',
        onClick: async () => {
          const undo = await handlers.setArchived([item.id], false)
          if (undo.ok) await handlers.afterUndo?.()
          else toast.error("Couldn't undo the archive.")
        },
      },
    })
  }

  return { run, confirmArchiveOpen, archiveTarget, archiving, confirmArchive }
}
