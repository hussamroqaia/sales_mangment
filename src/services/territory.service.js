/**
 * territory.service.js
 *
 * Pure service layer — only Axios calls, no state, no composables.
 * The Axios instance (src/services/apiClient.js) auto-attaches the Bearer token.
 * Base URL is configured via VITE_API_BASE_URL in .env.
 */

import apiClient from '@/services/apiClient'

// ─── GET /territories ─────────────────────────────────────────────────────────
/**
 * Fetch a server-side paginated list of territories.
 *
 * @param {Object} params
 * @param {number}  [params.page=0]    - Zero-based page index
 * @param {number}  [params.size=10]   - Page size. The backend's PageRequest is
 *                                       annotated @Max(100); a larger value is
 *                                       rejected with 400, so never raise this
 *                                       to "fetch everything" — pass `all` instead.
 * @param {string}  [params.search=''] - Optional search/filter string
 * @param {boolean} [params.all=false] - Return every territory in one unpaged
 *                                       response, for dropdown/option loading.
 *                                       NOTE: the backend ignores `search` when
 *                                       this is set, so never combine the two.
 *
 * @returns {Promise<{
 *   content: Array,
 *   page: number,
 *   size: number,
 *   totalElements: number,
 *   totalPages: number
 * }>}
 */
export const fetchTerritories = async (params = {}) => {
  try {
    // Strip empty search so we don't send ?search= to the API when it's blank
    const cleanParams = { ...params }
    if (!cleanParams.search) delete cleanParams.search

    const response = await apiClient.get('/territories', { params: cleanParams })

    // Response shape: { success, data: { content, page, size, totalElements, totalPages } }
    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── GET /territories/:id ─────────────────────────────────────────────────────
/**
 * Fetch a single territory by ID.
 * @param {number|string} id
 * @returns {Promise<{ id, name, description, createdAt, updatedAt }>}
 */
export const fetchTerritoryById = async id => {
  try {
    const response = await apiClient.get(`/territories/${id}`)

    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── POST /territories ────────────────────────────────────────────────────────
/**
 * Create a new territory.
 * @param {{ name: string, description: string }} payload
 * @returns {Promise<{ id, name, description, createdAt, updatedAt }>}
 */
export const createTerritory = async payload => {
  try {
    const response = await apiClient.post('/territories', payload)

    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── PUT /territories/:id ─────────────────────────────────────────────────────
/**
 * Update an existing territory.
 * @param {number|string} id
 * @param {{ name: string, description: string }} payload
 * @returns {Promise<{ id, name, description, createdAt, updatedAt }>}
 */
export const updateTerritory = async (id, payload) => {
  try {
    const response = await apiClient.put(`/territories/${id}`, payload)

    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── DELETE /territories/:id ──────────────────────────────────────────────────
/**
 * Delete a territory by ID.
 * @param {number|string} id
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export const deleteTerritory = async id => {
  try {
    const response = await apiClient.delete(`/territories/${id}`)

    return response.data
  } catch (error) {
    throw error
  }
}
