/**
 * report.service.js
 *
 * Pure service layer — only Axios calls, no state, no composables.
 * The Axios instance (src/services/apiClient.js) auto-attaches the Bearer token.
 *
 * Covers the 11 non-dashboard report endpoints. The two dashboard KPI endpoints
 * live in dashboard.service.js and are deliberately NOT merged here: they take
 * no filters, have no export path, and are consumed by a different screen.
 *
 * ─── Contract, verified against controller source ───────────────────────────
 * Every endpoint takes `?format=json|xlsx|pdf`. ReportResponseFactory.parse()
 * upper-cases the raw value, so `format` is CASE-INSENSITIVE and defaults to
 * JSON when absent; anything else is a 400. JSON comes back in the standard
 * ApiResponse envelope; xlsx/pdf come back as a file attachment.
 *
 * Filters are NOT uniform — each endpoint below lists exactly what its
 * controller method declares. Notably:
 *   • `customerId` exists on /sales/invoices ONLY.
 *   • /customers/purchases takes from/to only — it has no customerId.
 *   • /inventory/stock-levels, /below-minimum and /aging take NO date range.
 * Sending an unsupported param would be silently ignored, but the UI must not
 * offer a filter the report cannot honour, so the `filters` list here is the
 * single source of truth the composable and UI both read.
 *
 * Dates are @DateTimeFormat(iso = ISO.DATE) → literal `YYYY-MM-DD`.
 * The range is documented as half-open `[from, to)`.
 */

import apiClient from '@/services/apiClient'

const BASE = '/reports'

/** Filter keys a report can accept. Used by the UI to render only real filters. */
export const REPORT_FILTERS = {
  DATE_RANGE: 'dateRange',
  REPRESENTATIVE: 'representativeId',
  CUSTOMER: 'customerId',
  COUNT_ID: 'countId',
}

/**
 * Single source of truth for the report catalogue: path, owning category, and
 * the exact filters the backend method declares. Adding a report is one entry.
 */
export const REPORT_DEFINITIONS = {
  salesRepPerformance: {
    key: 'salesRepPerformance',
    category: 'sales',
    title: 'أداء المندوبين',
    path: `${BASE}/sales/rep-performance`,
    filenameSlug: 'rep-performance',
    filters: [REPORT_FILTERS.DATE_RANGE],
  },
  salesInvoices: {
    key: 'salesInvoices',
    category: 'sales',
    title: 'الفواتير',
    path: `${BASE}/sales/invoices`,
    filenameSlug: 'invoices',
    filters: [REPORT_FILTERS.DATE_RANGE, REPORT_FILTERS.REPRESENTATIVE, REPORT_FILTERS.CUSTOMER],
  },
  customerPurchases: {
    key: 'customerPurchases',
    category: 'customers',
    title: 'مشتريات العملاء',
    path: `${BASE}/customers/purchases`,
    filenameSlug: 'customer-purchases',

    // No customerId: the controller method declares from/to/format only.
    filters: [REPORT_FILTERS.DATE_RANGE],
  },
  routePerformance: {
    key: 'routePerformance',
    category: 'routes',
    title: 'أداء المسارات',
    path: `${BASE}/routes/performance`,
    filenameSlug: 'route-performance',
    filters: [REPORT_FILTERS.DATE_RANGE, REPORT_FILTERS.REPRESENTATIVE],
  },
  routeMissedVisits: {
    key: 'routeMissedVisits',
    category: 'routes',
    title: 'الزيارات الفائتة',
    path: `${BASE}/routes/missed-visits`,
    filenameSlug: 'missed-visits',
    filters: [REPORT_FILTERS.DATE_RANGE, REPORT_FILTERS.REPRESENTATIVE],
  },
  inventoryStockLevels: {
    key: 'inventoryStockLevels',
    category: 'inventory',
    title: 'مستويات المخزون',
    path: `${BASE}/inventory/stock-levels`,
    filenameSlug: 'stock-levels',

    // Point-in-time snapshot — the controller declares no date range.
    filters: [],
  },
  inventoryBelowMinimum: {
    key: 'inventoryBelowMinimum',
    category: 'inventory',
    title: 'أقل من الحد الأدنى',
    path: `${BASE}/inventory/below-minimum`,
    filenameSlug: 'below-minimum',
    filters: [],
  },
  inventoryMovement: {
    key: 'inventoryMovement',
    category: 'inventory',
    title: 'حركة المخزون',
    path: `${BASE}/inventory/movement`,
    filenameSlug: 'movement',
    filters: [REPORT_FILTERS.DATE_RANGE],
  },
  inventoryFastSlowMoving: {
    key: 'inventoryFastSlowMoving',
    category: 'inventory',
    title: 'الأصناف سريعة وبطيئة الحركة',
    path: `${BASE}/inventory/fast-slow-moving`,
    filenameSlug: 'fast-slow-moving',
    filters: [REPORT_FILTERS.DATE_RANGE],
  },
  inventoryAging: {
    key: 'inventoryAging',
    category: 'inventory',
    title: 'أعمار المخزون',
    path: `${BASE}/inventory/aging`,
    filenameSlug: 'aging',
    filters: [],
  },
  inventoryFillRate: {
    key: 'inventoryFillRate',
    category: 'inventory',
    title: 'نسبة تلبية الطلب',
    path: `${BASE}/inventory/fill-rate`,
    filenameSlug: 'fill-rate',
    filters: [REPORT_FILTERS.DATE_RANGE],
  },
  inventoryStockVariance: {
    key: 'inventoryStockVariance',
    category: 'inventory',
    title: 'فروقات الجرد',
    path: `${BASE}/inventory/stock-variance`,
    filenameSlug: 'stock-variance',
    filters: [REPORT_FILTERS.COUNT_ID],
  },
}

/**
 * Builds the query for one report, keeping ONLY the params its controller
 * declares. Centralised so no caller can smuggle an unsupported filter through.
 */
const buildParams = (definition, filters = {}) => {
  const supported = definition.filters
  const params = {}

  if (supported.includes(REPORT_FILTERS.DATE_RANGE)) {
    if (filters.from) params.from = filters.from
    if (filters.to) params.to = filters.to
  }

  if (supported.includes(REPORT_FILTERS.REPRESENTATIVE) && filters.representativeId != null)
    params.representativeId = filters.representativeId

  if (supported.includes(REPORT_FILTERS.CUSTOMER) && filters.customerId != null)
    params.customerId = filters.customerId

  if (supported.includes(REPORT_FILTERS.COUNT_ID) && filters.countId != null)
    params.countId = filters.countId

  return params
}

const definitionFor = reportKey => {
  const definition = REPORT_DEFINITIONS[reportKey]
  if (!definition) throw new Error(`Unknown report: ${reportKey}`)

  return definition
}

// ─── JSON ─────────────────────────────────────────────────────────────────────
/**
 * Run one report and return its typed JSON payload.
 *
 * `format` is omitted rather than sent as 'json' — the backend defaults to JSON
 * when the param is absent, so this keeps the query minimal.
 *
 * @param {string} reportKey a key of REPORT_DEFINITIONS
 * @param {{ from?: string, to?: string, representativeId?: number, customerId?: number }} [filters]
 * @param {AbortSignal} [signal] cancels a superseded run
 */
export const runReport = async (reportKey, filters = {}, signal = undefined) => {
  const definition = definitionFor(reportKey)

  const response = await apiClient.get(definition.path, {
    params: buildParams(definition, filters),
    signal,
  })

  return response.data?.data ?? response.data
}

// ─── Binary exports ───────────────────────────────────────────────────────────
/**
 * Export one report as a file.
 *
 * Goes through apiClient so the Bearer token is attached — a plain link to the
 * URL would arrive unauthenticated, and the token must never be put in the URL.
 * `responseType: 'blob'` keeps Axios from parsing the bytes as JSON, so the
 * xlsx/pdf payload is never corrupted by envelope handling.
 *
 * @param {string} reportKey
 * @param {Object} filters   the SAME filters used for the on-screen run
 * @param {'xlsx'|'pdf'} format
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
export const exportReport = async (reportKey, filters = {}, format = 'xlsx') => {
  const definition = definitionFor(reportKey)

  const response = await apiClient.get(definition.path, {
    params: { ...buildParams(definition, filters), format },
    responseType: 'blob',
  })

  return {
    blob: response.data,
    filename: parseContentDispositionFilename(response.headers)
      ?? `${definition.filenameSlug}-${new Date().toISOString().slice(0, 10)}.${format}`,
  }
}

/**
 * A `responseType: 'blob'` request carries its JSON error envelope as a Blob,
 * so the usual `error.response.data.message` reads as "[object Blob]".
 *
 * Defined locally rather than imported from invoice.service.js: sharing it
 * would make the reports module depend on the invoicing module for an
 * eight-line utility, which is a worse trade than the small duplication.
 */
export const readReportBlobError = async error => {
  const data = error?.response?.data

  if (!(data instanceof Blob)) return null

  try {
    return JSON.parse(await data.text())?.message ?? null
  } catch {
    return null
  }
}

/**
 * Reads the filename from Content-Disposition. The backend sends both
 * `filename="…"` and an RFC 5987 `filename*=UTF-8''…`; either is accepted.
 * Returns null so callers can apply their own safe default rather than trusting
 * whatever the header happened to contain.
 */
const parseContentDispositionFilename = headers => {
  const disposition = headers?.['content-disposition'] ?? headers?.get?.('content-disposition')

  if (!disposition) return null

  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)
  if (!match) return null

  // Strip any path segments a malformed header might smuggle in.
  const raw = decodeURIComponent(match[1]).replace(/[\\/]/g, '').trim()

  return raw || null
}
