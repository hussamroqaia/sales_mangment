/**
 * useReports.js
 *
 * Central composable for the Reports module.
 *
 * Architecture:
 *   UI → useReports (catalogue + role gating + run/export state) → report.service
 *
 * ─── Role gating happens before any request ─────────────────────────────────
 * Categories are decided from the session role, never from a 403. The backend
 * splits reports by @PreAuthorize:
 *   sales / customers / routes → ADMIN, SALES_MANAGER
 *   inventory                  → ADMIN, WAREHOUSE_MANAGER
 *   SALES_REP                  → nothing (operational workflows are mobile-only)
 *
 * ─── Execution model ────────────────────────────────────────────────────────
 * Reports are run explicitly. Changing a filter marks the result stale but does
 * not fire a request; only Run does. Exports reuse the filters that are on
 * screen, so the file always matches what the user is looking at.
 */

import {
  REPORT_DEFINITIONS,
  REPORT_FILTERS,
  exportReport,
  readReportBlobError,
  runReport,
} from '@/services/report.service'
import { useAuth } from '@/composables/useAuth'

// ─── Category → roles, mirroring the backend @PreAuthorize annotations ────────
export const REPORT_CATEGORIES = {
  sales: { title: 'Sales',     icon: 'tabler-chart-line', roles: ['admin', 'sales_manager'] },
  customers: { title: 'Customers', icon: 'tabler-users-group', roles: ['admin', 'sales_manager'] },
  routes: { title: 'Routes',    icon: 'tabler-route',      roles: ['admin', 'sales_manager'] },
  inventory: { title: 'Inventory', icon: 'tabler-packages',   roles: ['admin', 'warehouse_manager'] },
}

// ─── Formatters ───────────────────────────────────────────────────────────────
// Zero is real data everywhere here, so only null/undefined become a placeholder.

const NUMERIC_KEY = /total|amount|price|value|revenue|sales|cost/i
const PERCENT_KEY = /(?:percent|rate)$/i
const DATE_KEY    = /(?:date|at)$/i

export const formatReportCell = (key, value) => {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'

  if (typeof value === 'number') {
    if (PERCENT_KEY.test(key)) return `${value.toFixed(1)}%`

    if (NUMERIC_KEY.test(key))
      return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    return value.toLocaleString('en-US')
  }

  // ISO date (YYYY-MM-DD) or instant — rendered via the browser locale, but only
  // when the key actually names a date, so ids and codes are left alone.
  if (typeof value === 'string' && DATE_KEY.test(key) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const d = new Date(value.length === 10 ? `${value}T00:00:00` : value)

    if (!Number.isNaN(d.getTime()))
      return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: '2-digit' }).format(d)
  }

  if (typeof value === 'object') return JSON.stringify(value)

  return String(value)
}

/**
 * `representativeName` → `Representative Name`.
 *
 * The backend JSON reports return typed DTOs (not the export-only ReportTable),
 * so there is no column-label metadata to use — the record component names ARE
 * the contract. Splitting camelCase gives a faithful label for every field in
 * all 11 reports; the acronym pass only rescues the two that would otherwise
 * read as `Sku` and `... Id`.
 */
const ACRONYMS = /\b(sku|id)\b/gi

export const humaniseKey = key => key
  .replace(/([a-z\d])([A-Z])/g, '$1 $2')
  .replace(/^./, c => c.toUpperCase())
  .replace(ACRONYMS, match => match.toUpperCase())

// ─── Composable ───────────────────────────────────────────────────────────────
export const useReports = () => {
  const { userData } = useAuth()

  const role = computed(() => userData.value?.role?.toLowerCase() ?? null)

  /** Categories this role may open. Drives navigation, tabs, and requests alike. */
  const allowedCategories = computed(() =>
    Object.entries(REPORT_CATEGORIES)
      .filter(([, meta]) => meta.roles.includes(role.value))
      .map(([key, meta]) => ({ key, ...meta })))

  const hasAnyReportAccess = computed(() => allowedCategories.value.length > 0)

  /** Reports inside the categories this role may open. */
  const allowedReports = computed(() => {
    const categories = new Set(allowedCategories.value.map(c => c.key))

    return Object.values(REPORT_DEFINITIONS).filter(d => categories.has(d.category))
  })

  const canRunReport = reportKey => {
    const definition = REPORT_DEFINITIONS[reportKey]

    return Boolean(definition) && REPORT_CATEGORIES[definition.category]?.roles.includes(role.value)
  }

  // ── Selection ───────────────────────────────────────────────────────────────
  const selectedReportKey = ref(allowedReports.value[0]?.key ?? null)

  const selectedReport = computed(() =>
    (selectedReportKey.value ? REPORT_DEFINITIONS[selectedReportKey.value] : null))

  const supportsFilter = filter => Boolean(selectedReport.value?.filters.includes(filter))

  const showsDateRange     = computed(() => supportsFilter(REPORT_FILTERS.DATE_RANGE))
  const showsRepresentative = computed(() => supportsFilter(REPORT_FILTERS.REPRESENTATIVE))
  const showsCustomer      = computed(() => supportsFilter(REPORT_FILTERS.CUSTOMER))

  // ── Filters ─────────────────────────────────────────────────────────────────
  const from             = ref(null)
  const to               = ref(null)
  const representativeId = ref(null)
  const customerId       = ref(null)

  /** Only the filters the selected report actually declares are handed on. */
  const activeFilters = computed(() => ({
    from: from.value || undefined,
    to: to.value || undefined,
    representativeId: representativeId.value ?? undefined,
    customerId: customerId.value ?? undefined,
  }))

  /** `from <= to`, checked rather than silently swapped. */
  const dateRangeError = computed(() => {
    if (!showsDateRange.value || !from.value || !to.value) return ''

    return from.value > to.value ? 'The "from" date must not be after the "to" date.' : ''
  })

  // ── Run state ───────────────────────────────────────────────────────────────
  const reportData  = ref(null)
  const isRunning   = ref(false)
  const runError    = ref('')
  const hasRun      = ref(false)
  const isStale     = ref(false)   // filters changed since the last run

  // Guards against a late response for report A landing after the user switched
  // to report B. The in-flight request is also aborted outright.
  let latestRunId = 0
  let inFlight = null

  const abortInFlight = () => {
    inFlight?.abort()
    inFlight = null
  }

  const resetResults = () => {
    reportData.value = null
    runError.value   = ''
    hasRun.value     = false
    isStale.value    = false
  }

  const run = async () => {
    if (!selectedReportKey.value || !canRunReport(selectedReportKey.value)) return
    if (dateRangeError.value) return
    if (isRunning.value) return

    abortInFlight()

    const controller = new AbortController()

    inFlight = controller

    const runId = ++latestRunId
    const reportKey = selectedReportKey.value

    isRunning.value = true
    runError.value  = ''

    try {
      const data = await runReport(reportKey, activeFilters.value, controller.signal)

      // Discard if superseded or if the selection moved on while in flight.
      if (runId !== latestRunId || reportKey !== selectedReportKey.value) return

      reportData.value = data
      hasRun.value     = true
      isStale.value    = false
    } catch (error) {
      if (error?.name === 'CanceledError' || error?.name === 'AbortError') return
      if (runId !== latestRunId || reportKey !== selectedReportKey.value) return

      // No fallback rows — a failed run must never leave stale data on screen
      // looking like a result.
      reportData.value = null
      hasRun.value     = true
      runError.value   = error?.response?.data?.message || 'Failed to run this report.'
    } finally {
      if (runId === latestRunId) {
        isRunning.value = false
        inFlight = null
      }
    }
  }

  // Switching report clears the previous report's results outright.
  watch(selectedReportKey, () => {
    abortInFlight()
    latestRunId += 1
    isRunning.value = false
    resetResults()

    // Drop filters the newly selected report cannot honour.
    if (!showsRepresentative.value) representativeId.value = null
    if (!showsCustomer.value) customerId.value = null
    if (!showsDateRange.value) {
      from.value = null
      to.value = null
    }
  })

  // Filter edits mark the result stale without firing a request.
  watch([from, to, representativeId, customerId], () => {
    if (hasRun.value) isStale.value = true
  })

  // ── Export state ────────────────────────────────────────────────────────────
  const exportingFormat = ref(null)   // 'xlsx' | 'pdf' | null
  const exportError     = ref('')

  /**
   * Download the current report as a file, reusing the on-screen filters.
   * The object URL is revoked immediately after the click hands the bytes to
   * the browser, so nothing is retained across the component's lifetime.
   */
  const exportAs = async format => {
    if (!selectedReportKey.value || !canRunReport(selectedReportKey.value)) return
    if (dateRangeError.value) return
    if (exportingFormat.value) return   // one export at a time

    exportingFormat.value = format
    exportError.value     = ''

    try {
      const { blob, filename } = await exportReport(selectedReportKey.value, activeFilters.value, format)
      const url = URL.createObjectURL(blob)

      try {
        const link = document.createElement('a')

        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
        link.remove()
      } finally {
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      exportError.value = await readReportBlobError(error)
        || `Failed to export this report as ${format.toUpperCase()}.`
    } finally {
      exportingFormat.value = null
    }
  }

  // A run still in flight when the page unmounts is cancelled, not left dangling.
  onScopeDispose(abortInFlight)

  return {
    // Catalogue + gating
    role,
    allowedCategories,
    allowedReports,
    hasAnyReportAccess,
    canRunReport,

    // Selection
    selectedReportKey,
    selectedReport,
    showsDateRange,
    showsRepresentative,
    showsCustomer,

    // Filters
    from,
    to,
    representativeId,
    customerId,
    dateRangeError,

    // Run
    reportData,
    isRunning,
    runError,
    hasRun,
    isStale,
    run,

    // Export
    exportingFormat,
    exportError,
    exportAs,
  }
}
