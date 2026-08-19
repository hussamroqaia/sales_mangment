/**
 * firebase-init.js
 *
 * Firebase initialization module — single-instance, safe for tree-shaking.
 *
 * Responsibilities:
 *  - Initialize the Firebase app once (guard against duplicate initialization)
 *  - Safely detect browser Messaging support
 *  - Expose a lazy-resolved Messaging instance
 *  - Request notification permission
 *  - Obtain a FCM registration token
 *  - Register the service worker at /firebase-messaging-sw.js
 *  - Register the token with the backend via notification.service.js
 *  - Expose foreground onMessage subscription
 *
 * Configuration is drawn entirely from Vite env variables (VITE_FIREBASE_*).
 * No credentials are hardcoded here.
 *
 * Failure contract:
 *  Every exported function is non-fatal. Callers (useNotifications.js) catch
 *  errors and degrade gracefully without blocking the rest of the application.
 */

import { initializeApp, getApps, getApp } from 'firebase/app'
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging'
import { registerDeviceToken } from '@/services/notification.service'

// ─── Firebase Web configuration ───────────────────────────────────────────────
// Values are read exclusively from Vite env variables (VITE_FIREBASE_*).
// All fields are public-safe Web client config — NOT Admin SDK / service-account secrets.
//
// measurementId is included so Firebase correctly identifies the Web App within
// the project. Analytics is intentionally NOT initialized here (no getAnalytics call).
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,   // read-only; Analytics not used
}

// ─── VAPID public key ─────────────────────────────────────────────────────────
// The VAPID key is generated in Firebase Console → Project Settings →
// Cloud Messaging → Web Push certificates. It is a public key — safe in env.
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY

// ─── Internal state ───────────────────────────────────────────────────────────
let _app = null
let _messaging = null
let _messagingSupported = null   // null = not yet tested
let _tokenRegistered = false     // prevent re-registering same token per session
let _lastRegisteredToken = null  // track last sent token

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Check if all required Firebase config values are present.
 * Returns false (do nothing, log a warning) when .env is not filled.
 */
const isConfigured = () => {
  const required = ['apiKey', 'authDomain', 'projectId', 'messagingSenderId', 'appId']

  return required.every(key => {
    const value = firebaseConfig[key]

    return value && value !== `undefined` && value.trim() !== ''
  })
}

// ─── Initialize Firebase ──────────────────────────────────────────────────────
const getFirebaseApp = () => {
  if (_app) return _app

  if (!isConfigured()) {
    console.warn('[Firebase] Missing configuration. Set VITE_FIREBASE_* in .env')

    return null
  }

  // Avoid duplicate app error if HMR re-runs this module
  _app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)

  return _app
}

// ─── Messaging support check ──────────────────────────────────────────────────
/**
 * Returns true when this browser supports Firebase Messaging.
 * The isSupported() call is async and cached after the first invocation.
 *
 * @returns {Promise<boolean>}
 */
export const isFCMSupported = async () => {
  if (_messagingSupported !== null) return _messagingSupported

  try {
    _messagingSupported = await isSupported()
  } catch {
    _messagingSupported = false
  }

  return _messagingSupported
}

// ─── Get Messaging instance ───────────────────────────────────────────────────
/**
 * Returns the Firebase Messaging instance, or null when unsupported/unconfigured.
 *
 * @returns {Promise<import('firebase/messaging').Messaging|null>}
 */
export const getFirebaseMessaging = async () => {
  if (_messaging) return _messaging

  if (!(await isFCMSupported())) return null

  const app = getFirebaseApp()
  if (!app) return null

  try {
    _messaging = getMessaging(app)

    return _messaging
  } catch (error) {
    console.warn('[Firebase] Failed to get Messaging instance:', error.message)

    return null
  }
}

// ─── Register service worker ──────────────────────────────────────────────────
/**
 * Registers /firebase-messaging-sw.js with the browser.
 * After registration, sends the Firebase config to the SW via postMessage
 * so the SW can initialize Firebase lazily (it cannot use import.meta.env).
 * Returns the ServiceWorkerRegistration, or null on failure.
 *
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) return null

  try {
    // Check if already registered to avoid duplicate registrations
    const existing = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')
    if (existing) {
      // Re-send config in case the SW was re-installed
      sendConfigToServiceWorker(existing)

      return existing
    }

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
    })

    // Wait for the SW to be active before sending config
    if (registration.installing || registration.waiting) {
      await new Promise(resolve => {
        const sw = registration.installing ?? registration.waiting
        sw.addEventListener('statechange', e => {
          if (e.target.state === 'activated') resolve()
        })
        // Also resolve if it's already active
        if (registration.active) resolve()
      })
    }

    sendConfigToServiceWorker(registration)

    return registration
  } catch (error) {
    console.warn('[Firebase] Service worker registration failed:', error.message)

    return null
  }
}

/**
 * Post the Firebase config to the service worker so it can initialize
 * Firebase itself (it cannot access import.meta.env).
 *
 * @param {ServiceWorkerRegistration} registration
 */
const sendConfigToServiceWorker = registration => {
  const sw = registration.active ?? registration.waiting ?? registration.installing
  if (!sw) return

  try {
    sw.postMessage({
      type: 'FIREBASE_CONFIG',
      config: firebaseConfig,
    })
  } catch (error) {
    console.warn('[Firebase] Failed to send config to service worker:', error.message)
  }
}

// ─── Request permission ───────────────────────────────────────────────────────
/**
 * Requests notification permission from the browser.
 *
 * Returns:
 *   'granted'   — user allowed
 *   'denied'    — user blocked (do NOT ask again)
 *   'default'   — user dismissed (can ask again)
 *   'unsupported' — Notification API not available
 *
 * @returns {Promise<'granted'|'denied'|'default'|'unsupported'>}
 */
export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) return 'unsupported'

  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'

  try {
    const result = await Notification.requestPermission()

    return result
  } catch (error) {
    console.warn('[Firebase] Permission request failed:', error.message)

    return 'default'
  }
}

// ─── Get & register FCM token ─────────────────────────────────────────────────
/**
 * Obtains a FCM Web push token and registers it with the backend.
 *
 * Steps:
 *   1. Ensure messaging is supported and configured
 *   2. Register the service worker
 *   3. Call Firebase getToken() with VAPID key and SW registration
 *   4. POST token to backend (only if token changed since last registration)
 *
 * Non-fatal: errors are caught and logged, returning null.
 *
 * @returns {Promise<string|null>} the FCM token, or null on failure
 */
export const getAndRegisterFCMToken = async () => {
  const messaging = await getFirebaseMessaging()
  if (!messaging) return null

  if (!VAPID_KEY) {
    console.warn('[Firebase] VITE_FIREBASE_VAPID_KEY not set — cannot obtain FCM token')

    return null
  }

  const swRegistration = await registerServiceWorker()

  try {
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      ...(swRegistration ? { serviceWorkerRegistration: swRegistration } : {}),
    })

    if (!token) {
      console.warn('[Firebase] getToken() returned empty — permission may not be granted')

      return null
    }

    // Only POST to backend when token is new or changed
    if (token !== _lastRegisteredToken) {
      await registerDeviceToken(token)
      _lastRegisteredToken = token
      _tokenRegistered = true
      console.info('[Firebase] FCM token registered with backend')
    }

    return token
  } catch (error) {
    // Common: permission denied, SW scope mismatch
    console.warn('[Firebase] Failed to get/register FCM token:', error.message)

    return null
  }
}

// ─── Foreground message handler ───────────────────────────────────────────────
/**
 * Subscribe to foreground FCM messages.
 * Returns an unsubscribe function for cleanup.
 *
 * @param {Function} handler - receives the FCM message payload
 * @returns {Promise<Function>} unsubscribe function (no-op if unsupported)
 */
export const subscribeToForegroundMessages = async handler => {
  const messaging = await getFirebaseMessaging()
  if (!messaging) return () => {}

  try {
    // onMessage returns an unsubscribe function
    const unsubscribe = onMessage(messaging, payload => {
      try {
        handler(payload)
      } catch (handlerError) {
        console.warn('[Firebase] Foreground message handler threw:', handlerError)
      }
    })

    return unsubscribe
  } catch (error) {
    console.warn('[Firebase] onMessage subscription failed:', error.message)

    return () => {}
  }
}

// ─── Full FCM initialization ──────────────────────────────────────────────────
/**
 * Top-level FCM initialization. Called after the user is authenticated.
 *
 * 1. Check browser support
 * 2. Check/request Notification permission
 * 3. Get FCM token and register with backend
 *
 * @returns {Promise<{ token: string|null, permission: string }>}
 */
export const initializeFCM = async () => {
  if (!(await isFCMSupported())) {
    console.info('[Firebase] FCM not supported in this browser')

    return { token: null, permission: 'unsupported' }
  }

  const permission = await requestNotificationPermission()

  if (permission !== 'granted') {
    // 'denied' or 'default' — do not attempt to get token
    return { token: null, permission }
  }

  const token = await getAndRegisterFCMToken()

  return { token, permission }
}
