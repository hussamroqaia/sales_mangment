/**
 * useWarehouseStock.js
 *
 * Central composable for the Warehouse Stock Management module.
 * All filtering, sorting, and pagination is handled SERVER-SIDE.
 *
 * Architecture:
 *   UI → useWarehouseStock (state + business logic) → warehouseStock.service (pure Axios)
 *
 * Key design decisions:
 *  - `page` is kept 1-based internally (Vuetify convention) and converted
 *    to 0-based before sending to the API.
 *  - The `productId` filter is debounced (400 ms) to avoid hammering the API.
 *  - Changing any filter resets page to 1 automatically.
 *  - Per-record mutations are keyed by PRODUCT ID (not the stock row id).
 *  - Confirmation / modals are handled in the UI layer, not here.
 */

import { watchDebounced } from '@vueuse/core'
import {
  fetchWarehouseStock,
  fetchWarehouseStockByProductId,
  updateWarehouseStock as updateWarehouseStockService,
  receiveWarehouseStock as receiveWarehouseStockService,
} from '@/services/warehouseStock.service'

// ─── Adjustment modes (shared with the modal component) ───────────────────────
export const STOCK_MODES = {
  RECEIVE: 'receive',
  UPDATE: 'update',
}

// Returns the Vuetify color used for the low-stock badge / row highlight.
export const resolveStockVariant = lowStock => (lowStock ? 'warning' : 'success')

// ─── Composable ───────────────────────────────────────────────────────────────
export const useWarehouseStock = () => {
  // ── List State ──────────────────────────────────────────────────────────────
  const stockList     = ref([])
  const isListLoading = ref(false)
  const listError     = ref('')

  // ── Filter State ──────────────────────────────────────────────────────────────
  const lowStockOnly    = ref(false)   // → lowStock query param
  const productIdFilter = ref(null)    // → productId query param (optional)

  // ── Pagination State ────────────────────────────────────────────────────────
  const page         = ref(1)
  const itemsPerPage = ref(10)
  const totalStock   = ref(0)

  // ── Sorting State ───────────────────────────────────────────────────────────
  const sortBy  = ref('id')
  const sortDir = ref('asc')

  // ── Single Record State (modal context) ───────────────────────────────────────
  const selectedStock   = ref(null)
  const isDetailLoading = ref(false)
  const detailError     = ref('')

  // ── Operation State ─────────────────────────────────────────────────────────
  const isSubmitting = ref(false)
  const snackbar     = ref({ show: false, message: '', color: 'success' })

  const showSnackbar = (message, color = 'success') => {
    snackbar.value = { show: true, message, color }
  }

  // ── fetchAllStock() — calls API with current params ──────────────────────────
  const fetchAllStock = async () => {
    isListLoading.value = true
    listError.value     = ''

    try {
      const data = await fetchWarehouseStock({
        page:      page.value - 1,
        size:      itemsPerPage.value,
        sortBy:    sortBy.value,
        sortDir:   sortDir.value,
        lowStock:  lowStockOnly.value,
        productId: productIdFilter.value || undefined,
      })

      stockList.value  = data?.content       ?? []
      totalStock.value = data?.totalElements ?? 0
    } catch (error) {
      const message = error?.response?.data?.message
      listError.value = message || 'تعذّر تحميل مخزون المستودع.'
      showSnackbar(listError.value, 'error')
    } finally {
      isListLoading.value = false
    }
  }

  // ── Watchers ────────────────────────────────────────────────────────────────

  // Reset to page 1 when the low-stock toggle changes
  watch(lowStockOnly, () => {
    page.value = 1
    fetchAllStock()
  })

  // Debounce the productId number input so we don't fire on every keystroke
  watchDebounced(productIdFilter, () => {
    page.value = 1
    fetchAllStock()
  }, { debounce: 400 })

  // Refetch when page or page-size changes
  watch([page, itemsPerPage], fetchAllStock)

  // ── fetchStock(productId) — load a single record into modal context ──────────
  const fetchStock = async productId => {
    isDetailLoading.value = true
    detailError.value     = ''
    selectedStock.value   = null

    try {
      const data = await fetchWarehouseStockByProductId(productId)
      selectedStock.value = data
    } catch (error) {
      const message = error?.response?.data?.message
      detailError.value = message || `تعذّر تحميل مخزون المنتج رقم ${productId}.`
      showSnackbar(detailError.value, 'error')
    } finally {
      isDetailLoading.value = false
    }
  }

  // ── receiveStock(productId, quantity) — POST /receive (adds to inventory) ─────
  const receiveStock = async (productId, quantity) => {
    isSubmitting.value = true
    try {
      const res = await receiveWarehouseStockService(productId, quantity)
      showSnackbar(res?.message || 'تم استلام الكمية في المخزون.')
      await fetchAllStock()

      return { success: true }
    } catch (error) {
      const message = error?.response?.data?.message
      showSnackbar(message || 'تعذّر تسجيل استلام المخزون.', 'error')

      return { success: false, error: message || 'تعذّر تسجيل استلام المخزون.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── correctStock(productId, quantity) — PUT (override absolute quantity) ──────
  const correctStock = async (productId, quantity) => {
    isSubmitting.value = true
    try {
      const res = await updateWarehouseStockService(productId, quantity)
      showSnackbar(res?.message || 'تم تحديث مخزون المستودع.')
      await fetchAllStock()

      return { success: true }
    } catch (error) {
      const message = error?.response?.data?.message
      showSnackbar(message || 'تعذّر تحديث المخزون.', 'error')

      return { success: false, error: message || 'تعذّر تحديث المخزون.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── updateOptions (VDataTableServer @update:options callback) ────────────────
  const updateOptions = options => {
    const firstSort  = options.sortBy?.[0]
    const newSortBy  = firstSort?.key ?? 'id'
    const newSortDir = firstSort?.order === 'desc' ? 'desc' : 'asc'

    // Only reset to page 1 when the sort actually changes — NOT on every
    // options emission (which would fight with TablePagination page clicks).
    const sortChanged = newSortBy !== sortBy.value || newSortDir !== sortDir.value

    sortBy.value  = newSortBy
    sortDir.value = newSortDir

    if (sortChanged) {
      page.value = 1  // watcher will trigger fetchAllStock
    }
  }

  // ── clearSelected() — reset modal context ────────────────────────────────────
  const clearSelected = () => {
    selectedStock.value = null
    detailError.value   = ''
  }

  return {
    // List
    stockList,
    totalStock,
    isListLoading,
    listError,

    // Filters
    lowStockOnly,
    productIdFilter,

    // Pagination
    page,
    itemsPerPage,

    // Sorting
    sortBy,
    sortDir,
    updateOptions,

    // Single record (modal context)
    selectedStock,
    isDetailLoading,
    detailError,

    // Operations
    isSubmitting,
    snackbar,
    fetchAllStock,
    fetchStock,
    receiveStock,
    correctStock,
    clearSelected,
  }
}
