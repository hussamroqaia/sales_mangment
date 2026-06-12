/**
 * customer.service.js
 *
 * Pure service layer — only Axios calls, no state, no composables.
 * The Axios instance (src/services/apiClient.js) auto-attaches the Bearer token.
 * Base URL is configured via VITE_API_BASE_URL in .env.
 */

import apiClient from '@/services/apiClient'

// ─── GET /customers ───────────────────────────────────────────────────────────
/**
 * Fetch a server-side paginated, filtered, and sorted list of customers.
 *
 * @param {Object} params
 * @param {number}  [params.page=0]        - Zero-based page index
 * @param {number}  [params.size=10]       - Page size
 * @param {string}  [params.search]        - Free-text search
 * @param {number}  [params.territoryId]   - Filter by territory
 * @param {string}  [params.status]        - ACTIVE | INACTIVE
 * @param {string}  [params.sortBy]        - Field name to sort by
 * @param {string}  [params.sortDir]       - asc | desc
 *
 * @returns {Promise<{ content: Array, page, size, totalElements, totalPages }>}
 */
export const fetchCustomers = async (params = {}) => {
  try {
    // Strip undefined/null/empty values
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== ''),
    )

    const response = await apiClient.get('/customers', { params: cleanParams })

    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── GET /customers/:id ───────────────────────────────────────────────────────
/**
 * Fetch a single customer by ID.
 * @param {number|string} id
 * @returns {Promise<Object>}
 */
export const fetchCustomerById = async id => {
  try {
    const response = await apiClient.get(`/customers/${id}`)

    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── POST /customers ──────────────────────────────────────────────────────────
/**
 * Create a new customer.
 * @param {{ territoryId, name, address, phone, latitude, longitude, category }} payload
 * @returns {Promise<Object>}
 */
export const createCustomer = async payload => {
  try {
    const response = await apiClient.post('/customers', payload)

    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── PUT /customers/:id ───────────────────────────────────────────────────────
/**
 * Update an existing customer.
 * @param {number|string} id
 * @param {{ territoryId, name, address, phone, latitude, longitude, category }} payload
 * @returns {Promise<Object>}
 */
export const updateCustomer = async (id, payload) => {
  try {
    const response = await apiClient.put(`/customers/${id}`, payload)

    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── PATCH /customers/:id/status ─────────────────────────────────────────────
/**
 * Update a customer's status.
 * @param {number|string} id
 * @param {'ACTIVE'|'INACTIVE'} status
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export const updateCustomerStatus = async (id, status) => {
  try {
    const response = await apiClient.patch(`/customers/${id}/status`, { status })

    return response.data
  } catch (error) {
    throw error
  }
}

// ─── DELETE /customers/:id ────────────────────────────────────────────────────
/**
 * Delete a customer by ID.
 * @param {number|string} id
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export const deleteCustomer = async id => {
  try {
    const response = await apiClient.delete(`/customers/${id}`)

    return response.data
  } catch (error) {
    throw error
  }
}
