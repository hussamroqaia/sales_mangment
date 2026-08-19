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
 *  The backend does not expose confirmed mark-read endpoints.
 *  Read state is managed as local UI state only (no API calls).
 *  The composable re-fetches the feed from the backend on FCM trigger
 *  and polling, so the server's true read state always wins on refresh.
 */

import {
  fetchNotifications,
  fetchUnreadCount,
} from '@/services/notification.service'

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

// ─── Shared reactive state ─────────────────────────────────────────────────────
// Using module-level refs so all callers share ONE state (singleton pattern).
const notifications = ref([])
const unreadCount = ref(0)
const loading = ref(false)
const error = ref(null)
const fcmPermission = ref(null)   // 'granted'|'denied'|'default'|'unsupported'|null

// ─── Notification shape normalizer ────────────────────────────────────────────
/**
 * Map a raw backend notification to the shape rendered by NavBarNotifications.vue.
 *
 * Backend shape (assumed):
 *   { id, title, message/body, read/isRead, createdAt, type, ... }
 *
 * Normalized shape:
 *   { id, title, subtitle, time, isSeen, icon, color, _raw }
 */
const normalizeNotification = raw => {
  const isRead = raw.read ?? raw.isRead ?? raw.isSeen ?? false
  const body = raw.message ?? raw.body ?? raw.subtitle ?? ''
  const title = raw.title ?? 'Notification'

  // Format timestamp
  let time = ''
  if (raw.createdAt) {
    try {
      const diffMs = Date.now() - new Date(raw.createdAt)
      if (diffMs > 24 * 60 * 60 * 1000) {
        time = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(raw.createdAt))
      } else if (diffMs > 60 * 60 * 1000) {
        const hours = Math.floor(diffMs / (60 * 60 * 1000))
        time = `${hours}h ago`
      } else if (diffMs > 60 * 1000) {
        const mins = Math.floor(diffMs / (60 * 1000))
        time = `${mins}m ago`
      } else {
        time = 'Just now'
      }
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
    icon: raw.icon ?? 'tabler-bell',
    color: raw.color ?? undefined,
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

      notifications.value = items.map(normalizeNotification)
    } catch (err) {
      console.warn('[Notifications] Failed to fetch feed:', err.message)
      error.value = 'Failed to load notifications'
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

  // ── Mark single notification as read (LOCAL STATE ONLY) ───────────────────
  // No API call — backend does not expose a confirmed mark-read endpoint.
  // The backend's true read state wins on the next feed refresh.
  const markRead = notificationId => {
    const notification = notifications.value.find(n => n.id === notificationId)
    if (notification && !notification.isSeen) {
      notification.isSeen = true
      if (unreadCount.value > 0) unreadCount.value -= 1
    }
  }

  // ── Mark all as read (LOCAL STATE ONLY) ───────────────────────────────────
  // No API call — backend does not expose a confirmed mark-all-read endpoint.
  const markAllRead = () => {
    notifications.value.forEach(n => { n.isSeen = true })
    unreadCount.value = 0
  }

  // ── Notification click handler ────────────────────────────────────────────
  /**
   * Called when user clicks a notification item.
   * Marks it as read locally and navigates if the backend provided a route.
   */
  const handleNotificationClick = async notification => {
    markRead(notification.id)

    // Only navigate when the backend explicitly provides routing data
    const raw = notification._raw
    if (raw?.actionUrl) {
      try {
        const url = new URL(raw.actionUrl, window.location.origin)
        if (url.origin === window.location.origin) {
          await router.push(url.pathname + url.search)
        }
      } catch {
        // Invalid URL — ignore
      }
    } else if (raw?.routeName) {
      try {
        await router.push({ name: raw.routeName, params: raw.routeParams })
      } catch {
        // Route doesn't exist — ignore
      }
    }
  }

  // ── Foreground FCM message handler ───────────────────────────────────────
  /**
   * Called when an FCM message arrives while the app is foregrounded.
   * Shows a toast and re-fetches from the backend (FCM is only a trigger).
   */
  const handleForegroundMessage = payload => {
    console.info('[FCM] Foreground message received')

    const title = payload?.notification?.title ?? payload?.data?.title ?? 'New Notification'
    const body = payload?.notification?.body ?? payload?.data?.body ?? ''

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
   * Called after authentication. Idempotent — safe to call multiple times.
   * Guards against duplicate polling/listeners via module-level _initialized flag.
   */
  const initialize = async () => {
    if (_initialized) {
      // Already running — refresh data only
      await Promise.all([fetchFeed(), fetchCount()])

      return
    }

    _initialized = true

    // Load initial data from backend
    await Promise.all([fetchFeed(), fetchCount()])

    // Start 30-second fallback polling
    startPolling()

    // Initialize FCM (non-blocking — polling works without it)
    initializePush()
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
