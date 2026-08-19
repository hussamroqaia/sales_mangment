/**
 * notification.service.js
 *
 * Pure API layer — no state, no Vue refs, no composables.
 * All functions return the response data directly or throw on failure.
 * Consumed exclusively by the useNotifications composable.
 *
 * Base URL is configured on the Axios instance (src/services/apiClient.js)
 * via import.meta.env.VITE_API_BASE_URL.
 *
 * ─── Confirmed endpoints ──────────────────────────────────────────────────────
 *   GET  /api/notifications               → Page/list of notifications
 *   GET  /api/notifications/unread-count  → { count: number }
 *   POST /api/notifications/device-tokens → register FCM Web push token
 *
 * ─── Absent/unconfirmed endpoints (NOT called) ────────────────────────────────
 *   PATCH /api/notifications/{id}/read    → not found in backend source
 *   PATCH /api/notifications/read-all     → not found in backend source
 *   DELETE /api/notifications/device-tokens/{token} → not found in backend source
 *
 * Mark-read functionality is handled locally (client-side UI state only).
 * No mutation calls are made until the backend exposes confirmed endpoints.
 */

import apiClient from '@/services/apiClient'

const BASE = '/notifications'

// ─── GET /notifications ───────────────────────────────────────────────────────
/**
 * Fetch a page of notifications for the authenticated user.
 *
 * @param {Object}  params
 * @param {number}  [params.page=0]
 * @param {number}  [params.size=20]
 * @returns {Promise<{ content: Array, totalElements: number, totalPages: number, ... }>}
 */
export const fetchNotifications = async (params = {}) => {
  const response = await apiClient.get(BASE, {
    params: {
      page: 0,
      size: 20,
      ...params,
    },
  })

  // Handle both { data: {...} } envelope and bare response
  return response.data?.data ?? response.data
}

// ─── GET /notifications/unread-count ─────────────────────────────────────────
/**
 * Fetch the number of unread notifications.
 * Returns the count as a plain number.
 *
 * @returns {Promise<number>}
 */
export const fetchUnreadCount = async () => {
  const response = await apiClient.get(`${BASE}/unread-count`)
  const data = response.data?.data ?? response.data

  // Backend might return: { count: 5 } or just 5
  if (typeof data === 'number') return data
  if (typeof data?.count === 'number') return data.count
  if (typeof data?.unreadCount === 'number') return data.unreadCount

  return 0
}

// ─── POST /notifications/device-tokens ───────────────────────────────────────
/**
 * Register a Web FCM device token with the backend.
 * The same endpoint is used by the mobile app.
 *
 * @param {string} token - Firebase Cloud Messaging token
 * @returns {Promise<void>}
 */
export const registerDeviceToken = async token => {
  await apiClient.post(`${BASE}/device-tokens`, { token })
}
