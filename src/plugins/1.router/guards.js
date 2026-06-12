import { canNavigate } from '@layouts/plugins/casl'

/**
 * Enhanced global navigation guards for the auth system.
 *
 * Rules enforced:
 *  1. Public routes (meta.public)              → always allowed
 *  2. Unauthenticated-only routes (meta.unauthenticatedOnly):
 *       - logged in → redirect to '/'
 *       - not logged in → allow
 *  3. Protected routes:
 *       - not logged in → redirect to /login (with ?to= for redirect after login)
 *       - first-time login (meta flag on userData) → redirect to /first-time-reset-password
 *       - logged in but no CASL permission → /not-authorized
 *       - logged in + authorized → allow
 *
 * Token refresh strategy:
 *  The access token has a short lifetime (15 min). When it expires its cookie
 *  value becomes null. However, a valid refresh token means the session is still
 *  active — the Axios response interceptor will silently exchange it for a new
 *  access token on the first API call that returns a 401.
 *  Therefore we must NOT redirect to login while a refresh token still exists.
 *  We only redirect when BOTH tokens are absent (truly unauthenticated).
 */
export const setupGuards = router => {
  router.beforeEach(to => {
    // ── 1. Public routes — no auth needed ────────────────────────────────
    if (to.meta.public) {
      console.log(`[AUTH GUARD] ✅ Public route → allow: ${to.path}`)
      return
    }

    // ── Resolve auth state from cookies ──────────────────────────────────
    const accessToken = useCookie('accessToken').value
    const refreshToken = useCookie('refreshToken').value
    const userDataRaw = useCookie('userData').value

    // A user is considered "logged in" at the guard level if:
    //   a) They have a valid access token + user data (fully active session), OR
    //   b) Their access token expired but the refresh token is still valid.
    //      The Axios interceptor will handle the silent refresh on the next API call.
    const hasActiveSession = !!(accessToken && userDataRaw)
    const canRefreshSession = !!(refreshToken && userDataRaw)
    const isLoggedIn = hasActiveSession || canRefreshSession

    // 🔍 DEBUG — remove after fix is confirmed
    // Safe preview: handles string, object, null/undefined without crashing
    const safePreview = val => {
      if (val === null || val === undefined) return null
      if (typeof val === 'string') return `"${val.slice(0, 30)}..." (string)`
      return `[typeof: ${typeof val}] ${JSON.stringify(val).slice(0, 60)}`
    }

    console.group(`[AUTH GUARD] Navigating to: ${to.path}`)
    console.log('accessToken  raw type :', typeof accessToken, '| value:', safePreview(accessToken))
    console.log('refreshToken raw type :', typeof refreshToken, '| value:', safePreview(refreshToken))
    console.log('userData     :', userDataRaw)
    console.log('hasActiveSession  :', hasActiveSession)
    console.log('canRefreshSession :', canRefreshSession)
    console.log('isLoggedIn        :', isLoggedIn)
    console.groupEnd()

    // ── 2. Unauthenticated-only pages (login, forgot-password, etc.) ──────
    if (to.meta.unauthenticatedOnly) {
      if (isLoggedIn) {
        console.log('[AUTH GUARD] 🔄 unauthenticatedOnly route but user is logged in → redirect /')
        return '/'
      } else {
        console.log('[AUTH GUARD] ✅ unauthenticatedOnly route, not logged in → allow')
        return undefined
      }
    }

    // ── 3. Protected routes ───────────────────────────────────────────────

    // 3a. Not logged in (no access token AND no refresh token) → redirect to login
    if (!isLoggedIn) {
      console.warn('[AUTH GUARD] 🚫 No access token AND no refresh token → redirect to /login')
      return {
        name: 'login',
        query: {
          ...to.query,
          to: to.fullPath !== '/' ? to.path : undefined,
        },
      }
    }

    // 3b. First-time login → force redirect to password reset page
    //     Allow the reset page itself to pass through (prevent infinite redirect)
    if (
      userDataRaw?.isFirstLogin === true
      && to.name !== 'first-time-reset-password'
    ) {
      console.log('[AUTH GUARD] 🔄 First-time login → redirect to first-time-reset-password')
      return { name: 'first-time-reset-password' }
    }

    // 3c. CASL ability check — only if the route has matched components
    const isAuthorized = canNavigate(to)
    console.log(`[AUTH GUARD] CASL isAuthorized: ${isAuthorized}, matched routes: ${to.matched.length}`)

    // Explicitly allow dashboards-analytics for all logged-in users, bypassing CASL quirks
    if (to.name === 'dashboards-analytics' && isLoggedIn) {
      console.log('[AUTH GUARD] ✅ dashboards-analytics bypass → allow')
      return
    }

    if (!isAuthorized && to.matched.length) {
      console.warn('[AUTH GUARD] 🚫 Not authorized by CASL → redirect to /not-authorized')
      return { name: 'not-authorized' }
    }

    // ── Allow navigation ──────────────────────────────────────────────────
    console.log(`[AUTH GUARD] ✅ Authorized → allow navigation to: ${to.path}`)
  })
}
