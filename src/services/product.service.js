/**
 * product.service.js
 *
 * Pure service layer — only Axios calls, no state, no composables.
 * The Axios instance (src/services/apiClient.js) auto-attaches the Bearer token
 * and base URL (VITE_API_BASE_URL). The response interceptor handles token refresh.
 *
 * Architecture:  UI → useProducts (state) → product.service (pure Axios)
 */

import apiClient from '@/services/apiClient'

// ─── GET /products ────────────────────────────────────────────────────────────
/**
 * Fetch a server-side paginated, filtered, and sorted list of products.
 *
 * @param {Object} params
 * @param {number} [params.page=0]    - Zero-based page index
 * @param {number} [params.size=10]   - Page size
 * @param {string} [params.sortBy]    - Field name to sort by
 * @param {string} [params.sortDir]   - asc | desc
 * @param {string} [params.search]    - Free-text search
 * @param {string} [params.status]    - ACTIVE | DISCONTINUED
 *
 * @returns {Promise<{ content: Array, page, size, totalElements, totalPages }>}
 */
export const fetchProducts = async (params = {}) => {
  try {
    // Strip undefined/null/empty values so we don't send blank query params
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== ''),
    )

    const response = await apiClient.get('/products', { params: cleanParams })

    // Response shape: { success, data: { content, page, size, totalElements, totalPages } }
    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── GET /products/:id ────────────────────────────────────────────────────────
/**
 * Fetch a single product by ID.
 * @param {number|string} id
 * @returns {Promise<Object>}  { id, name, sku, barcode, price, unitOfMeasure, minStockLevel, status }
 */
export const fetchProductById = async id => {
  try {
    const response = await apiClient.get(`/products/${id}`)

    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── POST /products ───────────────────────────────────────────────────────────
/**
 * Create a new product.
 * @param {{ name, sku, barcode, price, unitOfMeasure, minStockLevel }} payload
 * @returns {Promise<Object>}
 */
export const createProduct = async payload => {
  try {
    const response = await apiClient.post('/products', payload)

    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── PUT /products/:id ────────────────────────────────────────────────────────
/**
 * Update an existing product.
 * @param {number|string} id
 * @param {{ name, sku, barcode, price, unitOfMeasure, minStockLevel }} payload
 * @returns {Promise<Object>}
 */
export const updateProduct = async (id, payload) => {
  try {
    const response = await apiClient.put(`/products/${id}`, payload)

    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── PATCH /products/:id/status ──────────────────────────────────────────────
/**
 * Update a product's status.
 * @param {number|string} id
 * @param {'ACTIVE'|'DISCONTINUED'} status
 * @returns {Promise<{ success: boolean, message: string, data?: Object }>}
 */
export const updateProductStatus = async (id, status) => {
  try {
    const response = await apiClient.patch(`/products/${id}/status`, { status })

    return response.data
  } catch (error) {
    throw error
  }
}

// ─── DELETE /products/:id ─────────────────────────────────────────────────────
/**
 * Delete a product by ID.
 * @param {number|string} id
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export const deleteProduct = async id => {
  try {
    const response = await apiClient.delete(`/products/${id}`)

    return response.data
  } catch (error) {
    throw error
  }
}
