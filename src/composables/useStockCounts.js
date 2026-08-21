/**
 * useStockCounts.js
 *
 * Central composable for the Stock Counts module (physical warehouse stock-take).
 *
 * Architecture:
 *   UI → useStockCounts (state + business logic) → stockCount.service (pure Axios)
 *
 * ⚠️ Differs from the other list modules on purpose: GET /stock-counts returns a
 * plain array rather than a page, so filtering, sorting and paging all happen
 * CLIENT-SIDE here. `page` stays 1-based (Vuetify convention) and there is no
 * 0-based conversion, because no page index is ever sent to the API.
 *
 * Confirmations / modals live in the UI layer, not here.
 */

import { resolveApiError, translateBackendMessage } from '@/utils/apiErrors'
import {
  fetchStockCounts,
  fetchStockCountById,
  createStockCount as createStockCountService,
  updateStockCountLines as updateStockCountLinesService,
  finalizeStockCount as finalizeStockCountService,
} from '@/services/stockCount.service'

// ─── Status constants (shared with the list / details components) ─────────────
export const STOCK_COUNT_STATUSES = [
  { title: 'مسودة', value: 'DRAFT'     },
  { title: 'معتمد', value: 'FINALIZED' },
]

export const resolveStockCountStatusVariant = status =>
  status?.toUpperCase() === 'FINALIZED' ? 'success' : 'warning'

export const resolveStockCountStatusTitle = status =>
  STOCK_COUNT_STATUSES.find(s => s.value === status?.toUpperCase())?.title ?? status ?? '—'

/** A count can only be edited or finalized while it is still a draft. */
export const isDraftCount = count => count?.status?.toUpperCase() === 'DRAFT'

// ─── Variance helpers ─────────────────────────────────────────────────────────
// `variance` = countedQuantity − recordedQuantity, and stays null until the
// count is finalized. Negative means the shelf holds less than the system says.
export const resolveVarianceVariant = variance => {
  if (variance === null || variance === undefined) return 'secondary'
  if (variance === 0) return 'success'

  return variance < 0 ? 'error' : 'info'
}

export const resolveVarianceLabel = variance => {
  if (variance === null || variance === undefined) return '—'
  if (variance === 0) return 'مطابق'

  return variance < 0 ? `عجز ${Math.abs(variance)}` : `زيادة ${variance}`
}

/** Today as a wire-format calendar date, built from LOCAL parts (not UTC). */
export const todayIsoDate = () => {
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Normalize a picker value (Date or string) to the YYYY-MM-DD the API expects. */
export const toIsoDate = value => {
  if (!value) return undefined
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value

  const d = new Date(value)

  if (Number.isNaN(d.getTime())) return undefined

  const pad = n => String(n).padStart(2, '0')

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ─── Composable ───────────────────────────────────────────────────────────────
export const useStockCounts = () => {
  // ── List State ──────────────────────────────────────────────────────────────
  const counts        = ref([])
  const isListLoading = ref(false)
  const listError     = ref('')

  // ── Filter State (applied client-side) ──────────────────────────────────────
  const selectedStatus = ref(null)
  const countDate      = ref(null)

  // ── Pagination State (client-side) ──────────────────────────────────────────
  const page         = ref(1)
  const itemsPerPage = ref(10)

  // ── Single Count (details modal / edit drawer) ──────────────────────────────
  const selectedCount   = ref(null)
  const isDetailLoading = ref(false)
  const detailError     = ref('')

  // ── Operation State ─────────────────────────────────────────────────────────
  const isSubmitting = ref(false)
  const snackbar     = ref({ show: false, message: '', color: 'success' })

  const showSnackbar = (message, color = 'success') => {
    snackbar.value = { show: true, message, color }
  }

  // ── Derived list ────────────────────────────────────────────────────────────
  const filteredCounts = computed(() => {
    const status = selectedStatus.value
    const date   = toIsoDate(countDate.value)

    return counts.value.filter(c => {
      const statusMatches = !status || c.status?.toUpperCase() === status
      const dateMatches   = !date || c.countDate === date

      return statusMatches && dateMatches
    })
  })

  const totalCounts = computed(() => filteredCounts.value.length)

  const draftTotal = computed(() => counts.value.filter(isDraftCount).length)

  // ── fetchAllCounts() ────────────────────────────────────────────────────────
  const fetchAllCounts = async () => {
    isListLoading.value = true
    listError.value     = ''

    try {
      const data = await fetchStockCounts()

      // Newest first — the API answers in insertion order.
      counts.value = [...(Array.isArray(data) ? data : [])].sort((a, b) => (b.id ?? 0) - (a.id ?? 0))
    } catch (error) {
      listError.value = resolveApiError(error, 'تعذّر تحميل عمليات الجرد.')
      showSnackbar(listError.value, 'error')
    } finally {
      isListLoading.value = false
    }
  }

  // Filtering is client-side, so a filter change only needs the view reset to
  // the first page — no refetch.
  watch([selectedStatus, countDate], () => {
    page.value = 1
  })

  // ── fetchCount(id) ──────────────────────────────────────────────────────────
  const fetchCount = async id => {
    isDetailLoading.value = true
    detailError.value     = ''
    selectedCount.value   = null

    try {
      selectedCount.value = await fetchStockCountById(id)
    } catch (error) {
      detailError.value = resolveApiError(error, `تعذّر تحميل عملية الجرد رقم ${id}.`)
      showSnackbar(detailError.value, 'error')
    } finally {
      isDetailLoading.value = false
    }
  }

  // ── createCount(payload) ────────────────────────────────────────────────────
  const createCount = async payload => {
    isSubmitting.value = true
    try {
      await createStockCountService(payload)
      showSnackbar('تم إنشاء مسودة الجرد بنجاح.')
      await fetchAllCounts()
      page.value = 1

      return { success: true }
    } catch (error) {
      const message = resolveApiError(error, '')

      showSnackbar(message || 'تعذّر إنشاء عملية الجرد.', 'error')

      return { success: false, error: message || 'تعذّر إنشاء عملية الجرد.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── saveLines(id, lines) — PUT replaces the whole line set ──────────────────
  const saveLines = async (id, lines) => {
    isSubmitting.value = true
    try {
      await updateStockCountLinesService(id, lines)
      showSnackbar('تم تحديث أسطر الجرد.')
      await fetchAllCounts()

      return { success: true }
    } catch (error) {
      const message = resolveApiError(error, '')

      showSnackbar(message || 'تعذّر تحديث أسطر الجرد.', 'error')

      return { success: false, error: message || 'تعذّر تحديث أسطر الجرد.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── finalizeCount(id) — confirmation handled in the UI ──────────────────────
  const finalizeCount = async id => {
    isSubmitting.value = true
    try {
      const res = await finalizeStockCountService(id)

      showSnackbar(translateBackendMessage(res?.message) || 'تم اعتماد عملية الجرد.')
      await fetchAllCounts()

      // Hand the finalized count back so the caller can show the variances that
      // only come into existence with this call.
      return { success: true, data: res?.data ?? null }
    } catch (error) {
      const message = resolveApiError(error, '')

      showSnackbar(message || 'تعذّر اعتماد عملية الجرد.', 'error')

      return { success: false, error: message || 'تعذّر اعتماد عملية الجرد.' }
    } finally {
      isSubmitting.value = false
    }
  }

  const clearSelected = () => {
    selectedCount.value = null
    detailError.value   = ''
  }

  return {
    // List
    counts,
    filteredCounts,
    totalCounts,
    draftTotal,
    isListLoading,
    listError,

    // Filters
    selectedStatus,
    countDate,

    // Pagination
    page,
    itemsPerPage,

    // Details
    selectedCount,
    isDetailLoading,
    detailError,

    // Operations
    isSubmitting,
    snackbar,
    fetchAllCounts,
    fetchCount,
    createCount,
    saveLines,
    finalizeCount,
    clearSelected,
  }
}
