/**
 * useVanInventory.js
 *
 * Composable for the Van Inventory module. Unlike the other logistics modules
 * this endpoint is NOT paginated — selecting a representative fetches the full
 * flat array of their current van stock.
 *
 * Architecture: UI → useVanInventory (state) → vanInventory.service (pure Axios)
 */

import { fetchVanInventory } from '@/services/vanInventory.service'

export const useVanInventory = () => {
  const representativeId = ref(null)
  const inventory        = ref([])
  const isLoading        = ref(false)
  const error            = ref('')
  const hasFetched       = ref(false)

  // ── loadInventory() — fetch the selected rep's van stock ──────────────────────
  const loadInventory = async () => {
    if (!representativeId.value) {
      inventory.value = []
      hasFetched.value = false

      return
    }

    isLoading.value = true
    error.value     = ''

    try {
      const data = await fetchVanInventory(representativeId.value)
      inventory.value = Array.isArray(data) ? data : []
      hasFetched.value = true
    } catch (err) {
      error.value = err?.response?.data?.message || 'تعذّر تحميل مخزون المركبة.'
      inventory.value = []
    } finally {
      isLoading.value = false
    }
  }

  // Auto-refetch whenever the selected representative changes.
  watch(representativeId, loadInventory)

  // Convenience: total units across all SKUs in the van.
  const totalUnits = computed(() =>
    inventory.value.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0))

  return {
    representativeId,
    inventory,
    isLoading,
    error,
    hasFetched,
    totalUnits,
    loadInventory,
  }
}
