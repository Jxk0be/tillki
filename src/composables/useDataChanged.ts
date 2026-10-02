import { readonly, ref } from 'vue'

// Bumped after any sale, lot split or expense change, so open lists (inventory,
// sales, dashboard) know to reload.
const version = ref(0)

export function notifyDataChanged() {
  version.value++
}

export function useDataVersion() {
  return readonly(version)
}
