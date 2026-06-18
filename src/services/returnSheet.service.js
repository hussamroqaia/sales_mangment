/**
 * returnSheet.service.js
 *
 * Pure service layer — only Axios calls, no state, no composables.
 * The Axios instance (src/services/apiClient.js) auto-attaches the Bearer token
 * and base URL (VITE_API_BASE_URL). The response interceptor handles token refresh.
 *
 * Architecture:  UI → useReturnSheets (state) → returnSheet.service (pure Axios)
 *
 * Return Sheets move stock VAN → WAREHOUSE. Statuses: DRAFT, COMPLETED.
 */

import apiClient from '@/services/apiClient'

const BASE = '/return-sheets'

// ─── GET /return-sheets ──────────────────────────────────────────────────────
/**
 * Fetch a server-side paginated list of return sheets (each includes its `lines`).
 *
 * @param {Object} params
 * @param {number}  [params.page=0]
 * @param {number}  [params.size=10]
 * @param {number}  [params.representativeId]
 * @param {string}  [params.status]      - DRAFT | COMPLETED
 * @param {string}  [params.returnDate]  - ISO date (yyyy-mm-dd)
 * @param {string}  [params.sortBy]
 * @param {string}  [params.sortDir]     - asc | desc
 * @returns {Promise<{ content: Array, page, size, totalElements, totalPages }>}
 */
export const fetchReturnSheets = async (params = {}) => {
  try {
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== ''),
    )

    const response = await apiClient.get(BASE, { params: cleanParams })

    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── GET /return-sheets/:id ──────────────────────────────────────────────────
/**
 * Fetch a single return sheet (with its nested lines).
 * @param {number|string} id
 * @returns {Promise<Object>}
 */
export const fetchReturnSheetById = async id => {
  try {
    const response = await apiClient.get(`${BASE}/${id}`)

    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── POST /return-sheets ─────────────────────────────────────────────────────
/**
 * Create a draft return sheet.
 * @param {{ representativeId: number, lines: Array<{ productId: number, quantity: number }> }} payload
 * @returns {Promise<Object>}
 */
export const createReturnSheet = async payload => {
  try {
    const response = await apiClient.post(BASE, payload)

    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── POST /return-sheets/:id/complete ────────────────────────────────────────
/**
 * Complete the return sheet — moves stock back to warehouse and sets COMPLETED.
 * Empty request body.
 * @param {number|string} id
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export const completeReturnSheet = async id => {
  try {
    const response = await apiClient.post(`${BASE}/${id}/complete`, {})

    return response.data
  } catch (error) {
    throw error
  }
}
