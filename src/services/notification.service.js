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
 * ─── Endpoints (NotificationController) ───────────────────────────────────────
 *   GET   /api/notifications               → PageResponse<NotificationResponse>
 *   GET   /api/notifications/unread-count  → { unread: number }
 *   PATCH /api/notifications/{id}/read     → NotificationResponse
 *   PATCH /api/notifications/read-all      → number (rows updated)
 *   POST  /api/notifications/device-tokens → register FCM Web push token
 *
 * Every response is wrapped in the backend's `{ success, data }` envelope, so
 * each function unwraps `.data.data` and hands the caller the payload itself.
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
 * @param {boolean} [params.unreadOnly]
 * @returns {Promise<{ content: Array, page: number, size: number, totalElements: number, totalPages: number, first: boolean, last: boolean }>}
 */
export const fetchNotifications = async (params = {}) => {
  const response = await apiClient.get(BASE, {
    params: {
      page: 0,
      size: 20,
      ...params,
    },
  })

  return response.data?.data ?? response.data
}

// ─── GET /notifications/unread-count ─────────────────────────────────────────
/**
 * Fetch the number of unread notifications.
 *
 * The backend answers `UnreadCountResponse` — `{ "unread": 3 }`. The other key
 * names are tolerated only so a caller never crashes on an unexpected shape;
 * `unread` is the documented one.
 *
 * @returns {Promise<number>}
 */
export const fetchUnreadCount = async () => {
  const response = await apiClient.get(`${BASE}/unread-count`)
  const data = response.data?.data ?? response.data

  if (typeof data === 'number') return data

  const value = data?.unread ?? data?.count ?? data?.unreadCount

  return typeof value === 'number' ? value : 0
}

// ─── PATCH /notifications/{id}/read ──────────────────────────────────────────
/**
 * Mark one notification as read. Returns the updated notification so the caller
 * can trust the server's `readStatus` rather than assuming the write landed.
 *
 * @param {number|string} id
 * @returns {Promise<Object>} the updated NotificationResponse
 */
export const markNotificationRead = async id => {
  const response = await apiClient.patch(`${BASE}/${id}/read`)

  return response.data?.data ?? response.data
}

// ─── PATCH /notifications/read-all ───────────────────────────────────────────
/**
 * Mark every unread notification of the authenticated user as read.
 *
 * @returns {Promise<number>} how many rows the backend updated
 */
export const markAllNotificationsRead = async () => {
  const response = await apiClient.patch(`${BASE}/read-all`)
  const data = response.data?.data ?? response.data

  return typeof data === 'number' ? data : 0
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
