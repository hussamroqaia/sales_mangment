/**
 * useReturnSheets.js
 *
 * Central composable for the Return Sheets module (Van → Warehouse).
 * All filtering, sorting, and pagination is handled SERVER-SIDE.
 *
 * Architecture:
 *   UI → useReturnSheets (state + business logic) → returnSheet.service (pure Axios)
 *
 * Conventions match the project's other list modules (1-based page → 0-based API,
 * debounced rep filter, filter changes reset to page 1, confirmations live in UI).
 */

import { watchDebounced } from '@vueuse/core'
import {
  fetchReturnSheets,
  fetchReturnSheetById,
  createReturnSheet as createReturnSheetService,
  completeReturnSheet as completeReturnSheetService,
} from '@/services/returnSheet.service'

// ─── Status constants ─────────────────────────────────────────────────────────
export const RETURN_SHEET_STATUSES = [
  { title: 'Draft',     value: 'DRAFT'     },
  { title: 'Completed', value: 'COMPLETED' },
]

export const resolveReturnStatusVariant = status =>
  status?.toUpperCase() === 'COMPLETED' ? 'success' : 'warning'

export const useReturnSheets = () => {
  // ── List State ──────────────────────────────────────────────────────────────
  const sheets        = ref([])
  const isListLoading = ref(false)
  const listError     = ref('')

  // ── Filter State ──────────────────────────────────────────────────────────────
  const selectedStatus = ref(null)
  const returnDate     = ref(null)
  const repIdFilter    = ref(null)

  // ── Pagination State ────────────────────────────────────────────────────────
  const page         = ref(1)
  const itemsPerPage = ref(10)
  const totalSheets  = ref(0)

  // ── Sorting State ───────────────────────────────────────────────────────────
  const sortBy  = ref('id')
  const sortDir = ref('desc')

  // ── Single Sheet (details modal) ──────────────────────────────────────────────
  const selectedSheet   = ref(null)
  const isDetailLoading = ref(false)
  const detailError     = ref('')

  // ── Operation State ─────────────────────────────────────────────────────────
  const isSubmitting = ref(false)
  const snackbar     = ref({ show: false, message: '', color: 'success' })

  const showSnackbar = (message, color = 'success') => {
    snackbar.value = { show: true, message, color }
  }

  const normalizeDate = value => {
    if (!value) return undefined
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return undefined

    return d.toISOString().slice(0, 10)
  }

  // ── fetchAllSheets() ──────────────────────────────────────────────────────────
  const fetchAllSheets = async () => {
    isListLoading.value = true
    listError.value     = ''

    try {
      const data = await fetchReturnSheets({
        page:             page.value - 1,
        size:             itemsPerPage.value,
        status:           selectedStatus.value || undefined,
        returnDate:       normalizeDate(returnDate.value),
        representativeId: repIdFilter.value || undefined,
        sortBy:           sortBy.value,
        sortDir:          sortDir.value,
      })

      sheets.value      = data?.content       ?? []
      totalSheets.value = data?.totalElements ?? 0
    } catch (error) {
      listError.value = error?.response?.data?.message || 'Failed to load return sheets.'
      showSnackbar(listError.value, 'error')
    } finally {
      isListLoading.value = false
    }
  }

  // ── Watchers ────────────────────────────────────────────────────────────────
  watch([selectedStatus, returnDate], () => {
    page.value = 1
    fetchAllSheets()
  })

  watchDebounced(repIdFilter, () => {
    page.value = 1
    fetchAllSheets()
  }, { debounce: 400 })

  watch([page, itemsPerPage], fetchAllSheets)

  // ── fetchSheet(id) ──────────────────────────────────────────────────────────
  const fetchSheet = async id => {
    isDetailLoading.value = true
    detailError.value     = ''
    selectedSheet.value   = null

    try {
      selectedSheet.value = await fetchReturnSheetById(id)
    } catch (error) {
      detailError.value = error?.response?.data?.message || `Failed to load return sheet #${id}.`
      showSnackbar(detailError.value, 'error')
    } finally {
      isDetailLoading.value = false
    }
  }

  // ── createSheet(payload) ──────────────────────────────────────────────────────
  const createSheet = async payload => {
    isSubmitting.value = true
    try {
      await createReturnSheetService(payload)
      showSnackbar('Return sheet created successfully.')
      page.value = 1
      await fetchAllSheets()

      return { success: true }
    } catch (error) {
      const message = error?.response?.data?.message
      showSnackbar(message || 'Failed to create return sheet.', 'error')

      return { success: false, error: message || 'Failed to create return sheet.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── completeSheet(id) — POST /complete (confirmation handled in UI) ───────────
  const completeSheet = async id => {
    isSubmitting.value = true
    try {
      const res = await completeReturnSheetService(id)
      showSnackbar(res?.message || 'Return sheet completed.')
      await fetchAllSheets()

      return { success: true }
    } catch (error) {
      const message = error?.response?.data?.message
      showSnackbar(message || 'Failed to complete return sheet.', 'error')

      return { success: false, error: message || 'Failed to complete return sheet.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── updateOptions (VDataTableServer @update:options) ──────────────────────────
  const updateOptions = options => {
    const firstSort  = options.sortBy?.[0]
    const newSortBy  = firstSort?.key ?? 'id'
    const newSortDir = firstSort?.order === 'desc' ? 'desc' : 'asc'
    const sortChanged = newSortBy !== sortBy.value || newSortDir !== sortDir.value

    sortBy.value  = newSortBy
    sortDir.value = newSortDir
    if (sortChanged) page.value = 1
  }

  const clearSelected = () => {
    selectedSheet.value = null
    detailError.value   = ''
  }

  return {
    // List
    sheets,
    totalSheets,
    isListLoading,
    listError,

    // Filters
    selectedStatus,
    returnDate,
    repIdFilter,

    // Pagination
    page,
    itemsPerPage,

    // Sorting
    sortBy,
    sortDir,
    updateOptions,

    // Details
    selectedSheet,
    isDetailLoading,
    detailError,

    // Operations
    isSubmitting,
    snackbar,
    fetchAllSheets,
    fetchSheet,
    createSheet,
    completeSheet,
    clearSelected,
  }
}
