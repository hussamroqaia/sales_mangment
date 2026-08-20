/**
 * invoice.service.js
 *
 * Pure service layer — only Axios calls, no state, no composables.
 * The Axios instance (src/services/apiClient.js) auto-attaches the Bearer token.
 *
 * ─── WEB SCOPE (deliberate and closed) ───────────────────────────────────────
 * This management web app implements ONLY the manager/admin half of the invoice
 * API. The operational half belongs to the separate SALES_REP mobile client and
 * is intentionally absent from this file — not merely unused, but never written:
 *
 *   POST   /invoices                 — create draft        (SALES_REP only)
 *   PUT    /invoices/{id}            — edit draft          (SALES_REP only)
 *   DELETE /invoices/{id}            — delete draft        (SALES_REP only)
 *   POST   /invoices/{id}/submit     — submit for review   (SALES_REP only)
 *   POST   /invoices/epod-uploads    — upload ePOD proof   (SALES_REP only)
 *   GET    /invoices/me              — own invoices        (SALES_REP only)
 *
 * Adding any of the above here would put a mobile workflow in the web bundle.
 *
 * Backend contract (InvoiceController + InvoiceResponse):
 *   GET  /invoices               → PageResponse<InvoiceResponse>  SALES_MANAGER, ADMIN
 *   GET  /invoices/{id}          → InvoiceResponse                +SALES_REP (own only)
 *   POST /invoices/{id}/approve  → InvoiceResponse                SALES_MANAGER, ADMIN
 *   POST /invoices/{id}/reject   → InvoiceResponse                SALES_MANAGER, ADMIN
 *   GET  /invoices/{id}/pdf      → application/pdf                +SALES_REP (own only)
 *   GET  /invoices/{id}/epod/{t} → image/*                        +SALES_REP (own only)
 */

import apiClient from '@/services/apiClient'

const BASE = '/invoices'

// ─── Enums (mirrored verbatim from the backend) ──────────────────────────────
// InvoiceStatus.java — the DB CHECK constraint mirrors exactly this set.
export const INVOICE_STATUSES = ['DRAFT', 'SENT', 'APPROVED', 'REJECTED']

// EpodArtifactType.java — case-sensitive path segment, never lower-cased.
export const EPOD_TYPES = ['SIGNATURE', 'DELIVERY_PHOTO']

// ─── GET /invoices ────────────────────────────────────────────────────────────
/**
 * Search/filter every invoice. Any unset filter is omitted and ignored server-side.
 *
 * Only the four filters below exist on the controller — there is no free-text
 * search parameter, so none is sent.
 *
 * @param {Object}  params
 * @param {number}  [params.representativeId]
 * @param {number}  [params.customerId]
 * @param {'DRAFT'|'SENT'|'APPROVED'|'REJECTED'} [params.status]
 * @param {string}  [params.invoiceDate] - ISO calendar date, `YYYY-MM-DD`
 * @param {number}  [params.page=0]      - Zero-based page index
 * @param {number}  [params.size=20]     - 1..100 (backend hard-caps at 100)
 * @param {string}  [params.sortBy=id]
 * @param {string}  [params.sortDir=asc] - asc | desc
 *
 * @returns {Promise<{ content: Array, page, size, totalElements, totalPages, first, last }>}
 */
export const fetchInvoices = async (params = {}) => {
  const cleanParams = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== ''),
  )

  const response = await apiClient.get(BASE, { params: cleanParams })

  return response.data?.data ?? response.data
}

// ─── GET /invoices/:id ────────────────────────────────────────────────────────
/**
 * One invoice with its lines and ePOD metadata.
 * @param {number|string} id
 * @returns {Promise<Object>} InvoiceResponse
 */
export const fetchInvoiceById = async id => {
  const response = await apiClient.get(`${BASE}/${id}`)

  return response.data?.data ?? response.data
}

// ─── POST /invoices/:id/approve ───────────────────────────────────────────────
/**
 * Approve a SENT invoice. The reviewer is taken from the bearer token, never sent.
 * Backend rejects with 409 when the invoice is not SENT.
 *
 * @param {number|string} id
 * @returns {Promise<Object>} the updated InvoiceResponse
 */
export const approveInvoice = async id => {
  const response = await apiClient.post(`${BASE}/${id}/approve`)

  return response.data?.data ?? response.data
}

// ─── POST /invoices/:id/reject ────────────────────────────────────────────────
/**
 * Reject a SENT invoice with a mandatory reason (BR-3).
 * Backend validation: @NotBlank, @Size(max = 1000). 409 when not SENT.
 *
 * @param {number|string} id
 * @param {string} reason - non-blank, <= 1000 chars
 * @returns {Promise<Object>} the updated InvoiceResponse
 */
export const rejectInvoice = async (id, reason) => {
  const response = await apiClient.post(`${BASE}/${id}/reject`, { reason })

  return response.data?.data ?? response.data
}

// ─── Binary endpoints ─────────────────────────────────────────────────────────
// Both are protected: a bare <a href> or <img src> would omit the Authorization
// header and get a 401/403 instead of the file. They must go through apiClient
// so the token is attached (and a stale token still triggers the refresh cycle),
// which means the caller receives a Blob and owns the object-URL lifecycle.

/** Marker for "the request succeeded but carried no document". See below. */
export const EMPTY_PDF_ERROR = 'empty_pdf'

/**
 * The customer-facing PDF copy of one invoice.
 *
 * DRAFT invoices are refused by the backend with 409 — a draft has no
 * proof-of-delivery, so there is nothing to render.
 *
 * For every other status the backend currently answers 204 No Content with a
 * zero-byte body instead of a PDF. Axios reports that as a success, so without
 * the guard below the caller would hand the browser an empty Blob and the user
 * would get a 0-byte `invoice-N.pdf` that looks like a completed download. A
 * response with no document is a failure to produce one, and is raised as such.
 *
 * @param {number|string} id
 * @returns {Promise<{ blob: Blob, filename: string }>}
 * @throws {Error} with `code === EMPTY_PDF_ERROR` when the body is empty
 */
export const fetchInvoicePdf = async id => {
  const response = await apiClient.get(`${BASE}/${id}/pdf`, { responseType: 'blob' })

  const blob = response.data

  if (response.status === 204 || !blob || blob.size === 0) {
    const error = new Error('Invoice PDF response carried no content')

    error.code = EMPTY_PDF_ERROR

    throw error
  }

  return {
    blob,
    filename: parseContentDispositionFilename(response.headers) ?? `invoice-${id}.pdf`,
  }
}

/**
 * One ePOD artifact's image bytes.
 *
 * @param {number|string} id
 * @param {'SIGNATURE'|'DELIVERY_PHOTO'} type - case-sensitive; sent verbatim
 * @returns {Promise<Blob>}
 */
export const fetchInvoiceEpodFile = async (id, type) => {
  const response = await apiClient.get(`${BASE}/${id}/epod/${type}`, { responseType: 'blob' })

  return response.data
}

/**
 * An error thrown by a `responseType: 'blob'` request carries its JSON error
 * envelope as a Blob, so the usual `error.response.data.message` is a Blob and
 * reads as "[object Blob]". This reads the envelope back out.
 *
 * @param {Error} error - a rejected Axios error from a blob request
 * @returns {Promise<string|null>} the server's message, or null if unreadable
 */
export const readBlobErrorMessage = async error => {
  const data = error?.response?.data

  if (!(data instanceof Blob)) return null

  try {
    return JSON.parse(await data.text())?.message ?? null
  } catch {
    // Not a JSON envelope (an HTML proxy page, or an empty body).
    return null
  }
}

/**
 * Reads the filename out of a Content-Disposition header.
 * Falls back to null so callers can supply their own safe default rather than
 * trusting whatever the header happened to contain.
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
