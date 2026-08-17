/**
 * useRoutes.js
 *
 * Central composable for the Route Management & Optimization module.
 * All filtering, sorting, and pagination is handled SERVER-SIDE.
 *
 * Architecture:
 *   UI → useRoutes (state + business logic) → route.service (pure Axios)
 *
 * Conventions (shared across the project's list modules):
 *  - `page` is 1-based internally (Vuetify) and converted to 0-based for the API.
 *  - Any filter change resets page to 1.
 *  - Confirmation dialogs (SweetAlert2) live in the UI layer, not here.
 */

import {
  fetchRoutes,
  fetchRouteById,
  createRoute as createRouteService,
  updateRoute as updateRouteService,
  deleteRoute as deleteRouteService,
  optimizeRoute as optimizeRouteService,
  updateRouteStatus as updateRouteStatusService,
  assignRouteCustomers as assignRouteCustomersService,
  removeRouteCustomer as removeRouteCustomerService,
  updateRouteSequence as updateRouteSequenceService,
} from '@/services/route.service'

// ─── Status constants ─────────────────────────────────────────────────────────
export const ROUTE_STATUSES = [
  { title: 'Planned',     value: 'PLANNED'     },
  { title: 'Active',      value: 'ACTIVE'      },
  { title: 'Completed',   value: 'COMPLETED'   },
]

export const resolveRouteStatusVariant = status => {
  switch (status?.toUpperCase()) {
  case 'COMPLETED':   return 'success'
  case 'ACTIVE':      return 'warning'
  case 'PLANNED':     return 'info'
  default:            return 'secondary'
  }
}

export const useRoutes = () => {
  // ── List State ──────────────────────────────────────────────────────────────
  const routes        = ref([])
  const isListLoading = ref(false)
  const listError     = ref('')

  // ── Filter State ────────────────────────────────────────────────────────────
  const selectedStatus           = ref(null)
  const selectedRepresentativeId = ref(null)
  const selectedRouteDate        = ref(null)

  // ── Pagination State ────────────────────────────────────────────────────────
  const page         = ref(1)
  const itemsPerPage = ref(10)
  const totalRoutes  = ref(0)

  // ── Sorting State ───────────────────────────────────────────────────────────
  const sortBy  = ref('id')
  const sortDir = ref('desc')

  // ── Single Route (details page) ─────────────────────────────────────────────
  const selectedRoute   = ref(null)
  const isDetailLoading = ref(false)
  const detailError     = ref('')

  // ── Operation State ─────────────────────────────────────────────────────────
  const isSubmitting  = ref(false)
  const isOptimizing  = ref(false)
  const snackbar      = ref({ show: false, message: '', color: 'success' })

  const showSnackbar = (message, color = 'success') => {
    snackbar.value = { show: true, message, color }
  }

  // ── fetchAllRoutes() ────────────────────────────────────────────────────────
  const fetchAllRoutes = async () => {
    isListLoading.value = true
    listError.value     = ''

    try {
      const data = await fetchRoutes({
        page: page.value - 1,
        size: itemsPerPage.value,
        status: selectedStatus.value || undefined,
        representativeId: selectedRepresentativeId.value || undefined,
        routeDate: selectedRouteDate.value || undefined,
        sortBy: sortBy.value,
        sortDir: sortDir.value,
      })

      routes.value      = data?.content       ?? []
      totalRoutes.value = data?.totalElements ?? 0
    } catch (error) {
      listError.value = error?.response?.data?.message || 'Failed to load routes.'
      showSnackbar(listError.value, 'error')
    } finally {
      isListLoading.value = false
    }
  }

  // ── Watchers ────────────────────────────────────────────────────────────────
  watch([selectedStatus, selectedRepresentativeId, selectedRouteDate], () => {
    page.value = 1
    fetchAllRoutes()
  })

  watch([page, itemsPerPage], fetchAllRoutes)

  // ── fetchRoute(id) — load a single route for the details page ───────────────
  const fetchRoute = async id => {
    isDetailLoading.value = true
    detailError.value     = ''
    selectedRoute.value   = null

    try {
      selectedRoute.value = await fetchRouteById(id)
    } catch (error) {
      detailError.value = error?.response?.data?.message || `Failed to load route #${id}.`
      showSnackbar(detailError.value, 'error')
    } finally {
      isDetailLoading.value = false
    }
  }

  // GET /routes/me had a loader here. It backed the /my-route screen — a rep's
  // own daily route — which is a mobile workflow, so both the screen and the
  // call were removed rather than left reachable from the management app.

  // ── createRoute(payload) ────────────────────────────────────────────────────
  const createRoute = async payload => {
    isSubmitting.value = true
    try {
      await createRouteService(payload)
      showSnackbar('Route created successfully.')
      page.value = 1
      await fetchAllRoutes()

      return { success: true }
    } catch (error) {
      const message = error?.response?.data?.message

      showSnackbar(message || 'Failed to create route.', 'error')

      return { success: false, error: message || 'Failed to create route.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── updateSelectedRoute(id, payload) ────────────────────────────────────────
  const updateSelectedRoute = async (id, payload) => {
    isSubmitting.value = true
    try {
      const updated = await updateRouteService(id, payload)

      showSnackbar('Route updated successfully.')
      
      // Update the local list and details if they match
      if (selectedRoute.value?.id == id) {
        selectedRoute.value = { ...selectedRoute.value, ...updated }
      }
      
      // Update the item in the local routes array without a full refetch
      const index = routes.value.findIndex(r => r.id == id)
      if (index !== -1) {
        routes.value[index] = { ...routes.value[index], ...updated }
      }

      return { success: true }
    } catch (error) {
      const message = error?.response?.data?.message

      showSnackbar(message || 'Failed to update route.', 'error')

      return { success: false, error: message || 'Failed to update route.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── removeRoute(id) — DELETE (confirmation handled in UI via SweetAlert2) ───
  const removeRoute = async id => {
    isSubmitting.value = true
    try {
      const res = await deleteRouteService(id)

      showSnackbar(res?.message || 'Route deleted successfully.')
      await fetchAllRoutes()

      return { success: true }
    } catch (error) {
      const message = error?.response?.data?.message

      showSnackbar(message || 'Failed to delete route.', 'error')

      return { success: false, error: message || 'Failed to delete route.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── optimizeRoute(id) — POST /optimize then refresh ─────────────────────────
  const optimizeSelectedRoute = async id => {
    isOptimizing.value = true
    try {
      const updated = await optimizeRouteService(id)

      // Update the local detail state with the optimized route
      selectedRoute.value = updated
      showSnackbar('Route optimized successfully!')

      return { success: true }
    } catch (error) {
      const message = error?.response?.data?.message

      showSnackbar(message || 'Failed to optimize route.', 'error')

      return { success: false, error: message || 'Failed to optimize route.' }
    } finally {
      isOptimizing.value = false
    }
  }

  // ── updateStatus(id, status) — PATCH /status then refresh ───────────────────
  const updateStatus = async (id, status) => {
    isSubmitting.value = true
    try {
      const updated = await updateRouteStatusService(id, status)

      if (selectedRoute.value?.id === id) {
        selectedRoute.value = updated
      } else {
        await fetchAllRoutes()
      }
      
      showSnackbar(`Route status updated to ${status}.`)

      return { success: true }
    } catch (error) {
      const message = error?.response?.data?.message

      showSnackbar(message || 'Failed to update route status.', 'error')

      return { success: false, error: message || 'Failed to update route status.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── updateOptions (VDataTableServer @update:options) ────────────────────────
  const updateOptions = options => {
    const firstSort  = options.sortBy?.[0]
    const newSortBy  = firstSort?.key ?? 'id'
    const newSortDir = firstSort?.order === 'desc' ? 'desc' : 'asc'
    const sortChanged = newSortBy !== sortBy.value || newSortDir !== sortDir.value

    sortBy.value  = newSortBy
    sortDir.value = newSortDir
    if (sortChanged) page.value = 1
  }

  // ── assignCustomers(id, customerIds) — POST /routes/:id/customers ───────────
  const assignCustomers = async (id, customerIds) => {
    isSubmitting.value = true
    try {
      const updated = await assignRouteCustomersService(id, customerIds)

      if (selectedRoute.value?.id == id) {
        selectedRoute.value = updated
      }
      showSnackbar(updated?.message || 'Customers assigned successfully.')

      return { success: true }
    } catch (error) {
      const message = error?.response?.data?.message

      showSnackbar(message || 'Failed to assign customers.', 'error')

      return { success: false, error: message || 'Failed to assign customers.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── removeCustomer(routeId, customerId) — DELETE /routes/:id/customers/:customerId
  const removeCustomer = async (routeId, customerId) => {
    isSubmitting.value = true
    try {
      const updated = await removeRouteCustomerService(routeId, customerId)

      if (selectedRoute.value?.id == routeId) {
        selectedRoute.value = updated
      }
      showSnackbar(updated?.message || 'Customer removed successfully.')

      return { success: true }
    } catch (error) {
      const message = error?.response?.data?.message

      showSnackbar(message || 'Failed to remove customer.', 'error')

      return { success: false, error: message || 'Failed to remove customer.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── reorderStops(routeId, orderedCustomerIds) — PUT /routes/:id/sequence ────
  const reorderStops = async (routeId, orderedCustomerIds) => {
    isSubmitting.value = true
    try {
      const updated = await updateRouteSequenceService(routeId, orderedCustomerIds)

      if (selectedRoute.value?.id == routeId) {
        selectedRoute.value = updated
      }
      showSnackbar(updated?.message || 'Stop order updated successfully.')

      return { success: true }
    } catch (error) {
      const message = error?.response?.data?.message

      showSnackbar(message || 'Failed to reorder stops.', 'error')

      return { success: false, error: message || 'Failed to reorder stops.' }
    } finally {
      isSubmitting.value = false
    }
  }

  const clearSelected = () => {
    selectedRoute.value = null
    detailError.value   = ''
  }

  return {
    // List
    routes,
    totalRoutes,
    isListLoading,
    listError,

    // Filters
    selectedStatus,
    selectedRepresentativeId,
    selectedRouteDate,

    // Pagination
    page,
    itemsPerPage,

    // Sorting
    sortBy,
    sortDir,
    updateOptions,

    // Details
    selectedRoute,
    isDetailLoading,
    detailError,

    // Operations
    isSubmitting,
    isOptimizing,
    snackbar,
    fetchAllRoutes,
    fetchRoute,
    createRoute,
    updateSelectedRoute,
    removeRoute,
    optimizeSelectedRoute,
    updateStatus,
    assignCustomers,
    removeCustomer,
    reorderStops,
    clearSelected,
  }
}
