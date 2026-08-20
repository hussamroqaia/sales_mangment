/**
 * useInvoices.js
 *
 * Central composable for the Invoice module (management web scope).
 * All filtering, sorting, and pagination is handled SERVER-SIDE.
 *
 * Architecture:
 *   UI → useInvoices (state + business logic) → invoice.service (pure Axios)
 *
 * Conventions (shared across the project's list modules — see useVisits.js):
 *  - `page` is 1-based internally (Vuetify) and converted to 0-based for the API.
 *  - Any filter change resets page to 1.
 *  - Empty filters are omitted from the query string by the service layer.
 *
 * Scope: the review half of the invoice lifecycle only. Draft creation, editing,
 * deletion, submission, and ePOD upload are SALES_REP mobile workflows and have
 * no service call, no state, and no action here.
 */

import { INTL_LOCALE, formatMoney } from '@/utils/locale'
import { resolveApiError } from '@/utils/apiErrors'
import {
  approveInvoice,
  EMPTY_PDF_ERROR,
  fetchInvoiceById,
  fetchInvoiceEpodFile,
  fetchInvoicePdf,
  fetchInvoices,
  readBlobErrorMessage,
  rejectInvoice,
} from '@/services/invoice.service'

// ─── Status constants ─────────────────────────────────────────────────────────
// API values are preserved verbatim; only the labels are human-friendly.
export const INVOICE_STATUS_OPTIONS = [
  { title: 'مسودة',       value: 'DRAFT'    },
  { title: 'مرسلة',       value: 'SENT'     },
  { title: 'موافق عليها', value: 'APPROVED' },
  { title: 'مرفوضة',      value: 'REJECTED' },
]

export const resolveInvoiceStatusVariant = status => {
  switch (status?.toUpperCase()) {
  case 'APPROVED': return { color: 'success',   icon: 'tabler-check'       }
  case 'REJECTED': return { color: 'error',     icon: 'tabler-x'           }
  case 'SENT':     return { color: 'warning',   icon: 'tabler-mail'        }
  case 'DRAFT':    return { color: 'secondary', icon: 'tabler-folder'      }
  default:         return { color: 'secondary', icon: 'tabler-help-circle' }
  }
}

export const invoiceStatusTitle = status =>
  INVOICE_STATUS_OPTIONS.find(s => s.value === status)?.title ?? status ?? '—'

/**
 * Only a SENT invoice can be reviewed — the backend answers 409 for anything
 * else (InvoiceService.approve/reject). Mirrored here purely so the UI does not
 * offer an action that is guaranteed to fail; the backend stays authoritative.
 */
export const isReviewable = invoice => invoice?.status === 'SENT'

// Matches @Size(max = 1000) on RejectInvoiceRequest.reason.
export const REJECTION_REASON_MAX_LENGTH = 1000

// ─── Formatters ───────────────────────────────────────────────────────────────
/** Format an ISO calendar date (`YYYY-MM-DD`) for display. */
export const formatInvoiceDate = value => {
  if (!value) return '—'

  const d = new Date(`${value}T00:00:00`)

  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat(INTL_LOCALE, {
    year: 'numeric', month: 'short', day: '2-digit',
  }).format(d)
}

/** Format an ISO instant (createdAt / capturedAt) for display. */
export const formatInvoiceTimestamp = value => {
  if (!value) return '—'

  const d = new Date(value)

  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat(INTL_LOCALE, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(d)
}

/**
 * `totalAmount`, `price`, `discount`, and `subtotal` arrive as JSON numbers
 * serialised from BigDecimal. Rendered with two decimals and no assumed symbol.
 */
export const formatAmount = formatMoney

// ─── Composable ───────────────────────────────────────────────────────────────
export const useInvoices = () => {
  // ── List State ──────────────────────────────────────────────────────────────
  const invoices      = ref([])
  const isListLoading = ref(false)
  const listError     = ref('')

  // ── Filter State (exactly the four the controller accepts) ──────────────────
  const selectedRepresentativeId = ref(null)
  const selectedCustomerId       = ref(null)
  const selectedStatus           = ref(null)
  const selectedInvoiceDate      = ref(null)

  // ── Pagination State ────────────────────────────────────────────────────────
  const page          = ref(1)
  const itemsPerPage  = ref(10)
  const totalInvoices = ref(0)

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

  // ── Single Invoice (details page) ───────────────────────────────────────────
  const selectedInvoice = ref(null)
  const isDetailLoading = ref(false)
  const detailError     = ref('')
  const detailStatus    = ref(null)   // HTTP status of the last detail failure

  // ── Review State ────────────────────────────────────────────────────────────
  const isReviewing  = ref(false)     // guards against a double approve/reject
  const reviewError  = ref('')

  // ── Binary State ────────────────────────────────────────────────────────────
  const isPdfLoading = ref(false)
  const epodUrls     = ref({})        // { SIGNATURE: objectUrl, DELIVERY_PHOTO: objectUrl }
  const isEpodLoading = ref(false)
  const epodError    = ref('')

  // ── Feedback ────────────────────────────────────────────────────────────────
  const snackbar = ref({ show: false, message: '', color: 'success' })

  const showSnackbar = (message, color = 'success') => {
    snackbar.value = { show: true, message, color }
  }

  // Guards against a slow earlier response overwriting a newer one when the
  // user changes filters quickly. Cheap alternative to request cancellation.
  let latestRequestId = 0

  // ── fetchAllInvoices() ──────────────────────────────────────────────────────
  const fetchAllInvoices = async () => {
    const requestId = ++latestRequestId

    isListLoading.value = true
    listError.value     = ''

    try {
      const data = await fetchInvoices({
        page: page.value - 1,
        size: itemsPerPage.value,
        representativeId: selectedRepresentativeId.value || undefined,
        customerId: selectedCustomerId.value       || undefined,
        status: selectedStatus.value           || undefined,
        invoiceDate: selectedInvoiceDate.value      || undefined,
        sortBy: sortBy.value,
        sortDir: sortDir.value,
      })

      if (requestId !== latestRequestId) return

      invoices.value      = data?.content       ?? []
      totalInvoices.value = data?.totalElements ?? 0
    } catch (error) {
      if (requestId !== latestRequestId) return

      listError.value = resolveApiError(error, 'تعذّر تحميل الفواتير.')
      invoices.value  = []
      totalInvoices.value = 0
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
    else fetchAllInvoices()
  }

  // ── Watchers ────────────────────────────────────────────────────────────────
  watch(
    [selectedRepresentativeId, selectedCustomerId, selectedStatus, selectedInvoiceDate],
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

    fetchAllInvoices()
  })

  // ── updateOptions (VDataTableServer @update:options) ────────────────────────
  const updateOptions = options => {
    const firstSort   = options.sortBy?.[0]
    const newSortBy   = firstSort?.key ?? DEFAULT_SORT_BY
    const newSortDir  = firstSort
      ? (firstSort.order === 'desc' ? 'desc' : 'asc')
      : DEFAULT_SORT_DIR
    const sortChanged = newSortBy !== sortBy.value || newSortDir !== sortDir.value

    sortBy.value  = newSortBy
    sortDir.value = newSortDir

    // Only the sort reset drives a fetch here; page clicks are handled by the
    // page watcher, so we must not refetch on every options emission.
    if (sortChanged) {
      if (page.value !== 1) page.value = 1
      else fetchAllInvoices()
    }
  }

  // ── resetFilters() ──────────────────────────────────────────────────────────
  const resetFilters = () => {
    const hasFilters = selectedRepresentativeId.value
      || selectedCustomerId.value
      || selectedStatus.value
      || selectedInvoiceDate.value

    if (!hasFilters) return

    // All four refs are watched as one array source, so clearing them in the
    // same tick produces a single watcher callback — and a single request.
    selectedRepresentativeId.value = null
    selectedCustomerId.value       = null
    selectedStatus.value           = null
    selectedInvoiceDate.value      = null
  }

  // ── fetchInvoice(id) — load one invoice for the details page ────────────────
  const fetchInvoice = async id => {
    isDetailLoading.value  = true
    detailError.value      = ''
    detailStatus.value     = null
    selectedInvoice.value  = null

    try {
      selectedInvoice.value = await fetchInvoiceById(id)
    } catch (error) {
      const status = error?.response?.status

      detailStatus.value = status ?? null

      if (status === 403)
        detailError.value = 'ليس لديك صلاحية لعرض هذه الفاتورة.'
      else if (status === 404)
        detailError.value = `الفاتورة رقم ${id} غير موجودة.`
      else
        detailError.value = resolveApiError(error, `تعذّر تحميل الفاتورة رقم ${id}.`)
    } finally {
      isDetailLoading.value = false
    }
  }

  // ── Review actions ──────────────────────────────────────────────────────────
  // Both re-read the invoice from the mutation's own response, so the UI shows
  // the server's post-transition state rather than an optimistic guess.

  /**
   * @param {number|string} id
   * @returns {Promise<boolean>} true when the transition succeeded
   */
  const approve = async id => {
    if (isReviewing.value) return false

    isReviewing.value = true
    reviewError.value = ''

    try {
      selectedInvoice.value = await approveInvoice(id)
      showSnackbar('تمت الموافقة على الفاتورة.')

      return true
    } catch (error) {
      reviewError.value = resolveApiError(error, 'تعذّرت الموافقة على الفاتورة.')
      showSnackbar(reviewError.value, 'error')

      // 409 means somebody else already reviewed it — resync so the buttons
      // disappear instead of inviting a second doomed attempt.
      if (error?.response?.status === 409) await fetchInvoice(id)

      return false
    } finally {
      isReviewing.value = false
    }
  }

  /**
   * @param {number|string} id
   * @param {string} reason - non-blank; trimmed before sending
   * @returns {Promise<boolean>} true when the transition succeeded
   */
  const reject = async (id, reason) => {
    if (isReviewing.value) return false

    const trimmed = (reason ?? '').trim()

    if (!trimmed) {
      reviewError.value = 'سبب الرفض مطلوب.'

      return false
    }

    isReviewing.value = true
    reviewError.value = ''

    try {
      selectedInvoice.value = await rejectInvoice(id, trimmed)
      showSnackbar('تم رفض الفاتورة.')

      return true
    } catch (error) {
      reviewError.value = resolveApiError(error, 'تعذّر رفض الفاتورة.')
      showSnackbar(reviewError.value, 'error')

      if (error?.response?.status === 409) await fetchInvoice(id)

      return false
    } finally {
      isReviewing.value = false
    }
  }

  // ── Binary actions ──────────────────────────────────────────────────────────
  /**
   * Download the invoice PDF.
   *
   * The endpoint is protected, so the bytes are pulled through apiClient (token
   * attached) and handed to the browser as a short-lived object URL rather than
   * linked directly — a plain href would arrive without an Authorization header.
   */
  const downloadPdf = async id => {
    if (isPdfLoading.value) return

    isPdfLoading.value = true

    try {
      const { blob, filename } = await fetchInvoicePdf(id)
      const url = URL.createObjectURL(blob)

      try {
        const link = document.createElement('a')

        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
        link.remove()
      } finally {
        // The click has already handed the bytes to the download manager, so the
        // URL can go immediately — a deferred revoke would leak if the component
        // unmounts first.
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      // The backend answers 204/empty for every non-draft invoice today, which
      // the service raises rather than letting a 0-byte file reach the user.
      const message = error?.code === EMPTY_PDF_ERROR
        ? 'ملف PDF لهذه الفاتورة غير متاح حاليًا من الخادم.'
        : await readBlobErrorMessage(error)
          || (error?.response?.status === 409
            ? 'لا يمكن تنزيل ملف PDF لفاتورة في حالة مسودة قبل إرسالها.'
            : 'تعذّر تنزيل ملف الفاتورة.')

      showSnackbar(message, 'error')
    } finally {
      isPdfLoading.value = false
    }
  }

  /**
   * Load one ePOD artifact as an object URL for display.
   *
   * The stored file is never served statically — every read goes through the
   * protected endpoint — so `<img src>` cannot point at it directly. Each URL is
   * cached per type and released by `revokeEpodUrls()`.
   */
  const loadEpod = async (id, type) => {
    if (epodUrls.value[type]) return epodUrls.value[type]

    isEpodLoading.value = true
    epodError.value     = ''

    try {
      const blob = await fetchInvoiceEpodFile(id, type)
      const url  = URL.createObjectURL(blob)

      epodUrls.value = { ...epodUrls.value, [type]: url }

      return url
    } catch (error) {
      epodError.value = await readBlobErrorMessage(error)
        || 'تعذّر تحميل ملف إثبات التسليم.'

      return null
    } finally {
      isEpodLoading.value = false
    }
  }

  /**
   * Release every object URL this composable created. MUST be called on unmount
   * and before loading a different invoice, or the blobs stay pinned in memory
   * for the life of the document.
   */
  const revokeEpodUrls = () => {
    Object.values(epodUrls.value).forEach(URL.revokeObjectURL)
    epodUrls.value = {}
  }

  const clearSelected = () => {
    revokeEpodUrls()
    selectedInvoice.value = null
    detailError.value     = ''
    detailStatus.value    = null
    reviewError.value     = ''
    epodError.value       = ''
  }

  // Safety net: a component that forgets to clear still releases its blobs.
  onScopeDispose(revokeEpodUrls)

  return {
    // List
    invoices,
    totalInvoices,
    isListLoading,
    listError,

    // Filters
    selectedRepresentativeId,
    selectedCustomerId,
    selectedStatus,
    selectedInvoiceDate,
    resetFilters,

    // Pagination
    page,
    itemsPerPage,

    // Sorting
    sortBy,
    sortDir,
    updateOptions,

    // Details
    selectedInvoice,
    isDetailLoading,
    detailError,
    detailStatus,

    // Review
    isReviewing,
    reviewError,
    approve,
    reject,

    // Binary
    isPdfLoading,
    downloadPdf,
    epodUrls,
    isEpodLoading,
    epodError,
    loadEpod,
    revokeEpodUrls,

    // Operations
    snackbar,
    fetchAllInvoices,
    fetchInvoice,
    clearSelected,
  }
}
