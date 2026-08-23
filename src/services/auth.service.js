/**
 * auth.service.js
 *
 * Pure API layer — no state, no Pinia, no composables.
 * All functions return the response data directly or throw on failure.
 * Consumed exclusively by the useAuth composable.
 *
 * Base URL is configured on the Axios instance (src/services/apiClient.js)
 * via import.meta.env.VITE_API_BASE_URL.
 */

import apiClient from '@/services/apiClient'

// ─── POST /auth/login ─────────────────────────────────────────────────────────
/**
 * Authenticate a user with phone number + password.
 *
 * @param {string} phoneNumber - Local wire format, e.g. "0981491713"
 * @param {string} password
 * @returns {Promise<{
 *   userId: number,
 *   name: string,
 *   phoneNumber: string,
 *   role: string,
 *   accessToken: string,
 *   refreshToken: string,
 *   isFirstLogin?: boolean
 * }>}
 */
export const loginUser = async (phoneNumber, password) => {
  try {
    const response = await apiClient.post('/auth/login', { phoneNumber, password })

    // API wraps data in a `data` envelope: { success, data: { ... } }
    return response.data?.data ?? response.data
  } catch (error) {
    // Rethrow so the composable can handle UI error display
    throw error
  }
}

// ─── POST /auth/logout ────────────────────────────────────────────────────────
/**
 * Invalidate the current session on the backend.
 * Authorization header is automatically attached by the Axios request interceptor.
 *
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export const logoutUser = async () => {
  try {
    const response = await apiClient.post('/auth/logout')

    return response.data
  } catch (error) {
    // Even if logout API fails, the composable will still clear local state.
    throw error
  }
}

// ─── POST /auth/refresh ─────────────────────────────────────────────────────────────────────────────────
/**
 * Exchange a valid refresh token for a new access token.
 * Called internally by the Axios response interceptor — NOT by the composable directly.
 *
 * The /auth/refresh endpoint reads the token from:
 *   Authorization: Bearer <refreshToken>
 *
 * @param {string} refreshTokenValue   - The valid refresh token
 * @returns {Promise<{ accessToken: string, refreshToken?: string }>}
 */
export const refreshToken = async (refreshTokenValue) => {
  try {
    const response = await apiClient.post(
      '/auth/refresh',
      {},
      {
        headers: {
          // The backend expects the refreshToken as the Bearer token, not the accessToken
          Authorization: `Bearer ${refreshTokenValue}`,
        },
        // Mark as a refresh call so the interceptor won't re-intercept a 401 here
        _isRefreshCall: true,
      },
    )

    return response.data?.data ?? response.data
  } catch (error) {
    throw error
  }
}

// ─── PATCH /auth/password ─────────────────────────────────────────────────────
/**
 * Change the authenticated user's password.
 * Used for both the first-time mandatory reset and regular password changes.
 *
 * Authorization header is automatically attached by the Axios request interceptor.
 *
 * @param {string} currentPassword
 * @param {string} newPassword
 * @returns {Promise<{ message: string, success: boolean }>}
 */
export const changePassword = async (currentPassword, newPassword) => {
  try {
    const response = await apiClient.patch(
      '/auth/password',
      { currentPassword, newPassword },
      {
        headers: { 'Content-Type': 'application/json' },
      },
    )

    return response.data
  } catch (error) {
    throw error
  }
}
