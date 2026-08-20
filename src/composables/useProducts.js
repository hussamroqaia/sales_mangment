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
import { resolveApiError } from '@/utils/apiErrors'
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
  { title: 'نشط',    value: 'ACTIVE'       },
  { title: 'موقوف',  value: 'DISCONTINUED' },
]

// ─── Unit of Measure options (used to populate the form dropdown) ─────────────
export const PRODUCT_UNITS = [
  { title: 'قطعة',   value: 'PIECE'  },
  { title: 'علبة',   value: 'BOX'    },
  { title: 'كرتونة', value: 'CARTON' },
  { title: 'كيلوغرام', value: 'KG'   },
  { title: 'غرام',   value: 'GRAM'   },
  { title: 'لتر',    value: 'LITER'  },
  { title: 'حزمة',   value: 'PACK'   },
  { title: 'دزينة',  value: 'DOZEN'  },
]

export const resolveProductStatusVariant = status =>
  status?.toUpperCase() === 'ACTIVE' ? 'success' : 'secondary'

/**
 * Arabic label for a `ProductResponse.status` enum value. The list, the filter
 * and the row menu all render the same enum, so they share one lookup instead
 * of printing the raw `ACTIVE`/`DISCONTINUED` token lower-cased.
 */
export const resolveProductStatusTitle = status =>
  PRODUCT_STATUSES.find(st => st.value === status?.toUpperCase())?.title ?? status ?? '—'

/**
 * Arabic label for `ProductResponse.unitOfMeasure`.
 *
 * The value is one of the PRODUCT_UNITS codes the create form sends, so it maps
 * back through the same list. A unit set outside this app (or a code added
 * server-side later) falls through to its raw value rather than rendering blank.
 */
export const resolveUnitTitle = unit =>
  PRODUCT_UNITS.find(u => u.value === unit?.toUpperCase())?.title ?? unit ?? '—'

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

  // ── Sorting State ─────────────────────────────────────────────────────────
  // VDataTableServer emits `update:options` on mount with an EMPTY `sortBy`,
  // meaning "the user has chosen no column". `updateOptions` below falls back
  // to these defaults for that case. It used to fall back to a hardcoded
  // id/asc, which on a list defaulting to `desc` both overrode the intended
  // order and — because the fallback differed from the current value — counted
  // as a sort change and fired a second request on top of the one onMounted
  // had already issued.
  const DEFAULT_SORT_BY  = 'id'
  const DEFAULT_SORT_DIR = 'asc'

  const sortBy  = ref(DEFAULT_SORT_BY)
  const sortDir = ref(DEFAULT_SORT_DIR)

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
      const message = resolveApiError(error, '')
      listError.value = message || 'تعذّر تحميل المنتجات.'
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

    return fetchAllProducts()
  }

  // ── Watchers ────────────────────────────────────────────────────────────────

  // Debounce search to avoid hitting the API on every keystroke
  watchDebounced(searchQuery, () => {
    reloadFromFirstPage()
  }, { debounce: 400 })

  // Reset to page 1 when the status filter changes
  watch(selectedStatus, () => {
    reloadFromFirstPage()
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
      const message = resolveApiError(error, '')
      detailError.value = message || `تعذّر تحميل المنتج رقم ${id}.`
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
      showSnackbar('تم إنشاء المنتج بنجاح.')
      await reloadFromFirstPage()

      return { success: true }
    } catch (error) {
      const message = resolveApiError(error, '')
      showSnackbar(message || 'تعذّر إنشاء المنتج.', 'error')

      return { success: false, error: message || 'تعذّر إنشاء المنتج.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── updateProduct(id, payload) ─────────────────────────────────────────────
  const updateProduct = async (id, payload) => {
    isSubmitting.value = true
    try {
      await updateProductService(id, payload)
      showSnackbar('تم تحديث المنتج بنجاح.')
      await fetchAllProducts()

      return { success: true }
    } catch (error) {
      const message = resolveApiError(error, '')
      showSnackbar(message || 'تعذّر تحديث المنتج.', 'error')

      return { success: false, error: message || 'تعذّر تحديث المنتج.' }
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

      showSnackbar('تم تحديث حالة المنتج.')

      return { success: true }
    } catch (error) {
      const message = resolveApiError(error, '')
      showSnackbar(message || 'تعذّر تحديث الحالة.', 'error')

      return { success: false, error: message || 'تعذّر تحديث الحالة.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── deleteProduct(id) — pure API call, confirmation handled in UI ──────────
  const deleteProduct = async id => {
    isSubmitting.value = true
    try {
      await deleteProductService(id)
      showSnackbar('تم حذف المنتج بنجاح.')

      // If we just deleted the last row on a page > 1, step back a page
      // (the page watcher will refetch); otherwise refetch the current page.
      if (products.value.length === 1 && page.value > 1) {
        page.value -= 1
      } else {
        await fetchAllProducts()
      }

      return { success: true }
    } catch (error) {
      const message = resolveApiError(error, '')
      showSnackbar(message || 'تعذّر حذف المنتج.', 'error')

      return { success: false, error: message || 'تعذّر حذف المنتج.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── updateOptions (VDataTableServer @update:options callback) ──────────────
  const updateOptions = options => {
    const firstSort  = options.sortBy?.[0]
    const newSortBy  = firstSort?.key ?? DEFAULT_SORT_BY
    const newSortDir = firstSort
      ? (firstSort.order === 'desc' ? 'desc' : 'asc')
      : DEFAULT_SORT_DIR

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
