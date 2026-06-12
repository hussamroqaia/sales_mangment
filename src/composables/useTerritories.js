/**
 * useTerritories.js
 *
 * Central composable for the Territory Management module.
 * All pagination is handled SERVER-SIDE.
 *
 * Architecture:
 *   UI → useTerritories (state + business logic) → territory.service (pure Axios calls)
 *
 * Key design decisions:
 *  - `page` is kept 1-based internally (Vuetify convention) and converted
 *    to 0-based before sending to the API.
 *  - Edit mode is determined by whether `editingTerritory` has a value.
 *  - SweetAlert2 confirmation is handled inside the composable's deleteTerritory()
 *    so UI components stay thin.
 */

import {
  fetchTerritories,
  fetchTerritoryById,
  createTerritory as createTerritoryService,
  updateTerritory as updateTerritoryService,
  deleteTerritory as deleteTerritoryService,
} from '@/services/territory.service'

export const useTerritories = () => {
  // ── List State ──────────────────────────────────────────────────────────────
  /** Current page's territory rows (from API response content array) */
  const territories    = ref([])
  const isListLoading  = ref(false)
  const listError      = ref('')

  // ── Pagination State ────────────────────────────────────────────────────────
  /** 1-based page (Vuetify convention). Converted to 0-based when calling API. */
  const page           = ref(1)
  const itemsPerPage   = ref(10)
  /** totalElements returned by the server */
  const totalTerritories = ref(0)

  // ── Search State ────────────────────────────────────────────────────────────
  /** Raw search string bound to the text field */
  const search        = ref('')
  /** Debounced copy sent to the API — updates 400 ms after user stops typing */
  const searchDebounced = ref('')
  let _searchTimer = null
  watch(search, val => {
    clearTimeout(_searchTimer)
    _searchTimer = setTimeout(() => {
      searchDebounced.value = val
      page.value = 1   // reset to first page on new search
    }, 400)
  })

  // ── Single Territory State (for edit) ──────────────────────────────────────
  const editingTerritory = ref(null)   // null → Create mode, object → Edit mode
  const isDetailLoading  = ref(false)
  const detailError      = ref('')

  // ── Operation State ─────────────────────────────────────────────────────────
  const isSubmitting = ref(false)
  const snackbar     = ref({ show: false, message: '', color: 'success' })

  const showSnackbar = (message, color = 'success') => {
    snackbar.value = { show: true, message, color }
  }

  // ── fetchAllTerritories() — calls API with current params ───────────────────
  const fetchAllTerritories = async () => {
    isListLoading.value = true
    listError.value     = ''

    try {
      const data = await fetchTerritories({
        page: page.value - 1,   // convert 1-based UI → 0-based API
        size: itemsPerPage.value,
        search: searchDebounced.value,
      })

      // data = { content, page, size, totalElements, totalPages }
      territories.value      = data?.content       ?? []
      totalTerritories.value = data?.totalElements ?? 0
    } catch (error) {
      const message = error?.response?.data?.message
      listError.value = message || 'Failed to load territories.'
      showSnackbar(listError.value, 'error')
    } finally {
      isListLoading.value = false
    }
  }

  // ── Watchers — re-fetch on page / size / search change ────────────────────
  watch([page, itemsPerPage, searchDebounced], fetchAllTerritories)

  // ── fetchTerritory(id) ──────────────────────────────────────────────────────
  const fetchTerritory = async id => {
    isDetailLoading.value = true
    detailError.value     = ''
    editingTerritory.value = null

    try {
      const data = await fetchTerritoryById(id)
      editingTerritory.value = data
    } catch (error) {
      const message = error?.response?.data?.message
      detailError.value = message || `Failed to load territory #${id}.`
      showSnackbar(detailError.value, 'error')
    } finally {
      isDetailLoading.value = false
    }
  }

  // ── createTerritory(payload) ────────────────────────────────────────────────
  const createTerritory = async payload => {
    isSubmitting.value = true
    try {
      await createTerritoryService(payload)
      showSnackbar('Territory created successfully.')
      page.value = 1
      await fetchAllTerritories()

      return { success: true }
    } catch (error) {
      const message = error?.response?.data?.message
      showSnackbar(message || 'Failed to create territory.', 'error')

      return { success: false, error: message || 'Failed to create territory.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── updateTerritory(id, payload) ────────────────────────────────────────────
  const updateTerritory = async (id, payload) => {
    isSubmitting.value = true
    try {
      await updateTerritoryService(id, payload)
      showSnackbar('Territory updated successfully.')
      await fetchAllTerritories()

      return { success: true }
    } catch (error) {
      const message = error?.response?.data?.message
      showSnackbar(message || 'Failed to update territory.', 'error')

      return { success: false, error: message || 'Failed to update territory.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── deleteTerritory(id) — pure API call, no confirmation dialog ──────────────
  // Confirmation is handled by the UI layer (VDialog in TerritoryList.vue)
  const deleteTerritory = async id => {
    isSubmitting.value = true
    try {
      await deleteTerritoryService(id)
      showSnackbar('Territory deleted successfully.')

      // If we just deleted the only item on the last page, go back one page
      if (territories.value.length === 1 && page.value > 1) {
        page.value -= 1
      } else {
        await fetchAllTerritories()
      }

      return { success: true }
    } catch (error) {
      const message = error?.response?.data?.message
      showSnackbar(message || 'Failed to delete territory.', 'error')

      return { success: false, error: message || 'Failed to delete territory.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── clearEditing() — reset edit mode ───────────────────────────────────────
  const clearEditing = () => {
    editingTerritory.value = null
    detailError.value      = ''
  }

  return {
    // List
    territories,
    totalTerritories,
    isListLoading,
    listError,

    // Search
    search,

    // Pagination
    page,
    itemsPerPage,

    // Single territory (edit mode)
    editingTerritory,
    isDetailLoading,
    detailError,

    // Operations
    isSubmitting,
    snackbar,
    fetchAllTerritories,
    fetchTerritory,
    createTerritory,
    updateTerritory,
    deleteTerritory,
    clearEditing,
  }
}
