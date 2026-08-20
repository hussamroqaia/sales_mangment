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
import { resolveApiError } from '@/utils/apiErrors'
import {
  fetchReturnSheets,
  fetchReturnSheetById,
  createReturnSheet as createReturnSheetService,
  completeReturnSheet as completeReturnSheetService,
  autoCreateReturnSheet as autoCreateReturnSheetService,
} from '@/services/returnSheet.service'

// ─── Status constants ─────────────────────────────────────────────────────────
export const RETURN_SHEET_STATUSES = [
  { title: 'مسودة', value: 'DRAFT'     },
  { title: 'مكتمل', value: 'COMPLETED' },
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

  // ── Sorting State ─────────────────────────────────────────────────────────
  // VDataTableServer emits `update:options` on mount with an EMPTY `sortBy`,
  // meaning "the user has chosen no column". `updateOptions` below falls back
  // to these defaults for that case. It used to fall back to a hardcoded
  // id/asc, which on a list defaulting to `desc` both overrode the intended
  // order and — because the fallback differed from the current value — counted
  // as a sort change and fired a second request on top of the one onMounted
  // had already issued.
  const DEFAULT_SORT_BY  = 'id'
  const DEFAULT_SORT_DIR = 'desc'

  const sortBy  = ref(DEFAULT_SORT_BY)
  const sortDir = ref(DEFAULT_SORT_DIR)

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
      listError.value = resolveApiError(error, 'تعذّر تحميل كشوف المرتجعات.')
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

    return fetchAllSheets()
  }

  // ── Watchers ────────────────────────────────────────────────────────────────
  watch([selectedStatus, returnDate], () => {
    reloadFromFirstPage()
  })

  watchDebounced(repIdFilter, () => {
    reloadFromFirstPage()
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
      detailError.value = resolveApiError(error, `تعذّر تحميل كشف المرتجعات رقم ${id}.`)
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
      showSnackbar('تم إنشاء كشف المرتجعات بنجاح.')
      await reloadFromFirstPage()

      return { success: true }
    } catch (error) {
      const message = resolveApiError(error, '')
      showSnackbar(message || 'تعذّر إنشاء كشف المرتجعات.', 'error')

      return { success: false, error: message || 'تعذّر إنشاء كشف المرتجعات.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── completeSheet(id) — POST /complete (confirmation handled in UI) ───────────
  const completeSheet = async id => {
    isSubmitting.value = true
    try {
      const res = await completeReturnSheetService(id)
      showSnackbar(res?.message || 'تم إكمال كشف المرتجعات.')
      await fetchAllSheets()

      return { success: true }
    } catch (error) {
      const message = resolveApiError(error, '')
      showSnackbar(message || 'تعذّر إكمال كشف المرتجعات.', 'error')

      return { success: false, error: message || 'تعذّر إكمال كشف المرتجعات.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── autoCreateSheet(representativeId) ───────────────────────────────────────
  const autoCreateSheet = async representativeId => {
    isSubmitting.value = true
    try {
      await autoCreateReturnSheetService(representativeId)
      showSnackbar('تم إنشاء كشف المرتجعات تلقائيًا بنجاح.')
      await reloadFromFirstPage()

      return { success: true }
    } catch (error) {
      const message = resolveApiError(error, '')
      showSnackbar(message || 'تعذّر إنشاء كشف المرتجعات تلقائيًا.', 'error')

      return { success: false, error: message || 'تعذّر إنشاء كشف المرتجعات تلقائيًا.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── updateOptions (VDataTableServer @update:options) ──────────────────────────
  const updateOptions = options => {
    const firstSort  = options.sortBy?.[0]
    const newSortBy  = firstSort?.key ?? DEFAULT_SORT_BY
    const newSortDir = firstSort
      ? (firstSort.order === 'desc' ? 'desc' : 'asc')
      : DEFAULT_SORT_DIR
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
    autoCreateSheet,
    completeSheet,
    clearSelected,
  }
}
