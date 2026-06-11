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
 * Fetch the full list of users.
 * @returns {Promise<Array<{ id, name, email, role, status, createdAt }>>}
 */
export const fetchUsers = async () => {
  try {
    const response = await apiClient.get('/users')

    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── GET /users/:id ───────────────────────────────────────────────────────────
/**
 * Fetch a single user by ID.
 * @param {number|string} id
 * @returns {Promise<{ id, name, email, role, status, createdAt }>}
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
 * @param {{ name: string, email: string, password: string, role: string }} payload
 * @returns {Promise<{ id, name, email, role, status, createdAt }>}
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
