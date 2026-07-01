/**
 * route.service.js
 *
 * Pure service layer — only Axios calls, no state, no composables.
 * The Axios instance (src/services/apiClient.js) auto-attaches the Bearer token
 * and base URL (VITE_API_BASE_URL). The response interceptor handles token refresh.
 *
 * Architecture:  UI → useRoutes (state) → route.service (pure Axios)
 *
 * Routes represent a planned sequence of customer visits for a sales rep on a given date.
 * Statuses: PLANNED, IN_PROGRESS, COMPLETED.
 */

import apiClient from '@/services/apiClient'

const BASE = '/routes'

// ─── GET /routes ─────────────────────────────────────────────────────────────
/**
 * Fetch a server-side paginated list of routes.
 *
 * @param {Object} params
 * @param {number}  [params.page=0]
 * @param {number}  [params.size=10]
 * @param {string}  [params.sortBy]
 * @param {string}  [params.sortDir]       - asc | desc
 * @returns {Promise<{ content: Array, page, size, totalElements, totalPages }>}
 */
export const fetchRoutes = async (params = {}) => {
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

// ─── GET /routes/:id ─────────────────────────────────────────────────────────
/**
 * Fetch a single route with its nested stops.
 * @param {number|string} id
 * @returns {Promise<Object>}
 */
export const fetchRouteById = async id => {
  try {
    const response = await apiClient.get(`${BASE}/${id}`)

    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── POST /routes ────────────────────────────────────────────────────────────
/**
 * Create a new route.
 * @param {{ representativeId: number, territoryId: number, name: string, routeDate: string, customerIds: number[] }} payload
 * @returns {Promise<Object>}
 */
export const createRoute = async payload => {
  try {
    const response = await apiClient.post(BASE, payload)

    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── DELETE /routes/:id ──────────────────────────────────────────────────────
/**
 * Delete a route by ID.
 * @param {number|string} id
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export const deleteRoute = async id => {
  try {
    const response = await apiClient.delete(`${BASE}/${id}`)

    return response.data
  } catch (error) {
    throw error
  }
}

// ─── POST /routes/:id/optimize ───────────────────────────────────────────────
/**
 * Trigger backend optimization for a route.
 * Returns the updated route with isOptimized=true and reordered stops.
 * @param {number|string} id
 * @returns {Promise<Object>}
 */
export const optimizeRoute = async id => {
  try {
    const response = await apiClient.post(`${BASE}/${id}/optimize`, {})

    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── PATCH /routes/:id/status ──────────────────────────────────────────────────
/**
 * Update the status of a route.
 * @param {number|string} id
 * @param {string} status - PLANNED, ACTIVE, or COMPLETED
 * @returns {Promise<Object>}
 */
export const updateRouteStatus = async (id, status) => {
  try {
    const response = await apiClient.patch(`${BASE}/${id}/status`, { status })

    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── POST /routes/:id/customers ──────────────────────────────────────────────
/**
 * Assign additional customers to an existing route.
 * @param {number|string} id          - Route ID
 * @param {number[]}      customerIds - Array of customer IDs to add
 * @returns {Promise<Object>} The updated route with new stops
 */
export const assignRouteCustomers = async (id, customerIds) => {
  try {
    const response = await apiClient.post(`${BASE}/${id}/customers`, { customerIds })

    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}
