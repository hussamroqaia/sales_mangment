/**
 * warehouseStock.service.js
 *
 * Pure service layer — only Axios calls, no state, no composables.
 * The Axios instance (src/services/apiClient.js) auto-attaches the Bearer token
 * and base URL (VITE_API_BASE_URL). The response interceptor handles token refresh.
 *
 * Architecture:  UI → useWarehouseStock (state) → warehouseStock.service (pure Axios)
 *
 * ⚠️ IMPORTANT: Every per-record endpoint is keyed by {productId} — NOT a generic
 * stock record id. Always pass the product id to the by-id / receive / update calls.
 */

import apiClient from '@/services/apiClient'

const BASE = '/inventory/warehouse-stock'

// ─── GET /inventory/warehouse-stock ──────────────────────────────────────────
/**
 * Fetch a server-side paginated, filtered, and sorted list of warehouse stock.
 *
 * @param {Object} params
 * @param {number}  [params.page=0]            - Zero-based page index
 * @param {number}  [params.size=10]           - Page size
 * @param {string}  [params.sortBy]            - Field name to sort by
 * @param {string}  [params.sortDir]           - asc | desc
 * @param {boolean} [params.lowStock=false]    - Only return low-stock records
 * @param {number}  [params.productId]         - Optional filter by product id
 *
 * @returns {Promise<{ content: Array, page, size, totalElements, totalPages }>}
 */
export const fetchWarehouseStock = async (params = {}) => {
  try {
    // Strip undefined/null/empty values so we don't send blank query params.
    // NOTE: `lowStock: false` is intentionally kept (it's a meaningful value).
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== ''),
    )

    const response = await apiClient.get(BASE, { params: cleanParams })

    // Response shape: { success, data: { content, page, size, totalElements, totalPages } }
    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── GET /inventory/warehouse-stock/:productId ───────────────────────────────
/**
 * Fetch a single warehouse stock record by PRODUCT ID.
 * @param {number|string} productId
 * @returns {Promise<Object>}  { id, productId, productName, sku, quantity, minStockLevel, lowStock, lastUpdated }
 */
export const fetchWarehouseStockByProductId = async productId => {
  try {
    const response = await apiClient.get(`${BASE}/${productId}`)

    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── PUT /inventory/warehouse-stock/:productId ───────────────────────────────
/**
 * Override / correct the on-hand quantity for a product (manual stock-take).
 * @param {number|string} productId
 * @param {number} quantity   - New absolute quantity
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export const updateWarehouseStock = async (productId, quantity) => {
  try {
    const response = await apiClient.put(`${BASE}/${productId}`, { quantity })

    return response.data
  } catch (error) {
    throw error
  }
}

// ─── POST /inventory/warehouse-stock/:productId/receive ──────────────────────
/**
 * Receive incoming stock — ADDS the quantity to the existing on-hand count.
 * @param {number|string} productId
 * @param {number} quantity   - Quantity received in this shipment
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export const receiveWarehouseStock = async (productId, quantity) => {
  try {
    const response = await apiClient.post(`${BASE}/${productId}/receive`, { quantity })

    return response.data
  } catch (error) {
    throw error
  }
}
