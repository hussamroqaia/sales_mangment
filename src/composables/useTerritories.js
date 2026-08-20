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
import { resolveApiError } from '@/utils/apiErrors'

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
      const message = resolveApiError(error, '')
      listError.value = message || 'تعذّر تحميل المناطق.'
      showSnackbar(listError.value, 'error')
    } finally {
      isListLoading.value = false
    }
  }

  // ── reloadFromFirstPage() ────────────────────────────────────────
  /**
   * Apply a filter/search/create result: go back to the first page, then load.
   *
   * Assigning `page` fires the page watcher, which loads on its own. Calling
   * the loader here as well would issue the same request twice for anyone who
   * was not already on page 1, so exactly one of the two paths ever runs.
   *
   * @returns {Promise<void>|undefined} resolves once the load this call owns
   *   has finished; `undefined` when the page watcher owns it instead.
   */
  const reloadFromFirstPage = () => {
    if (page.value !== 1) {
      page.value = 1

      return undefined
    }

    return fetchAllTerritories()
  }

  // ── Watchers — re-fetch on page / size / search change ────────────────────
  watch([page, itemsPerPage, searchDebounced], fetchAllTerritories)

  // ── fetchTerritory(id) ──────────────────────────────────────────────────────
  /**
   * Load one territory into edit state.
   *
   * @param {number|string} id
   * @param {object|null} [seed] the row the user clicked. Seeding first means
   *   the drawer opens already populated and titled "edit"; clearing the state
   *   here instead made it flash an empty CREATE form for the length of the
   *   round-trip. The response then replaces the seed with the server record.
   */
  const fetchTerritory = async (id, seed = null) => {
    isDetailLoading.value = true
    detailError.value     = ''
    editingTerritory.value = seed ? { ...seed } : null

    try {
      const data = await fetchTerritoryById(id)
      editingTerritory.value = data
    } catch (error) {
      const message = resolveApiError(error, '')
      detailError.value = message || `تعذّر تحميل المنطقة رقم ${id}.`
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
      showSnackbar('تم إنشاء المنطقة بنجاح.')
      await reloadFromFirstPage()

      return { success: true }
    } catch (error) {
      const message = resolveApiError(error, '')
      showSnackbar(message || 'تعذّر إنشاء المنطقة.', 'error')

      return { success: false, error: message || 'تعذّر إنشاء المنطقة.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── updateTerritory(id, payload) ────────────────────────────────────────────
  const updateTerritory = async (id, payload) => {
    isSubmitting.value = true
    try {
      await updateTerritoryService(id, payload)
      showSnackbar('تم تحديث المنطقة بنجاح.')
      await fetchAllTerritories()

      return { success: true }
    } catch (error) {
      const message = resolveApiError(error, '')
      showSnackbar(message || 'تعذّر تحديث المنطقة.', 'error')

      return { success: false, error: message || 'تعذّر تحديث المنطقة.' }
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
      showSnackbar('تم حذف المنطقة بنجاح.')

      // If we just deleted the only item on the last page, go back one page
      if (territories.value.length === 1 && page.value > 1) {
        page.value -= 1
      } else {
        await fetchAllTerritories()
      }

      return { success: true }
    } catch (error) {
      const message = resolveApiError(error, '')
      showSnackbar(message || 'تعذّر حذف المنطقة.', 'error')

      return { success: false, error: message || 'تعذّر حذف المنطقة.' }
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
