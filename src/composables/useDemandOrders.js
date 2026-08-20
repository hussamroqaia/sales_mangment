/**
 * useDemandOrders.js
 *
 * Central composable for the Demand Orders module (Warehouse → Van).
 * All filtering, sorting, and pagination is handled SERVER-SIDE.
 *
 * Architecture:
 *   UI → useDemandOrders (state + business logic) → demandOrder.service (pure Axios)
 *
 * Conventions (shared across the project's list modules):
 *  - `page` is 1-based internally (Vuetify) and converted to 0-based for the API.
 *  - The Rep ID filter is debounced (400 ms).
 *  - Any filter change resets page to 1.
 *  - Confirmation dialogs (SweetAlert2) live in the UI layer, not here.
 */

import { watchDebounced } from '@vueuse/core'
import { resolveApiError } from '@/utils/apiErrors'
import {
  fetchDemandOrders,
  fetchDemandOrderById,
  createDemandOrder as createDemandOrderService,
  loadDemandOrder as loadDemandOrderService,
} from '@/services/demandOrder.service'

// ─── Status constants ─────────────────────────────────────────────────────────
export const DEMAND_ORDER_STATUSES = [
  { title: 'مُرسل',   value: 'SUBMITTED' },
  { title: 'مُعدَّل',  value: 'ADJUSTED'  },
  { title: 'مُحمَّل',  value: 'LOADED'    },
]

export const resolveDemandStatusVariant = status => {
  switch (status?.toUpperCase()) {
    case 'LOADED':    return 'success'
    case 'ADJUSTED':  return 'warning'
    case 'SUBMITTED': return 'info'
    default:          return 'secondary'
  }
}

export const useDemandOrders = () => {
  // ── List State ──────────────────────────────────────────────────────────────
  const orders        = ref([])
  const isListLoading = ref(false)
  const listError     = ref('')

  // ── Filter State ──────────────────────────────────────────────────────────────
  const selectedStatus = ref(null)
  const orderDate      = ref(null)
  const repIdFilter    = ref(null)

  // ── Pagination State ────────────────────────────────────────────────────────
  const page         = ref(1)
  const itemsPerPage = ref(10)
  const totalOrders  = ref(0)

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

  // ── Single Order (details modal) ──────────────────────────────────────────────
  const selectedOrder   = ref(null)
  const isDetailLoading = ref(false)
  const detailError     = ref('')

  // ── Operation State ─────────────────────────────────────────────────────────
  const isSubmitting = ref(false)
  const snackbar     = ref({ show: false, message: '', color: 'success' })

  const showSnackbar = (message, color = 'success') => {
    snackbar.value = { show: true, message, color }
  }

  // Normalise the date filter (AppDateTimePicker may emit a Date or string) → yyyy-mm-dd
  const normalizeDate = value => {
    if (!value) return undefined
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return undefined

    return d.toISOString().slice(0, 10)
  }

  // ── fetchAllOrders() ──────────────────────────────────────────────────────────
  const fetchAllOrders = async () => {
    isListLoading.value = true
    listError.value     = ''

    try {
      const data = await fetchDemandOrders({
        page:             page.value - 1,
        size:             itemsPerPage.value,
        status:           selectedStatus.value || undefined,
        orderDate:        normalizeDate(orderDate.value),
        representativeId: repIdFilter.value || undefined,
        sortBy:           sortBy.value,
        sortDir:          sortDir.value,
      })

      orders.value      = data?.content       ?? []
      totalOrders.value = data?.totalElements ?? 0
    } catch (error) {
      listError.value = resolveApiError(error, 'تعذّر تحميل طلبات التزويد.')
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

    return fetchAllOrders()
  }

  // ── Watchers ────────────────────────────────────────────────────────────────
  watch([selectedStatus, orderDate], () => {
    reloadFromFirstPage()
  })

  watchDebounced(repIdFilter, () => {
    reloadFromFirstPage()
  }, { debounce: 400 })

  watch([page, itemsPerPage], fetchAllOrders)

  // ── fetchOrder(id) — load a single order into the details modal ───────────────
  const fetchOrder = async id => {
    isDetailLoading.value = true
    detailError.value     = ''
    selectedOrder.value   = null

    try {
      selectedOrder.value = await fetchDemandOrderById(id)
    } catch (error) {
      detailError.value = resolveApiError(error, `تعذّر تحميل الطلب رقم ${id}.`)
      showSnackbar(detailError.value, 'error')
    } finally {
      isDetailLoading.value = false
    }
  }

  // ── createOrder(payload) ──────────────────────────────────────────────────────
  const createOrder = async payload => {
    isSubmitting.value = true
    try {
      await createDemandOrderService(payload)
      showSnackbar('تم إنشاء طلب التزويد بنجاح.')
      await reloadFromFirstPage()

      return { success: true }
    } catch (error) {
      const message = resolveApiError(error, '')
      showSnackbar(message || 'تعذّر إنشاء طلب التزويد.', 'error')

      return { success: false, error: message || 'تعذّر إنشاء طلب التزويد.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── loadOrder(id) — POST /load (confirmation handled in UI via SweetAlert2) ───
  const loadOrder = async id => {
    isSubmitting.value = true
    try {
      const res = await loadDemandOrderService(id)
      showSnackbar(res?.message || 'تم تحميل الطلب على المركبة.')
      await fetchAllOrders()

      return { success: true }
    } catch (error) {
      const message = resolveApiError(error, '')
      showSnackbar(message || 'تعذّر تحميل الطلب على المركبة.', 'error')

      return { success: false, error: message || 'تعذّر تحميل الطلب على المركبة.' }
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
    selectedOrder.value = null
    detailError.value   = ''
  }

  return {
    // List
    orders,
    totalOrders,
    isListLoading,
    listError,

    // Filters
    selectedStatus,
    orderDate,
    repIdFilter,

    // Pagination
    page,
    itemsPerPage,

    // Sorting
    sortBy,
    sortDir,
    updateOptions,

    // Details
    selectedOrder,
    isDetailLoading,
    detailError,

    // Operations
    isSubmitting,
    snackbar,
    fetchAllOrders,
    fetchOrder,
    createOrder,
    loadOrder,
    clearSelected,
  }
}
