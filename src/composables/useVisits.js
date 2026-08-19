/**
 * useVisits.js
 *
 * Central composable for the Visits module.
 * All filtering, sorting, and pagination is handled SERVER-SIDE.
 *
 * Architecture:
 *   UI → useVisits (state + business logic) → visit.service (pure Axios)
 *
 * Conventions (shared across the project's list modules):
 *  - `page` is 1-based internally (Vuetify) and converted to 0-based for the API.
 *  - Any filter change resets page to 1.
 *  - Empty filters are omitted from the query string by the service layer.
 */

import { fetchVisits, fetchVisitById } from '@/services/visit.service'
import { INTL_LOCALE } from '@/utils/locale'

// ─── Status constants ─────────────────────────────────────────────────────────
// API values are preserved verbatim; only the labels are human-friendly.
export const VISIT_STATUSES = [
  { title: 'قيد التنفيذ', value: 'IN_PROGRESS' },
  { title: 'مكتملة',      value: 'COMPLETED'   },
  { title: 'فائتة',       value: 'MISSED'      },
]

export const resolveVisitStatusVariant = status => {
  switch (status?.toUpperCase()) {
    case 'COMPLETED':   return 'success'
    case 'IN_PROGRESS': return 'warning'
    case 'MISSED':      return 'error'
    default:            return 'secondary'
  }
}

export const visitStatusTitle = status =>
  VISIT_STATUSES.find(s => s.value === status)?.title ?? status ?? '—'

// ─── Formatters ───────────────────────────────────────────────────────────────
/**
 * Format an ISO timestamp for table/detail display. Returns '—' when missing
 * (an IN_PROGRESS visit has no checkOutTime yet).
 * @param {string} value - ISO 8601 timestamp
 */
export const formatVisitDateTime = value => {
  if (!value) return '—'

  const d = new Date(value)

  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat(INTL_LOCALE, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(d)
}

/**
 * Human-readable elapsed time between check-in and check-out.
 * Pure UI transformation — the API objects are never mutated.
 * @returns {string} e.g. "35 min", "1h 20m", or '—' when not computable
 */
export const formatVisitDuration = (checkInTime, checkOutTime) => {
  if (!checkInTime || !checkOutTime) return '—'

  const start = new Date(checkInTime).getTime()
  const end   = new Date(checkOutTime).getTime()

  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '—'

  const totalMinutes = Math.round((end - start) / 60000)
  if (totalMinutes < 60) return `${totalMinutes} min`

  const hours   = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  return minutes ? `${hours}h ${minutes}m` : `${hours}h`
}

/**
 * Backend sends a location as "lat,lng". Returns { lat, lng } or null.
 */
export const parseVisitLocation = value => {
  if (!value || typeof value !== 'string') return null

  const [lat, lng] = value.split(',').map(part => Number.parseFloat(part.trim()))

  if (Number.isNaN(lat) || Number.isNaN(lng)) return null

  return { lat, lng }
}

// ─── Composable ───────────────────────────────────────────────────────────────
export const useVisits = () => {
  // ── List State ──────────────────────────────────────────────────────────────
  const visits        = ref([])
  const isListLoading = ref(false)
  const listError     = ref('')

  // ── Filter State ────────────────────────────────────────────────────────────
  const selectedRepresentativeId = ref(null)
  const selectedRouteId          = ref(null)
  const selectedCustomerId       = ref(null)
  const selectedStatus           = ref(null)

  // ── Pagination State ────────────────────────────────────────────────────────
  const page         = ref(1)
  const itemsPerPage = ref(10)
  const totalVisits  = ref(0)

  // ── Sorting State ───────────────────────────────────────────────────────────
  const sortBy  = ref('id')
  const sortDir = ref('asc')

  // ── Single Visit (details page) ─────────────────────────────────────────────
  const selectedVisit   = ref(null)
  const isDetailLoading = ref(false)
  const detailError     = ref('')
  const detailStatus    = ref(null)   // HTTP status of the last detail failure

  // ── Feedback ────────────────────────────────────────────────────────────────
  const snackbar = ref({ show: false, message: '', color: 'success' })

  const showSnackbar = (message, color = 'success') => {
    snackbar.value = { show: true, message, color }
  }

  // Guards against a slow earlier response overwriting a newer one when the
  // user changes filters quickly. Cheap alternative to request cancellation.
  let latestRequestId = 0

  // ── fetchAllVisits() ────────────────────────────────────────────────────────
  const fetchAllVisits = async () => {
    const requestId = ++latestRequestId

    isListLoading.value = true
    listError.value     = ''

    try {
      const data = await fetchVisits({
        page:             page.value - 1,
        size:             itemsPerPage.value,
        representativeId: selectedRepresentativeId.value || undefined,
        routeId:          selectedRouteId.value          || undefined,
        customerId:       selectedCustomerId.value       || undefined,
        status:           selectedStatus.value           || undefined,
        sortBy:           sortBy.value,
        sortDir:          sortDir.value,
      })

      if (requestId !== latestRequestId) return

      visits.value      = data?.content       ?? []
      totalVisits.value = data?.totalElements ?? 0
    } catch (error) {
      if (requestId !== latestRequestId) return

      listError.value = error?.response?.data?.message || 'تعذّر تحميل الزيارات.'
      visits.value    = []
      showSnackbar(listError.value, 'error')
    } finally {
      if (requestId === latestRequestId) isListLoading.value = false
    }
  }

  // Filters always restart at the first page. When the page is already 1 we
  // fetch directly — otherwise the page watcher does it, so we never fire two
  // requests for a single filter change.
  const applyFilterChange = () => {
    if (page.value !== 1) page.value = 1
    else fetchAllVisits()
  }

  // ── Watchers ────────────────────────────────────────────────────────────────
  watch(
    [selectedRepresentativeId, selectedRouteId, selectedCustomerId, selectedStatus],
    applyFilterChange,
  )

  watch([page, itemsPerPage], (newValues, oldValues) => {
    // Changing the page size restarts at page 1; let that reset drive the fetch.
    const [newPage, newSize] = newValues
    const [oldPage, oldSize] = oldValues

    if (newSize !== oldSize && newPage !== 1) {
      page.value = 1

      return
    }

    fetchAllVisits()
  })

  // ── updateOptions (VDataTableServer @update:options) ────────────────────────
  // Only backend-sortable columns reach this — computed columns (e.g. Duration)
  // are declared `sortable: false` in the table headers.
  const updateOptions = options => {
    const firstSort  = options.sortBy?.[0]
    const newSortBy  = firstSort?.key ?? 'id'
    const newSortDir = firstSort?.order === 'desc' ? 'desc' : 'asc'
    const sortChanged = newSortBy !== sortBy.value || newSortDir !== sortDir.value

    sortBy.value  = newSortBy
    sortDir.value = newSortDir

    // Only the sort reset drives a fetch here; page clicks are handled by the
    // page watcher, so we must not refetch on every options emission.
    if (sortChanged) {
      if (page.value !== 1) page.value = 1
      else fetchAllVisits()
    }
  }

  // ── resetFilters() ──────────────────────────────────────────────────────────
  const resetFilters = () => {
    const hasFilters = selectedRepresentativeId.value
      || selectedRouteId.value
      || selectedCustomerId.value
      || selectedStatus.value

    if (!hasFilters) return

    // All four refs are watched as one array source, so clearing them in the
    // same tick produces a single watcher callback — and a single request.
    selectedRepresentativeId.value = null
    selectedRouteId.value          = null
    selectedCustomerId.value       = null
    selectedStatus.value           = null
  }

  // ── fetchVisit(id) — load a single visit for the details page ───────────────
  const fetchVisit = async id => {
    isDetailLoading.value = true
    detailError.value     = ''
    detailStatus.value    = null
    selectedVisit.value   = null

    try {
      selectedVisit.value = await fetchVisitById(id)
    } catch (error) {
      const status = error?.response?.status

      detailStatus.value = status ?? null

      if (status === 403)
        detailError.value = 'ليس لديك صلاحية لعرض هذه الزيارة.'
      else if (status === 404)
        detailError.value = `الزيارة رقم ${id} غير موجودة.`
      else
        detailError.value = error?.response?.data?.message || `تعذّر تحميل الزيارة رقم ${id}.`
    } finally {
      isDetailLoading.value = false
    }
  }

  const clearSelected = () => {
    selectedVisit.value = null
    detailError.value   = ''
    detailStatus.value  = null
  }

  return {
    // List
    visits,
    totalVisits,
    isListLoading,
    listError,

    // Filters
    selectedRepresentativeId,
    selectedRouteId,
    selectedCustomerId,
    selectedStatus,
    resetFilters,

    // Pagination
    page,
    itemsPerPage,

    // Sorting
    sortBy,
    sortDir,
    updateOptions,

    // Details
    selectedVisit,
    isDetailLoading,
    detailError,
    detailStatus,

    // Operations
    snackbar,
    fetchAllVisits,
    fetchVisit,
    clearSelected,
  }
}
