/**
 * stockCount.service.js
 *
 * Pure service layer — only Axios calls, no state, no composables.
 * The Axios instance (src/services/apiClient.js) auto-attaches the Bearer token
 * and base URL (VITE_API_BASE_URL). The response interceptor handles token refresh.
 *
 * Architecture:  UI → useStockCounts (state) → stockCount.service (pure Axios)
 *
 * A stock count is a physical stock-take of the warehouse. Statuses: DRAFT,
 * FINALIZED. While a count is DRAFT its lines carry only `countedQuantity`;
 * `recordedQuantity` and `variance` come back filled in once it is finalized —
 * the backend deliberately withholds the system figure until then, which is what
 * makes the count blind.
 *
 * ⚠️ Unlike the other list modules, GET /stock-counts is NOT paginated: it
 * answers with a plain array. Paging and sorting for this module are therefore
 * client-side (see useStockCounts).
 *
 * Errors are left to propagate — useStockCounts turns them into Arabic messages
 * through resolveApiError.
 */

import apiClient from '@/services/apiClient'

const BASE = '/stock-counts'

// ─── GET /stock-counts ───────────────────────────────────────────────────────
/**
 * Fetch every stock count, each with its nested `lines`.
 *
 * @returns {Promise<Array<{
 *   id: number,
 *   countedById: number,
 *   countDate: string,
 *   status: string,
 *   finalizedAt: string|null,
 *   lines: Array<Object>
 * }>>}
 */
export const fetchStockCounts = async () => {
  const response = await apiClient.get(BASE)

  // Response shape: { success, data: [ ... ] }
  return response.data?.data ?? response.data ?? []
}

// ─── GET /stock-counts/:id ───────────────────────────────────────────────────
/**
 * Fetch a single stock count (with its nested lines).
 * @param {number|string} id
 * @returns {Promise<Object>}
 */
export const fetchStockCountById = async id => {
  const response = await apiClient.get(`${BASE}/${id}`)

  return response.data?.data ?? response.data
}

// ─── POST /stock-counts ──────────────────────────────────────────────────────
/**
 * Create a DRAFT stock count.
 * @param {{ countDate: string, lines: Array<{ productId: number, countedQuantity: number }> }} payload
 *   `countDate` is a wire-format calendar date (YYYY-MM-DD).
 * @returns {Promise<Object>} the created count
 */
export const createStockCount = async payload => {
  const response = await apiClient.post(BASE, payload)

  return response.data?.data ?? response.data
}

// ─── PUT /stock-counts/:id/lines ─────────────────────────────────────────────
/**
 * REPLACE the lines of a DRAFT count — this is not a merge: whatever is sent
 * becomes the whole line set, so callers must submit every line they want kept.
 *
 * @param {number|string} id
 * @param {Array<{ productId: number, countedQuantity: number }>} lines
 * @returns {Promise<Object>} the updated count
 */
export const updateStockCountLines = async (id, lines) => {
  const response = await apiClient.put(`${BASE}/${id}/lines`, { lines })

  return response.data?.data ?? response.data
}

// ─── POST /stock-counts/:id/finalize ─────────────────────────────────────────
/**
 * Finalize the count — the backend compares each counted quantity against the
 * recorded one and fills in `recordedQuantity` / `variance`. Empty request body.
 *
 * @param {number|string} id
 * @returns {Promise<{ success: boolean, message: string, data: Object }>}
 */
export const finalizeStockCount = async id => {
  const response = await apiClient.post(`${BASE}/${id}/finalize`, {})

  return response.data
}
