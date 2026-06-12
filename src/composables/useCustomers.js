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
  { title: 'Retail',       value: 'RETAIL'       },
  { title: 'Wholesale',    value: 'WHOLESALE'    },
  { title: 'Supermarket',  value: 'SUPERMARKET'  },
  { title: 'Pharmacy',     value: 'PHARMACY'     },
  { title: 'Restaurant',   value: 'RESTAURANT'   },
  { title: 'Other',        value: 'OTHER'        },
]

export const CUSTOMER_STATUSES = [
  { title: 'Active',   value: 'ACTIVE'   },
  { title: 'Inactive', value: 'INACTIVE' },
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

export const resolveStatusVariant = status =>
  status?.toUpperCase() === 'ACTIVE' ? 'success' : 'secondary'

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

  // ── Sorting State ───────────────────────────────────────────────────────────
  const sortBy  = ref('id')
  const sortDir = ref('asc')

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
      // Fetch a large page to get all territories for the dropdown
      const data = await fetchTerritories({ page: 0, size: 500 })
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
      const message = error?.response?.data?.message
      listError.value = message || 'Failed to load customers.'
      showSnackbar(listError.value, 'error')
    } finally {
      isListLoading.value = false
    }
  }

  // ── Watchers ────────────────────────────────────────────────────────────────

  // Debounce search to avoid hitting API on every keystroke
  watchDebounced(searchQuery, () => {
    page.value = 1
    fetchAllCustomers()
  }, { debounce: 400 })

  // Reset to page 1 when filters change
  watch([selectedStatus, selectedTerritory], () => {
    page.value = 1
    fetchAllCustomers()
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
      const message = error?.response?.data?.message
      detailError.value = message || `Failed to load customer #${id}.`
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
      showSnackbar('Customer created successfully.')
      page.value = 1
      await fetchAllCustomers()

      return { success: true }
    } catch (error) {
      const message = error?.response?.data?.message
      showSnackbar(message || 'Failed to create customer.', 'error')

      return { success: false, error: message || 'Failed to create customer.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── updateCustomer(id, payload) ────────────────────────────────────────────
  const updateCustomer = async (id, payload) => {
    isSubmitting.value = true
    try {
      await updateCustomerService(id, payload)
      showSnackbar('Customer updated successfully.')
      await fetchAllCustomers()

      return { success: true }
    } catch (error) {
      const message = error?.response?.data?.message
      showSnackbar(message || 'Failed to update customer.', 'error')

      return { success: false, error: message || 'Failed to update customer.' }
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

      showSnackbar('Customer status updated.')

      return { success: true }
    } catch (error) {
      const message = error?.response?.data?.message
      showSnackbar(message || 'Failed to update status.', 'error')

      return { success: false, error: message || 'Failed to update status.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── deleteCustomer(id) — pure API call, confirmation handled in UI ─────────
  const deleteCustomer = async id => {
    isSubmitting.value = true
    try {
      await deleteCustomerService(id)
      showSnackbar('Customer deleted successfully.')

      if (customers.value.length === 1 && page.value > 1) {
        page.value -= 1
      } else {
        await fetchAllCustomers()
      }

      return { success: true }
    } catch (error) {
      const message = error?.response?.data?.message
      showSnackbar(message || 'Failed to delete customer.', 'error')

      return { success: false, error: message || 'Failed to delete customer.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── updateOptions (VDataTableServer @update:options callback) ───────────
  const updateOptions = options => {
    const firstSort = options.sortBy?.[0]
    const newSortBy  = firstSort?.key   ?? 'id'
    const newSortDir = firstSort?.order === 'desc' ? 'desc' : 'asc'

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
