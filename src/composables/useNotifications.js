/**
 * useNotifications.js
 *
 * Central notification composable. Manages all notification state and logic.
 * UI components and layouts call ONLY this composable.
 *
 * Architecture:
 *   UI / Layout
 *      ↓
 *   useNotifications (this file)
 *      ↓
 *   notification.service.js / firebase-init.js
 *      ↓
 *   apiClient / Firebase SDK
 *      ↓
 *   Backend / Firebase
 *
 * Design rules:
 *  - Backend notification feed = Source of Truth
 *  - FCM = real-time delivery trigger only
 *  - FCM failure → app continues through polling
 *  - Never blocks login/navigation
 *  - Prevents duplicate initialization across re-renders (module-level singletons)
 *  - Properly cleans up on logout
 *
 * Mark-read:
 *  Persisted server-side. `PATCH /api/notifications/{id}/read` and
 *  `PATCH /api/notifications/read-all` are both part of the backend contract,
 *  so read state survives a reload. The UI updates optimistically and rolls
 *  back if the write fails, rather than silently diverging from the server.
 */

import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/notification.service'

import { INTL_LOCALE, formatRelativeArabic } from '@/utils/locale'
import { translateNotificationMessage, translateNotificationTitle } from '@/utils/notificationText'
import {
  initializeFCM,
  subscribeToForegroundMessages,
} from '@/services/firebase/firebase-init'

// ─── Polling interval ─────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 30 * 1000  // 30 seconds

// ─── Module-level singletons ──────────────────────────────────────────────────
// Prevent duplicate listeners/intervals when multiple components use this composable.
let _pollingInterval = null
let _fcmUnsubscribe = null
let _initialized = false
let _initPromise = null

// ─── Shared reactive state ─────────────────────────────────────────────────────
// Using module-level refs so all callers share ONE state (singleton pattern).
const notifications = ref([])
const unreadCount = ref(0)
const loading = ref(false)
const error = ref(null)
const fcmPermission = ref(null)   // 'granted'|'denied'|'default'|'unsupported'|null

// ─── Type presentation ────────────────────────────────────────────────────────
// STATIC_UI_CONFIGURATION. `NotificationResponse.type` is an enum with exactly
// these four members; an unknown value falls back to the neutral bell rather
// than rendering a blank avatar.
const TYPE_PRESENTATION = {
  INVOICE:   { icon: 'tabler-file-invoice',       color: 'primary' },
  INVENTORY: { icon: 'tabler-building-warehouse', color: 'warning' },
  ROUTE:     { icon: 'tabler-route',              color: 'info' },
  SYSTEM:    { icon: 'tabler-settings',           color: 'secondary' },
}

const DEFAULT_PRESENTATION = { icon: 'tabler-bell', color: 'primary' }

/**
 * Where a notification points, derived from its `type` + `referenceId`.
 *
 * The backend sends no link of its own, so the destination is inferred from the
 * two fields it does send. Whether the session may *open* that destination is
 * not decided here — the router guard owns route permissions, and duplicating
 * that rule set in the notification layer would let the two drift apart.
 *
 * @returns {object|null} a vue-router location, or null when there is nothing to open
 */
const resolveNotificationTarget = raw => {
  const referenceId = raw?.referenceId
  if (referenceId === null || referenceId === undefined) return null

  switch (raw?.type) {
  case 'INVOICE':
    return { name: 'apps-invoice-preview-id', params: { id: String(referenceId) } }
  case 'ROUTE':
    return { name: 'routes-id', params: { id: String(referenceId) } }
  case 'INVENTORY':
    return { name: 'warehouse-stock' }
  default:
    return null
  }
}

// ─── Notification shape normalizer ────────────────────────────────────────────
/**
 * Map a raw backend `NotificationResponse` to the shape the UI renders.
 *
 * Backend shape:
 *   { id, type: 'INVOICE'|'INVENTORY'|'ROUTE'|'SYSTEM',
 *     title, message, readStatus: 'READ'|'UNREAD', referenceId, createdAt }
 *
 * Normalized shape:
 *   { id, title, subtitle, time, isSeen, icon, color, target, _raw }
 *
 * @param {object}  raw
 * @param {object}  [options]
 * @param {boolean} [options.absoluteTime] - include year and clock time on older
 *   items. The full-page list has room for it; the navbar dropdown does not.
 */
export const normalizeNotification = (raw, { absoluteTime = false } = {}) => {
  // `readStatus` is the documented field. The `read`/`isRead` fallbacks exist
  // only so an unexpected payload degrades instead of marking everything unread.
  const isRead = raw.readStatus
    ? raw.readStatus === 'READ'
    : (raw.read ?? raw.isRead ?? raw.isSeen ?? false)

  const body = translateNotificationMessage(raw.message ?? raw.body ?? raw.subtitle ?? '')
  const title = translateNotificationTitle(raw.title) ?? 'إشعار'
  const presentation = TYPE_PRESENTATION[raw.type] ?? DEFAULT_PRESENTATION

  // Format timestamp. Anything inside the last 24h reads as a relative Arabic
  // phrase ("قبل 5 دقائق"); older items get an absolute date.
  let time = ''
  if (raw.createdAt) {
    try {
      const createdAt = new Date(raw.createdAt)
      const diffMs = Date.now() - createdAt.getTime()

      time = diffMs > 24 * 60 * 60 * 1000
        ? new Intl.DateTimeFormat(INTL_LOCALE, {
          month: 'short',
          day: 'numeric',
          ...(absoluteTime ? { year: 'numeric', hour: '2-digit', minute: '2-digit' } : {}),
        }).format(createdAt)
        : formatRelativeArabic(raw.createdAt)
    } catch {
      time = raw.createdAt
    }
  }

  return {
    id: raw.id,
    title,
    subtitle: body,
    time,
    isSeen: isRead,
    icon: presentation.icon,
    color: presentation.color,
    target: resolveNotificationTarget(raw),

    // Preserve original data for click navigation
    _raw: raw,
  }
}

// ─── Composable ───────────────────────────────────────────────────────────────
export const useNotifications = () => {
  const router = useRouter()

  // ── Fetch notifications feed ──────────────────────────────────────────────
  const fetchFeed = async (params = {}) => {
    loading.value = true
    error.value = null

    try {
      const data = await fetchNotifications(params)

      // Handle both paginated (content[]) and plain array responses
      const items = Array.isArray(data)
        ? data
        : (Array.isArray(data?.content) ? data.content : [])

      notifications.value = items.map(item => normalizeNotification(item))
    } catch (err) {
      console.warn('[Notifications] Failed to fetch feed:', err.message)
      error.value = 'تعذّر تحميل الإشعارات'
    } finally {
      loading.value = false
    }
  }

  // ── Fetch unread count ────────────────────────────────────────────────────
  const fetchCount = async () => {
    try {
      const count = await fetchUnreadCount()

      unreadCount.value = count
    } catch (err) {
      // Non-fatal — count stays at last known value
      console.warn('[Notifications] Failed to fetch unread count:', err.message)
    }
  }

  // ── Mark single notification as read ──────────────────────────────────────
  /**
   * Persists through `PATCH /notifications/{id}/read`.
   *
   * The list item and the badge flip first so the click feels immediate, and
   * both are put back if the request fails — an unread notification that looks
   * read is worse than one that briefly flickers.
   *
   * @returns {Promise<boolean>} whether the server accepted the write
   */
  const markRead = async notificationId => {
    const notification = notifications.value.find(n => n.id === notificationId)

    // Already read — nothing to persist.
    if (notification && notification.isSeen) return true

    const previousCount = unreadCount.value

    if (notification) notification.isSeen = true
    if (unreadCount.value > 0) unreadCount.value -= 1

    try {
      await markNotificationRead(notificationId)

      return true
    } catch (err) {
      console.warn('[Notifications] Failed to mark as read:', err.message)
      if (notification) notification.isSeen = false
      unreadCount.value = previousCount

      return false
    }
  }

  // ── Mark all as read ──────────────────────────────────────────────────────
  /**
   * Persists through `PATCH /notifications/read-all`.
   *
   * @returns {Promise<boolean>} whether the server accepted the write
   */
  const markAllRead = async () => {
    const previousSeen = notifications.value.map(n => n.isSeen)
    const previousCount = unreadCount.value

    notifications.value.forEach(n => { n.isSeen = true })
    unreadCount.value = 0

    try {
      await markAllNotificationsRead()

      return true
    } catch (err) {
      console.warn('[Notifications] Failed to mark all as read:', err.message)
      notifications.value.forEach((n, i) => { n.isSeen = previousSeen[i] ?? n.isSeen })
      unreadCount.value = previousCount

      return false
    }
  }

  // ── Notification click handler ────────────────────────────────────────────
  /**
   * Called when the user clicks a notification item.
   * Marks it read (server-side) and navigates to the record it refers to.
   */
  const handleNotificationClick = async notification => {
    // `isSeen` comes from the clicked row, which may belong to a page of the
    // full list that the shared feed does not hold. Without this guard,
    // re-clicking an already-read item there would decrement the badge again.
    if (!notification.isSeen) await markRead(notification.id)

    const target = notification.target ?? resolveNotificationTarget(notification._raw)
    if (!target) return

    try {
      await router.push(target)
    } catch {
      // Navigation cancelled or the guard rejected it — the guard has already
      // decided; nothing left for the notification layer to do.
    }
  }

  // ── Foreground FCM message handler ───────────────────────────────────────
  /**
   * Called when an FCM message arrives while the app is foregrounded.
   * Shows a toast and re-fetches from the backend (FCM is only a trigger).
   */
  const handleForegroundMessage = payload => {
    console.info('[FCM] Foreground message received')

    // Push payloads are worded by the same backend as the REST feed, so they go
    // through the same translation layer before reaching the toast.
    const title = translateNotificationTitle(payload?.notification?.title ?? payload?.data?.title) ?? 'إشعار جديد'
    const body = translateNotificationMessage(payload?.notification?.body ?? payload?.data?.body ?? '')

    // Dispatch custom event so the navbar can show an in-app toast
    window.dispatchEvent(new CustomEvent('app:notification-toast', {
      detail: { title, body },
    }))

    // Re-fetch from backend — FCM is the trigger, not the source of truth
    fetchFeed()
    fetchCount()
  }

  // ── Start polling ─────────────────────────────────────────────────────────
  const startPolling = () => {
    if (_pollingInterval) return  // already running — singleton guard

    _pollingInterval = setInterval(() => {
      fetchCount()
    }, POLL_INTERVAL_MS)
  }

  // ── Stop polling ──────────────────────────────────────────────────────────
  const stopPolling = () => {
    if (_pollingInterval) {
      clearInterval(_pollingInterval)
      _pollingInterval = null
    }
  }

  // ── Initialize FCM push ───────────────────────────────────────────────────
  const initializePush = async () => {
    try {
      const { permission } = await initializeFCM()

      fcmPermission.value = permission

      if (permission === 'granted') {
        if (_fcmUnsubscribe) return  // already subscribed — singleton guard
        _fcmUnsubscribe = await subscribeToForegroundMessages(handleForegroundMessage)
      }
    } catch (err) {
      // Non-fatal — polling continues regardless
      console.warn('[Notifications] FCM initialization failed:', err.message)
    }
  }

  // ── Initialize notification system ────────────────────────────────────────
  /**
   * Called after authentication, and again by the default layout so a reload
   * with a live session still starts the feed.
   *
   * Idempotent in the strict sense: a second caller neither re-fetches nor
   * re-registers anything, it awaits the first call's work. Re-fetching here is
   * what made login issue every notification request twice — the login flow and
   * the layout both call this, milliseconds apart. Callers that genuinely want
   * fresh data call `fetchFeed()` / `fetchCount()`.
   */
  const initialize = async () => {
    if (_initialized) return _initPromise ?? undefined

    _initialized = true

    _initPromise = (async () => {
      // Load initial data from backend
      await Promise.all([fetchFeed(), fetchCount()])

      // Start 30-second fallback polling
      startPolling()

      // Initialize FCM (non-blocking — polling works without it)
      initializePush()
    })()

    try {
      await _initPromise
    } catch (err) {
      // A failed first load must not wedge the system in "initialized" — the
      // layout or a later login has to be able to try again.
      _initialized = false
      _initPromise = null
      throw err
    }
  }

  // ── Cleanup (on logout) ───────────────────────────────────────────────────
  const cleanup = () => {
    stopPolling()

    // Unsubscribe FCM foreground listener
    if (_fcmUnsubscribe) {
      try { _fcmUnsubscribe() } catch { /* ignore */ }
      _fcmUnsubscribe = null
    }

    // Clear reactive state
    notifications.value = []
    unreadCount.value = 0
    error.value = null
    fcmPermission.value = null

    // Allow re-initialization on next login
    _initialized = false
    _initPromise = null
  }

  return {
    // State (read-only from components)
    notifications,
    unreadCount,
    loading,
    error,
    fcmPermission,

    // Methods
    initialize,
    fetchFeed,
    fetchCount,
    markRead,
    markAllRead,
    handleNotificationClick,
    startPolling,
    stopPolling,
    initializePush,
    cleanup,
  }
}
