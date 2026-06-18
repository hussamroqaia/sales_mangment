/**
 * vanInventory.service.js
 *
 * Pure service layer — only Axios calls, no state, no composables.
 * The Axios instance (src/services/apiClient.js) auto-attaches the Bearer token
 * and base URL (VITE_API_BASE_URL). The response interceptor handles token refresh.
 *
 * Architecture:  UI → useVanInventory (state) → vanInventory.service (pure Axios)
 */

import apiClient from '@/services/apiClient'

// ─── GET /inventory/van/:representativeId ────────────────────────────────────
/**
 * Fetch the current stock in a specific representative's van.
 * NOTE: This endpoint is NOT paginated — it returns a flat array.
 *
 * @param {number|string} representativeId
 * @returns {Promise<Array<{ id, representativeId, productId, productName, sku, quantity }>>}
 */
export const fetchVanInventory = async representativeId => {
  try {
    const response = await apiClient.get(`/inventory/van/${representativeId}`)

    // Response shape: { success, data: [ ... ] }
    return response.data?.data ?? response.data ?? []
  } catch (error) {
    throw error
  }
}
