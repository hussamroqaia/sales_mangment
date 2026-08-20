/**
 * useCustomers.js
 *
 * Central composable for the Customer Management module.
 * All filtering, sorting, and pagination is handled SERVER-SIDE.
 *
 * Architecture:
 *   UI → useCustomers (state + business logic) → customer.service (pure Axios calls)
 *
 * Key design decisions:
 *  - `page` is kept 1-based internally (Vuetify convention) and converted
 *    to 0-based before sending to the API.
 *  - Search is debounced (400 ms) to avoid hammering the API on every keystroke.
 *  - Changing any filter resets page to 1 automatically.
 *  - Territories list is loaded once via the territory service for dropdown population.
 *  - Confirmation dialogs are handled in the UI layer, not here.
 */

import { watchDebounced } from '@vueuse/core'
import { resolveApiError } from '@/utils/apiErrors'
import {
  fetchCustomers,
  fetchCustomerById,
  createCustomer as createCustomerService,
  updateCustomer as updateCustomerService,
  updateCustomerStatus as updateCustomerStatusService,
  deleteCustomer as deleteCustomerService,
} from '@/services/customer.service'
import { fetchTerritories } from '@/services/territory.service'

// ─── Customer category & status constants (shared across components) ──────────
export const CUSTOMER_CATEGORIES = [
  { title: 'تجزئة',      value: 'RETAIL'      },
  { title: 'جملة',       value: 'WHOLESALE'   },
  { title: 'سوبرماركت',  value: 'SUPERMARKET' },
  { title: 'صيدلية',     value: 'PHARMACY'    },
  { title: 'مطعم',       value: 'RESTAURANT'  },
  { title: 'أخرى',       value: 'OTHER'       },
]

export const CUSTOMER_STATUSES = [
  { title: 'نشط',      value: 'ACTIVE'   },
  { title: 'غير نشط',  value: 'INACTIVE' },
]

export const resolveCategoryVariant = category => {
  const map = {
    RETAIL:      { color: 'primary',   icon: 'tabler-shopping-cart'          },
    WHOLESALE:   { color: 'info',      icon: 'tabler-building-store'         },
    SUPERMARKET: { color: 'success',   icon: 'tabler-basket'                 },
    PHARMACY:    { color: 'warning',   icon: 'tabler-pill'                   },
    RESTAURANT:  { color: 'error',     icon: 'tabler-tools-kitchen-2'        },
    OTHER:       { color: 'secondary', icon: 'tabler-dots-circle-horizontal' },
  }

  return map[category?.toUpperCase()] ?? { color: 'secondary', icon: 'tabler-user' }
}

export const resolveCustomerStatusVariant = status =>
  status?.toUpperCase() === 'ACTIVE' ? 'success' : 'secondary'

/**
 * Arabic label for a `CustomerResponse.category` enum value.
 *
 * The list, the detail dialog and the form all render the same enum, and each
 * of them used to print the raw token lower-cased ("wholesale") — the only
 * English left on an otherwise Arabic screen. One lookup, reused by all three.
 */
export const resolveCategoryTitle = category =>
  CUSTOMER_CATEGORIES.find(c => c.value === category?.toUpperCase())?.title ?? category ?? '—'

/** Arabic label for a `CustomerResponse.status` enum value. */
export const resolveCustomerStatusTitle = status =>
  CUSTOMER_STATUSES.find(st => st.value === status?.toUpperCase())?.title ?? status ?? '—'

// ─── Composable ───────────────────────────────────────────────────────────────
export const useCustomers = () => {
  // ── List State ──────────────────────────────────────────────────────────────
  const customers      = ref([])
  const isListLoading  = ref(false)
  const listError      = ref('')

  // ── Filter / Search State ───────────────────────────────────────────────────
  const searchQuery      = ref('')
  const selectedStatus   = ref(null)
  const selectedTerritory = ref(null)

  // ── Pagination State ────────────────────────────────────────────────────────
  const page           = ref(1)
  const itemsPerPage   = ref(10)
  const totalCustomers = ref(0)

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

  // ── Single Customer State ───────────────────────────────────────────────────
  const editingCustomer  = ref(null)
  const isDetailLoading  = ref(false)
  const detailError      = ref('')

  // ── Territories for dropdown ────────────────────────────────────────────────
  const territoriesList    = ref([])
  const isTerritoriesLoading = ref(false)

  // ── Operation State ─────────────────────────────────────────────────────────
  const isSubmitting = ref(false)
  const snackbar     = ref({ show: false, message: '', color: 'success' })

  const showSnackbar = (message, color = 'success') => {
    snackbar.value = { show: true, message, color }
  }

  // ── fetchAllTerritories() — for dropdown population ────────────────────────
  const loadTerritories = async () => {
    if (territoriesList.value.length) return  // already loaded — don't re-fetch
    isTerritoriesLoading.value = true
    try {
      // `all=true` is the backend's own switch for "give me every territory"
      // (TerritoryController.list → TerritoryService.list returns a synthetic
      // unpaged Page). The previous `size: 500` could never work: PageRequest
      // caps size at @Max(100), so the request failed validation with 400 and
      // this dropdown silently stayed empty — the catch below only warns.
      //
      // Safe here precisely because this loader has no search term: `all=true`
      // ignores `search`, so the paginated, searchable territory pickers must
      // keep using page/size instead.
      const data = await fetchTerritories({ all: true })

      territoriesList.value = data?.content ?? []
    } catch (error) {
      console.warn('[useCustomers] Failed to load territories for dropdown:', error)
    } finally {
      isTerritoriesLoading.value = false
    }
  }

  // ── fetchAllCustomers() — calls API with current params ────────────────────
  const fetchAllCustomers = async () => {
    isListLoading.value = true
    listError.value     = ''

    try {
      const data = await fetchCustomers({
        page:        page.value - 1,
        size:        itemsPerPage.value,
        search:      searchQuery.value      || undefined,
        status:      selectedStatus.value   || undefined,
        territoryId: selectedTerritory.value || undefined,
        sortBy:      sortBy.value,
        sortDir:     sortDir.value,
      })

      customers.value      = data?.content       ?? []
      totalCustomers.value = data?.totalElements ?? 0
    } catch (error) {
      const message = resolveApiError(error, '')
      listError.value = message || 'تعذّر تحميل العملاء.'
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

    return fetchAllCustomers()
  }

  // ── Watchers ────────────────────────────────────────────────────────────────

  // Debounce search to avoid hitting API on every keystroke
  watchDebounced(searchQuery, () => {
    reloadFromFirstPage()
  }, { debounce: 400 })

  // Reset to page 1 when filters change
  watch([selectedStatus, selectedTerritory], () => {
    reloadFromFirstPage()
  })

  // Refetch when page or page-size changes
  watch([page, itemsPerPage], fetchAllCustomers)

  // ── fetchCustomer(id) ──────────────────────────────────────────────────────
  const fetchCustomer = async id => {
    isDetailLoading.value  = true
    detailError.value      = ''
    editingCustomer.value  = null

    try {
      const data = await fetchCustomerById(id)
      editingCustomer.value = data
    } catch (error) {
      const message = resolveApiError(error, '')
      detailError.value = message || `تعذّر تحميل العميل رقم ${id}.`
      showSnackbar(detailError.value, 'error')
    } finally {
      isDetailLoading.value = false
    }
  }

  // ── createCustomer(payload) ────────────────────────────────────────────────
  const createCustomer = async payload => {
    isSubmitting.value = true
    try {
      await createCustomerService(payload)
      showSnackbar('تم إنشاء العميل بنجاح.')
      await reloadFromFirstPage()

      return { success: true }
    } catch (error) {
      const message = resolveApiError(error, '')
      showSnackbar(message || 'تعذّر إنشاء العميل.', 'error')

      return { success: false, error: message || 'تعذّر إنشاء العميل.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── updateCustomer(id, payload) ────────────────────────────────────────────
  const updateCustomer = async (id, payload) => {
    isSubmitting.value = true
    try {
      await updateCustomerService(id, payload)
      showSnackbar('تم تحديث بيانات العميل بنجاح.')
      await fetchAllCustomers()

      return { success: true }
    } catch (error) {
      const message = resolveApiError(error, '')
      showSnackbar(message || 'تعذّر تحديث بيانات العميل.', 'error')

      return { success: false, error: message || 'تعذّر تحديث بيانات العميل.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── changeCustomerStatus(id, status) ──────────────────────────────────────
  const changeCustomerStatus = async (id, status) => {
    isSubmitting.value = true
    try {
      await updateCustomerStatusService(id, status)

      // Optimistic local update — avoids a full refetch for inline row actions
      const idx = customers.value.findIndex(c => c.id === id)
      if (idx !== -1) customers.value[idx] = { ...customers.value[idx], status }

      showSnackbar('تم تحديث حالة العميل.')

      return { success: true }
    } catch (error) {
      const message = resolveApiError(error, '')
      showSnackbar(message || 'تعذّر تحديث الحالة.', 'error')

      return { success: false, error: message || 'تعذّر تحديث الحالة.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── deleteCustomer(id) — pure API call, confirmation handled in UI ─────────
  const deleteCustomer = async id => {
    isSubmitting.value = true
    try {
      await deleteCustomerService(id)
      showSnackbar('تم حذف العميل بنجاح.')

      if (customers.value.length === 1 && page.value > 1) {
        page.value -= 1
      } else {
        await fetchAllCustomers()
      }

      return { success: true }
    } catch (error) {
      const message = resolveApiError(error, '')
      showSnackbar(message || 'تعذّر حذف العميل.', 'error')

      return { success: false, error: message || 'تعذّر حذف العميل.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── updateOptions (VDataTableServer @update:options callback) ───────────
  const updateOptions = options => {
    const firstSort = options.sortBy?.[0]
    const newSortBy  = firstSort?.key   ?? DEFAULT_SORT_BY
    const newSortDir = firstSort
      ? (firstSort.order === 'desc' ? 'desc' : 'asc')
      : DEFAULT_SORT_DIR

    // Only reset to page 1 when the sort actually changes — NOT on every
    // options emission (which would fight with TablePagination page clicks)
    const sortChanged = newSortBy !== sortBy.value || newSortDir !== sortDir.value

    sortBy.value  = newSortBy
    sortDir.value = newSortDir

    if (sortChanged) {
      page.value = 1  // watcher will trigger fetchAllCustomers
    }
    // If sort didn't change, the page watcher (or filter watcher) already
    // handles the fetch — no need to call fetchAllCustomers() here
  }

  // ── clearEditing() — reset edit mode ──────────────────────────────────────
  const clearEditing = () => {
    editingCustomer.value = null
    detailError.value     = ''
  }

  return {
    // List
    customers,
    totalCustomers,
    isListLoading,
    listError,

    // Filters
    searchQuery,
    selectedStatus,
    selectedTerritory,

    // Pagination
    page,
    itemsPerPage,

    // Sorting
    sortBy,
    sortDir,
    updateOptions,

    // Territories dropdown
    territoriesList,
    isTerritoriesLoading,
    loadTerritories,

    // Single customer (edit mode)
    editingCustomer,
    isDetailLoading,
    detailError,

    // Operations
    isSubmitting,
    snackbar,
    fetchAllCustomers,
    fetchCustomer,
    createCustomer,
    updateCustomer,
    changeCustomerStatus,
    deleteCustomer,
    clearEditing,
  }
}
