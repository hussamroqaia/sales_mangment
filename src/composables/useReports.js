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
  EMPTY_EXPORT_ERROR,
  REPORT_DEFINITIONS,
  REPORT_FILTERS,
  exportReport,
  readReportBlobError,
  runReport,
} from '@/services/report.service'
import { resolveApiError } from '@/utils/apiErrors'
import { toastSuccess } from '@/utils/swal'
import { useAuth } from '@/composables/useAuth'
import { INTL_LOCALE } from '@/utils/locale'

// ─── Category → roles, mirroring the backend @PreAuthorize annotations ────────
export const REPORT_CATEGORIES = {
  sales: { title: 'المبيعات',  icon: 'tabler-chart-line', roles: ['admin', 'sales_manager'] },
  customers: { title: 'العملاء',   icon: 'tabler-users-group', roles: ['admin', 'sales_manager'] },
  territories: { title: 'المناطق',   icon: 'tabler-map-pins',   roles: ['admin', 'sales_manager'] },
  routes: { title: 'المسارات',  icon: 'tabler-route',      roles: ['admin', 'sales_manager'] },
  inventory: { title: 'المخزون',   icon: 'tabler-packages',   roles: ['admin', 'warehouse_manager'] },
}

// ─── Formatters ───────────────────────────────────────────────────────────────
// Zero is real data everywhere here, so only null/undefined become a placeholder.

const NUMERIC_KEY = /total|amount|price|value|revenue|sales|cost/i
const PERCENT_KEY = /(?:percent|rate)$/i
const DATE_KEY    = /(?:date|at)$/i

export const formatReportCell = (key, value) => {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا'

  if (typeof value === 'number') {
    if (PERCENT_KEY.test(key)) return `${value.toFixed(1)}%`

    if (NUMERIC_KEY.test(key))
      return value.toLocaleString(INTL_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    return value.toLocaleString(INTL_LOCALE)
  }

  // ISO date (YYYY-MM-DD) or instant — rendered via the browser locale, but only
  // when the key actually names a date, so ids and codes are left alone.
  if (typeof value === 'string' && DATE_KEY.test(key) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const d = new Date(value.length === 10 ? `${value}T00:00:00` : value)

    if (!Number.isNaN(d.getTime()))
      return new Intl.DateTimeFormat(INTL_LOCALE, { year: 'numeric', month: 'short', day: '2-digit' }).format(d)
  }

  if (typeof value === 'object') return JSON.stringify(value)

  return String(value)
}

/**
 * Column label for a report record field.
 *
 * The backend JSON reports return typed DTOs (not the export-only ReportTable),
 * so there is no column-label metadata to use — the record component names ARE
 * the contract. Every field the 11 reports emit is mapped to Arabic below.
 *
 * A field that is not in the map (a new one added backend-side) falls back to a
 * readable camelCase split rather than rendering blank, so an unmapped column is
 * visible-but-English instead of broken. Add it here when that happens.
 */
export const REPORT_FIELD_LABELS = {
  // report envelope — every date-ranged report returns these two alongside `rows`
  from: 'من تاريخ',
  to: 'إلى تاريخ',

  // identity / shared
  id: 'المعرّف',
  name: 'الاسم',
  code: 'الرمز',
  status: 'الحالة',
  date: 'التاريخ',
  createdAt: 'تاريخ الإنشاء',
  updatedAt: 'تاريخ التحديث',

  // representative / user
  representativeId: 'معرّف المندوب',
  representativeName: 'المندوب',
  repName: 'المندوب',
  userId: 'معرّف المستخدم',
  userName: 'المستخدم',
  phoneNumber: 'رقم الهاتف',
  phone: 'رقم الهاتف',
  role: 'الدور',

  // customer
  customerId: 'معرّف العميل',
  customerName: 'العميل',
  customerCode: 'رمز العميل',
  customerType: 'نوع العميل',
  territoryId: 'معرّف المنطقة',
  territoryName: 'المنطقة',

  // product / inventory
  productId: 'معرّف المنتج',
  productName: 'المنتج',
  sku: 'رمز الصنف (SKU)',
  category: 'الفئة',
  unit: 'الوحدة',
  quantity: 'الكمية',
  quantityOnHand: 'الكمية المتوفرة',
  quantitySold: 'الكمية المباعة',
  quantityReturned: 'الكمية المرتجعة',
  quantityReceived: 'الكمية المستلمة',
  minimumQuantity: 'الحد الأدنى',
  minimumStock: 'الحد الأدنى للمخزون',
  currentStock: 'المخزون الحالي',
  openingStock: 'مخزون أول المدة',
  closingStock: 'مخزون آخر المدة',
  stockValue: 'قيمة المخزون',
  ageInDays: 'العمر (بالأيام)',
  daysInStock: 'أيام البقاء في المخزون',
  movementType: 'نوع الحركة',
  lastMovementDate: 'تاريخ آخر حركة',
  turnoverRate: 'معدل الدوران',

  // sales / invoice
  invoiceId: 'معرّف الفاتورة',
  invoiceNumber: 'رقم الفاتورة',
  invoiceDate: 'تاريخ الفاتورة',
  invoiceCount: 'عدد الفواتير',
  totalAmount: 'الإجمالي',
  totalSales: 'إجمالي المبيعات',
  totalRevenue: 'إجمالي الإيرادات',
  totalValue: 'القيمة الإجمالية',
  totalQuantity: 'إجمالي الكمية',
  subtotal: 'المجموع الفرعي',
  discount: 'الخصم',
  price: 'السعر',
  unitPrice: 'سعر الوحدة',
  averageOrderValue: 'متوسط قيمة الطلب',
  cost: 'التكلفة',

  // routes / visits
  routeId: 'معرّف المسار',
  routeName: 'المسار',
  routeDate: 'تاريخ المسار',
  visitId: 'معرّف الزيارة',
  visitDate: 'تاريخ الزيارة',
  visitStatus: 'حالة الزيارة',
  plannedVisits: 'الزيارات المخطّطة',
  completedVisits: 'الزيارات المكتملة',
  missedVisits: 'الزيارات الفائتة',
  totalVisits: 'إجمالي الزيارات',
  completionRate: 'نسبة الإنجاز',
  checkInTime: 'وقت الوصول',
  checkOutTime: 'وقت المغادرة',
  durationMinutes: 'المدة (بالدقائق)',
  notes: 'ملاحظات',

  // fill rate
  requestedQuantity: 'الكمية المطلوبة',
  fulfilledQuantity: 'الكمية المُلبّاة',
  fillRate: 'نسبة التلبية',

  // inventory reports (stock-levels, below-minimum, aging, movement, fill-rate,
  // fast/slow-moving) — key names taken from the live responses, not guessed
  onHand: 'الكمية المتوفرة',
  minStockLevel: 'الحد الأدنى للمخزون',
  belowMin: 'أقل من الحد الأدنى',
  unitsSold: 'الوحدات المباعة',
  revenue: 'الإيراد',
  classification: 'التصنيف',
  requested: 'المطلوب',
  fulfilled: 'المُلبّى',
  fillRatePercent: 'نسبة التلبية (%)',
  loadedToVans: 'المُحمّل على المركبات',
  returnedFromVans: 'المرتجع من المركبات',
  sold: 'المباع',
  net: 'الصافي',

  // stock variance
  countId: 'معرّف الجرد',
  countDate: 'تاريخ الجرد',
  finalizedAt: 'وقت الاعتماد',
  counted: 'الكمية المجردة',
  recorded: 'الكمية المسجلة',
  variance: 'الفروقات',

  // customer purchases
  totalSpent: 'إجمالي المشتريات',

  // territory reports (territories/sales, territories/customers)
  customerCount: 'عدد العملاء',

  // dormant customers
  lastInvoiceDate: 'تاريخ آخر فاتورة',
  neverPurchased: 'لم يشترِ مطلقًا',

  // customer average order value
  avgOrderValue: 'متوسط قيمة الطلب',

  // representative productivity — the `%` itself is added by the cell
  // formatter, so the header deliberately does not repeat it.
  avgInvoiceValue: 'متوسط قيمة الفاتورة',
  plannedStops: 'المحطات المخطّطة',
  visitCompletionPercent: 'نسبة إنجاز الزيارات',
}

/**
 * Cell renderers that need the WHOLE row, which `formatReportCell` cannot see.
 *
 * Kept to the few cases where one field's meaning depends on another: the
 * dormant-customers report returns `lastInvoiceDate: null` for a customer who
 * has never bought at all, and an em-dash there reads as "missing data" rather
 * than the fact it actually is.
 */
export const REPORT_CELL_OVERRIDES = {
  customerDormant: {
    lastInvoiceDate: (value, row) =>
      (row?.neverPurchased ? 'لم يشترِ مطلقًا' : formatReportCell('lastInvoiceDate', value)),

    // `neverPurchased` itself keeps the project's generic نعم/لا boolean
    // rendering: its column header already states the claim, and spelling the
    // sentence out again here would just repeat the date cell beside it.
  },
}

/** Row-aware cell text: an override when one exists, the generic formatter otherwise. */
export const formatReportRowCell = (reportKey, key, row) => {
  const override = REPORT_CELL_OVERRIDES[reportKey]?.[key]

  return override ? override(row?.[key], row) : formatReportCell(key, row?.[key])
}

const ACRONYMS = /\b(sku|id)\b/gi

/** Fallback for a field the map does not cover: `stockValue` → `Stock Value`. */
const splitCamelCase = key => key
  .replace(/([a-z\d])([A-Z])/g, '$1 $2')
  .replace(/^./, c => c.toUpperCase())
  .replace(ACRONYMS, match => match.toUpperCase())

export const humaniseKey = key => REPORT_FIELD_LABELS[key] ?? splitCamelCase(key)

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
  const showsCountId       = computed(() => supportsFilter(REPORT_FILTERS.COUNT_ID))

  // ── Filters ─────────────────────────────────────────────────────────────────
  const from             = ref(null)
  const to               = ref(null)
  const representativeId = ref(null)
  const customerId       = ref(null)
  const countId          = ref(null)

  /** Only the filters the selected report actually declares are handed on. */
  const activeFilters = computed(() => ({
    from: from.value || undefined,
    to: to.value || undefined,
    representativeId: representativeId.value ?? undefined,
    customerId: customerId.value ?? undefined,
    countId: countId.value ?? undefined,
  }))

  /** `from <= to`, checked rather than silently swapped. */
  const dateRangeError = computed(() => {
    if (!showsDateRange.value || !from.value || !to.value) return ''

    return from.value > to.value ? 'يجب ألّا يكون تاريخ البداية بعد تاريخ النهاية.' : ''
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
      runError.value   = resolveApiError(error, 'تعذّر تشغيل هذا التقرير.')
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
    if (!showsCountId.value) countId.value = null
    if (!showsDateRange.value) {
      from.value = null
      to.value = null
    }
  })

  // Filter edits mark the result stale without firing a request.
  watch([from, to, representativeId, customerId, countId], () => {
    if (hasRun.value) isStale.value = true
  })

  // ── Export state ────────────────────────────────────────────────────────────
  const exportingFormat = ref(null)   // 'xlsx' | 'pdf' | null
  const exportError     = ref('')

  /**
   * Download the current report as a file, reusing the on-screen filters.
   * The object URL is revoked immediately after the click hands the bytes to
   * the browser, so nothing is retained across the component's lifetime.
   *
   * A 204/zero-byte response is surfaced as a failure rather than saved: see
   * the note on `exportReport`, which raises EMPTY_EXPORT_ERROR for it.
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

      toastSuccess(`تم تنزيل التقرير بصيغة ${format.toUpperCase()}.`)
    } catch (error) {
      // The server answered, but with nothing to save — say so plainly instead
      // of reporting a transport failure that did not happen.
      exportError.value = error?.code === EMPTY_EXPORT_ERROR
        ? `لم يُرجع الخادم أي ملف لهذا التقرير بصيغة ${format.toUpperCase()}.`
        : await readReportBlobError(error)
          || `تعذّر تصدير التقرير بصيغة ${format.toUpperCase()}.`
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
    showsCountId,

    // Filters
    from,
    to,
    representativeId,
    customerId,
    countId,
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
