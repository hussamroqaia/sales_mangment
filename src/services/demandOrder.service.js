/**
 * demandOrder.service.js
 *
 * Pure service layer — only Axios calls, no state, no composables.
 * The Axios instance (src/services/apiClient.js) auto-attaches the Bearer token
 * and base URL (VITE_API_BASE_URL). The response interceptor handles token refresh.
 *
 * Architecture:  UI → useDemandOrders (state) → demandOrder.service (pure Axios)
 *
 * Demand Orders move stock WAREHOUSE → VAN. Statuses: SUBMITTED, ADJUSTED, LOADED.
 */

import apiClient from '@/services/apiClient'

const BASE = '/demand-orders'

// ─── GET /demand-orders ──────────────────────────────────────────────────────
/**
 * Fetch a server-side paginated list of demand orders (each includes its `lines`).
 *
 * @param {Object} params
 * @param {number}  [params.page=0]
 * @param {number}  [params.size=10]
 * @param {number}  [params.representativeId]
 * @param {string}  [params.status]        - SUBMITTED | ADJUSTED | LOADED
 * @param {string}  [params.orderDate]     - ISO date (yyyy-mm-dd)
 * @param {string}  [params.sortBy]
 * @param {string}  [params.sortDir]       - asc | desc
 * @returns {Promise<{ content: Array, page, size, totalElements, totalPages }>}
 */
export const fetchDemandOrders = async (params = {}) => {
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

// ─── GET /demand-orders/:id ──────────────────────────────────────────────────
/**
 * Fetch a single demand order (with its nested lines).
 * @param {number|string} id
 * @returns {Promise<Object>}
 */
export const fetchDemandOrderById = async id => {
  try {
    const response = await apiClient.get(`${BASE}/${id}`)

    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── POST /demand-orders ─────────────────────────────────────────────────────
/**
 * Create a draft demand order.
 * @param {{ representativeId: number, lines: Array<{ productId: number, requestedQty: number }> }} payload
 * @returns {Promise<Object>}
 */
export const createDemandOrder = async payload => {
  try {
    const response = await apiClient.post(BASE, payload)

    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── POST /demand-orders/:id/load ────────────────────────────────────────────
/**
 * Load the order onto the van — moves stock and sets status to LOADED.
 * Empty request body.
 * @param {number|string} id
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export const loadDemandOrder = async id => {
  try {
    const response = await apiClient.post(`${BASE}/${id}/load`, {})

    return response.data
  } catch (error) {
    throw error
  }
}
