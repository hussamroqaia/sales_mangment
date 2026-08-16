/**
 * visit.service.js
 *
 * Pure service layer — only Axios calls, no state, no composables.
 * The Axios instance (src/services/apiClient.js) auto-attaches the Bearer token
 * and base URL (VITE_API_BASE_URL). The response interceptor handles token refresh.
 *
 * Architecture:  UI → useVisits (state) → visit.service (pure Axios)
 *
 * A visit is a sales representative's stop at a customer on a given route.
 * Statuses: IN_PROGRESS, COMPLETED, MISSED.
 *
 * ℹ️ Check-in / check-out endpoints are NOT implemented here — no API contract
 *    has been provided for them yet. Add them to this file when it lands.
 */

import apiClient from '@/services/apiClient'

const BASE = '/visits'

// ─── GET /visits ─────────────────────────────────────────────────────────────
/**
 * Fetch a server-side paginated list of visits.
 *
 * ℹ️ For a SALES_REP the backend ignores `representativeId` and always scopes
 *    the result to the caller's own visits.
 *
 * @param {Object} params
 * @param {number}  [params.representativeId]
 * @param {number}  [params.routeId]
 * @param {number}  [params.customerId]
 * @param {string}  [params.status]     - IN_PROGRESS | COMPLETED | MISSED
 * @param {number}  [params.page=0]     - Zero-based page index
 * @param {number}  [params.size=10]
 * @param {string}  [params.sortBy]
 * @param {string}  [params.sortDir]    - asc | desc
 * @returns {Promise<{ content: Array, page, size, totalElements, totalPages, first, last }>}
 */
export const fetchVisits = async (params = {}) => {
  try {
    // Strip undefined/null/empty values so the API doesn't receive blank query params
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== ''),
    )

    const response = await apiClient.get(BASE, { params: cleanParams })

    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── GET /visits/:id ─────────────────────────────────────────────────────────
/**
 * Fetch a single visit.
 *
 * ℹ️ The backend returns 403 when a SALES_REP requests a visit that is not
 *    their own. Frontend role checks are UX only — the backend is authoritative.
 *
 * @param {number|string} id
 * @returns {Promise<Object>}
 */
export const fetchVisitById = async id => {
  try {
    const response = await apiClient.get(`${BASE}/${id}`)

    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}
