/**
 * useProducts.js
 *
 * Central composable for the Product Management module.
 * All filtering, sorting, and pagination is handled SERVER-SIDE.
 *
 * Architecture:
 *   UI → useProducts (state + business logic) → product.service (pure Axios calls)
 *
 * Key design decisions:
 *  - `page` is kept 1-based internally (Vuetify convention) and converted
 *    to 0-based before sending to the API.
 *  - Search is debounced (400 ms) to avoid hammering the API on every keystroke.
 *  - Changing any filter resets page to 1 automatically.
 *  - Confirmation dialogs are handled in the UI layer, not here.
 */

import { watchDebounced } from '@vueuse/core'
import {
  fetchProducts,
  fetchProductById,
  createProduct as createProductService,
  updateProduct as updateProductService,
  updateProductStatus as updateProductStatusService,
  deleteProduct as deleteProductService,
} from '@/services/product.service'

// ─── Status constants (shared across components) ──────────────────────────────
export const PRODUCT_STATUSES = [
  { title: 'Active',       value: 'ACTIVE'       },
  { title: 'Discontinued', value: 'DISCONTINUED' },
]

// ─── Unit of Measure options (used to populate the form dropdown) ─────────────
export const PRODUCT_UNITS = [
  { title: 'Piece',  value: 'PIECE'  },
  { title: 'Box',    value: 'BOX'    },
  { title: 'Carton', value: 'CARTON' },
  { title: 'Kg',     value: 'KG'     },
  { title: 'Gram',   value: 'GRAM'   },
  { title: 'Liter',  value: 'LITER'  },
  { title: 'Pack',   value: 'PACK'   },
  { title: 'Dozen',  value: 'DOZEN'  },
]

export const resolveStatusVariant = status =>
  status?.toUpperCase() === 'ACTIVE' ? 'success' : 'secondary'

// ─── Composable ───────────────────────────────────────────────────────────────
export const useProducts = () => {
  // ── List State ──────────────────────────────────────────────────────────────
  const products      = ref([])
  const isListLoading = ref(false)
  const listError     = ref('')

  // ── Filter / Search State ───────────────────────────────────────────────────
  const searchQuery    = ref('')
  const selectedStatus = ref(null)

  // ── Pagination State ────────────────────────────────────────────────────────
  const page          = ref(1)
  const itemsPerPage  = ref(10)
  const totalProducts = ref(0)

  // ── Sorting State ───────────────────────────────────────────────────────────
  const sortBy  = ref('id')
  const sortDir = ref('asc')

  // ── Single Product State (edit mode) ────────────────────────────────────────
  const editingProduct  = ref(null)
  const isDetailLoading = ref(false)
  const detailError     = ref('')

  // ── Operation State ─────────────────────────────────────────────────────────
  const isSubmitting = ref(false)
  const snackbar     = ref({ show: false, message: '', color: 'success' })

  const showSnackbar = (message, color = 'success') => {
    snackbar.value = { show: true, message, color }
  }

  // ── fetchAllProducts() — calls API with current params ─────────────────────
  const fetchAllProducts = async () => {
    isListLoading.value = true
    listError.value     = ''

    try {
      const data = await fetchProducts({
        page:    page.value - 1,
        size:    itemsPerPage.value,
        search:  searchQuery.value    || undefined,
        status:  selectedStatus.value || undefined,
        sortBy:  sortBy.value,
        sortDir: sortDir.value,
      })

      products.value      = data?.content       ?? []
      totalProducts.value = data?.totalElements ?? 0
    } catch (error) {
      const message = error?.response?.data?.message
      listError.value = message || 'Failed to load products.'
      showSnackbar(listError.value, 'error')
    } finally {
      isListLoading.value = false
    }
  }

  // ── Watchers ────────────────────────────────────────────────────────────────

  // Debounce search to avoid hitting the API on every keystroke
  watchDebounced(searchQuery, () => {
    page.value = 1
    fetchAllProducts()
  }, { debounce: 400 })

  // Reset to page 1 when the status filter changes
  watch(selectedStatus, () => {
    page.value = 1
    fetchAllProducts()
  })

  // Refetch when page or page-size changes
  watch([page, itemsPerPage], fetchAllProducts)

  // ── fetchProduct(id) — load a single product into edit state ───────────────
  const fetchProduct = async id => {
    isDetailLoading.value = true
    detailError.value     = ''
    editingProduct.value  = null

    try {
      const data = await fetchProductById(id)
      editingProduct.value = data
    } catch (error) {
      const message = error?.response?.data?.message
      detailError.value = message || `Failed to load product #${id}.`
      showSnackbar(detailError.value, 'error')
    } finally {
      isDetailLoading.value = false
    }
  }

  // ── createProduct(payload) ─────────────────────────────────────────────────
  const createProduct = async payload => {
    isSubmitting.value = true
    try {
      await createProductService(payload)
      showSnackbar('Product created successfully.')
      page.value = 1
      await fetchAllProducts()

      return { success: true }
    } catch (error) {
      const message = error?.response?.data?.message
      showSnackbar(message || 'Failed to create product.', 'error')

      return { success: false, error: message || 'Failed to create product.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── updateProduct(id, payload) ─────────────────────────────────────────────
  const updateProduct = async (id, payload) => {
    isSubmitting.value = true
    try {
      await updateProductService(id, payload)
      showSnackbar('Product updated successfully.')
      await fetchAllProducts()

      return { success: true }
    } catch (error) {
      const message = error?.response?.data?.message
      showSnackbar(message || 'Failed to update product.', 'error')

      return { success: false, error: message || 'Failed to update product.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── changeProductStatus(id, status) ────────────────────────────────────────
  const changeProductStatus = async (id, status) => {
    isSubmitting.value = true
    try {
      await updateProductStatusService(id, status)

      // Optimistic local update — avoids a full refetch for inline row actions
      const idx = products.value.findIndex(p => p.id === id)
      if (idx !== -1) products.value[idx] = { ...products.value[idx], status }

      showSnackbar('Product status updated.')

      return { success: true }
    } catch (error) {
      const message = error?.response?.data?.message
      showSnackbar(message || 'Failed to update status.', 'error')

      return { success: false, error: message || 'Failed to update status.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── deleteProduct(id) — pure API call, confirmation handled in UI ──────────
  const deleteProduct = async id => {
    isSubmitting.value = true
    try {
      await deleteProductService(id)
      showSnackbar('Product deleted successfully.')

      // If we just deleted the last row on a page > 1, step back a page
      // (the page watcher will refetch); otherwise refetch the current page.
      if (products.value.length === 1 && page.value > 1) {
        page.value -= 1
      } else {
        await fetchAllProducts()
      }

      return { success: true }
    } catch (error) {
      const message = error?.response?.data?.message
      showSnackbar(message || 'Failed to delete product.', 'error')

      return { success: false, error: message || 'Failed to delete product.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── updateOptions (VDataTableServer @update:options callback) ──────────────
  const updateOptions = options => {
    const firstSort  = options.sortBy?.[0]
    const newSortBy  = firstSort?.key ?? 'id'
    const newSortDir = firstSort?.order === 'desc' ? 'desc' : 'asc'

    // Only reset to page 1 when the sort actually changes — NOT on every
    // options emission (which would fight with TablePagination page clicks)
    const sortChanged = newSortBy !== sortBy.value || newSortDir !== sortDir.value

    sortBy.value  = newSortBy
    sortDir.value = newSortDir

    if (sortChanged) {
      page.value = 1  // watcher will trigger fetchAllProducts
    }
  }

  // ── clearEditing() — reset edit mode ───────────────────────────────────────
  const clearEditing = () => {
    editingProduct.value = null
    detailError.value    = ''
  }

  return {
    // List
    products,
    totalProducts,
    isListLoading,
    listError,

    // Filters
    searchQuery,
    selectedStatus,

    // Pagination
    page,
    itemsPerPage,

    // Sorting
    sortBy,
    sortDir,
    updateOptions,

    // Single product (edit mode)
    editingProduct,
    isDetailLoading,
    detailError,

    // Operations
    isSubmitting,
    snackbar,
    fetchAllProducts,
    fetchProduct,
    createProduct,
    updateProduct,
    changeProductStatus,
    deleteProduct,
    clearEditing,
  }
}
