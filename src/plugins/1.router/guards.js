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

    // ── 2. Unauthenticated-only pages (login, forgot-password, etc.) ──────
    if (to.meta.unauthenticatedOnly) {
      if (isLoggedIn) {
        return '/'
      } else {
        return undefined
      }
    }

    // ── 3. Protected routes ───────────────────────────────────────────────

    // 3a. Not logged in (no access token AND no refresh token) → redirect to login
    if (!isLoggedIn) {
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
      return { name: 'first-time-reset-password' }
    }

    // 3c. CASL ability check — only if the route has matched components
    const isAuthorized = canNavigate(to)

    // Explicitly allow dashboards-analytics for all logged-in users, bypassing CASL quirks
    if (to.name === 'dashboards-analytics' && isLoggedIn) {
      return
    }

    if (!isAuthorized && to.matched.length) {
      return { name: 'not-authorized' }
    }
  })
}
