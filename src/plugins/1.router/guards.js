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
 */
export const setupGuards = router => {
  router.beforeEach(to => {
    // ── 1. Public routes — no auth needed ────────────────────────────────
    if (to.meta.public)
      return

    // ── Resolve auth state from cookies ──────────────────────────────────
    const accessToken = useCookie('accessToken').value
    const userDataRaw = useCookie('userData').value
    const isLoggedIn = !!(accessToken && userDataRaw)

    // ── 2. Unauthenticated-only pages (login, forgot-password, etc.) ──────
    if (to.meta.unauthenticatedOnly) {
      if (isLoggedIn)
        return '/'
      else
        return undefined
    }

    // ── 3. Protected routes ───────────────────────────────────────────────

    // 3a. Not logged in → redirect to login, preserve intended destination
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

    // ── Allow navigation ──────────────────────────────────────────────────
  })
}
