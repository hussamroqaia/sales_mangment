/**
 * user.service.js
 *
 * Pure service layer — only Axios calls, no state, no composables.
 * The Axios instance (src/services/apiClient.js) auto-attaches the Bearer token.
 * Base URL is configured via VITE_API_BASE_URL in .env.
 */

import apiClient from '@/services/apiClient'

// ─── GET /users ───────────────────────────────────────────────────────────────
/**
 * Fetch a server-side paginated, filtered, and sorted list of users.
 *
 * @param {Object} params
 * @param {string}  [params.search]   - Free-text search
 * @param {string}  [params.role]     - ADMIN | SALES_MANAGER | SALES_REP | WAREHOUSE_MANAGER
 * @param {string}  [params.status]   - ACTIVE | INACTIVE | SUSPENDED
 * @param {number}  [params.page=0]   - Zero-based page index
 * @param {number}  [params.size=10]  - Page size
 * @param {string}  [params.sortBy]   - Field name to sort by (e.g. "id")
 * @param {string}  [params.sortDir]  - "asc" | "desc"
 *
 * @returns {Promise<{
 *   users: { content: Array, page: number, size: number, totalElements: number, totalPages: number },
 *   counts: { active: number, inactive: number, suspended: number, total: number }
 * }>}
 */
export const fetchUsers = async (params = {}) => {
  try {
    // Strip undefined/null/empty values so the API doesn't receive blank query params
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== ''),
    )

    const response = await apiClient.get('/users', { params: cleanParams })

    // Response shape: { success, data: { users: {...}, counts: {...} } }
    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}


// ─── GET /users/:id ───────────────────────────────────────────────────────────
/**
 * Fetch a single user by ID.
 * @param {number|string} id
 * @returns {Promise<{ id, name, phoneNumber, role, status, createdAt }>}
 */
export const fetchUserById = async id => {
  try {
    const response = await apiClient.get(`/users/${id}`)

    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── POST /users ──────────────────────────────────────────────────────────────
/**
 * Create a new user.
 * @param {{ name: string, phoneNumber: string, password: string, role: string }} payload
 * @returns {Promise<{ id, name, phoneNumber, role, status, createdAt }>}
 */
export const createUser = async payload => {
  try {
    const response = await apiClient.post('/users', payload)

    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── PATCH /users/:id/status ──────────────────────────────────────────────────
/**
 * Update a user's status.
 * Status is passed as a QUERY PARAMETER per the API spec.
 * @param {number|string} id
 * @param {'ACTIVE'|'INACTIVE'|'SUSPENDED'} status
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export const updateUserStatus = async (id, status) => {
  try {
    const response = await apiClient.patch(`/users/${id}/status`, null, {
      params: { status },
    })

    return response.data
  } catch (error) {
    throw error
  }
}

// ─── PATCH /users/:id/password ────────────────────────────────────────────────
/**
 * Admin reset of a user's password.
 * @param {number|string} id
 * @param {string} newPassword
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export const resetUserPassword = async (id, newPassword) => {
  try {
    const response = await apiClient.patch(`/users/${id}/password`, { newPassword })

    return response.data
  } catch (error) {
    throw error
  }
}
