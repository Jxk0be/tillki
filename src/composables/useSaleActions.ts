import { ref } from 'vue'
import { deleteBundle, deleteSale } from './useSales'
import { useToast } from './useToast'
import type { InventoryItem } from '@/types/inventory'

/**
 * Opens the Mark sold / Sell as bundle sheets and handles what happens after:
 * a toast with Undo (6 seconds) and a refresh of the page.
 */
export function useSaleActions(refresh: () => void | Promise<void>) {
  const toast = useToast()

  const sellItem = ref<InventoryItem | null>(null)
  const sellOpen = ref(false)
  const bundleItems = ref<InventoryItem[]>([])
  const bundleOpen = ref(false)

  function openSell(item: InventoryItem) {
    sellItem.value = item
    sellOpen.value = true
  }

  function openBundle(items: InventoryItem[]) {
    bundleItems.value = items
    bundleOpen.value = true
  }

  async function onSold(saleId: string, item: InventoryItem) {
    await refresh()
    toast.success(`Sold ${item.name}.`, {
      duration: 6000,
      action: {
        label: 'Undo',
        onClick: async () => {
          try {
            await deleteSale(saleId)
            toast.show('Sale undone.')
            await refresh()
          } catch {
            toast.error("Couldn't undo the sale.")
          }
        },
      },
    })
  }

  async function onBundleSold(bundleId: string, count: number) {
    await refresh()
    toast.success(`Sold ${count} items as a bundle.`, {
      duration: 6000,
      action: {
        label: 'Undo',
        onClick: async () => {
          try {
            await deleteBundle(bundleId)
            toast.show('Bundle sale undone.')
            await refresh()
          } catch {
            toast.error("Couldn't undo the bundle.")
          }
        },
      },
    })
  }

  return { sellItem, sellOpen, bundleItems, bundleOpen, openSell, openBundle, onSold, onBundleSold }
}
