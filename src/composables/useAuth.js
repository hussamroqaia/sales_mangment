/**
 * useAuth.js
 *
 * Central auth composable. Manages all authentication state and business logic.
 * UI components call ONLY this composable — never the service or Axios directly.
 *
 * Responsibilities:
 *  - Token storage (cookies via VueUse useCookie)
 *  - Login / Logout / Force-Logout / Change Password
 *  - Rate-limiting lockout (5 attempts → 15 min lockout, persisted in localStorage)
 *  - First-time login detection and redirect
 *  - Single-session eviction handling
 *  - CASL ability update on login/logout
 */

import { useAbility } from '@casl/vue'
import { loginUser, logoutUser, changePassword as changePasswordService } from '@/services/auth.service'

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 15 * 60 * 1000  // 15 minutes
const LOCKOUT_STORAGE_KEY = 'auth_lockout'
const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000  // 15 minutes (900s)
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000  // 7 days

// ─── Lockout Storage Helpers ──────────────────────────────────────────────────
const getLockoutState = () => {
  try {
    const raw = localStorage.getItem(LOCKOUT_STORAGE_KEY)

    return raw ? JSON.parse(raw) : { attempts: 0, lockoutUntil: 0 }
  } catch {
    return { attempts: 0, lockoutUntil: 0 }
  }
}

const saveLockoutState = state => {
  try {
    localStorage.setItem(LOCKOUT_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage not available — fail silently
  }
}

const clearLockoutState = () => {
  try {
    localStorage.removeItem(LOCKOUT_STORAGE_KEY)
  } catch {
    // fail silently
  }
}

// ─── Composable ───────────────────────────────────────────────────────────────
export const useAuth = () => {
  const router = useRouter()
  const ability = useAbility()

  // ── Cookie-backed State ──────────────────────────────────────────────────
  // useCookie (VueUse) is reactive and syncs across tabs automatically.
  const accessTokenCookie = useCookie('accessToken', { maxAge: ACCESS_TOKEN_MAX_AGE / 1000 })
  const refreshTokenCookie = useCookie('refreshToken', { maxAge: REFRESH_TOKEN_MAX_AGE / 1000 })
  const userDataCookie = useCookie('userData')
  const userAbilityRulesCookie = useCookie('userAbilityRules')

  // ── UI State ─────────────────────────────────────────────────────────────
  const isLoading = ref(false)
  const loginError = ref('')

  // ── Lockout State (persisted in localStorage) ────────────────────────────
  const lockoutData = ref(getLockoutState())

  const isLockedOut = computed(() => {
    return lockoutData.value.lockoutUntil > Date.now()
  })

  const lockoutRemainingMs = computed(() => {
    return isLockedOut.value
      ? Math.max(0, lockoutData.value.lockoutUntil - Date.now())
      : 0
  })

  const lockoutRemainingFormatted = computed(() => {
    const totalSeconds = Math.ceil(lockoutRemainingMs.value / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  })

  // Sync lockout ref with localStorage on mount (handles page refreshes)
  const syncLockout = () => {
    lockoutData.value = getLockoutState()
  }

  // ── Computed: is authenticated ────────────────────────────────────────────
  const isAuthenticated = computed(() => {
    return !!(accessTokenCookie.value && userDataCookie.value)
  })

  const userData = computed(() => userDataCookie.value)

  // ── Internal: record a failed attempt ────────────────────────────────────
  const recordFailedAttempt = () => {
    const state = getLockoutState()
    state.attempts += 1

    if (state.attempts >= MAX_ATTEMPTS) {
      state.lockoutUntil = Date.now() + LOCKOUT_DURATION_MS
    }

    saveLockoutState(state)
    lockoutData.value = { ...state }
  }

  // ── Internal: clear lockout after successful login ────────────────────────
  const clearLockout = () => {
    clearLockoutState()
    lockoutData.value = { attempts: 0, lockoutUntil: 0 }
  }

  // ── Internal: persist auth data to cookies ────────────────────────────────
  const persistAuthData = data => {
    // Normalize role to lowercase for compatibility with Vuexy redirects
    const normalizedUserData = {
      ...data,
      role: data.role?.toLowerCase() ?? data.role,
    }

    accessTokenCookie.value = data.accessToken
    refreshTokenCookie.value = data.refreshToken

    // Strip tokens from userData before storing (principle of least privilege)
    const { accessToken, refreshToken, ...userInfo } = normalizedUserData
    userDataCookie.value = userInfo
  }

  // ── Internal: update CASL abilities based on role ─────────────────────────
  const updateAbility = role => {
    // Map server roles to CASL ability rules
    // Extend this mapping as your permission model grows
    const abilityRulesMap = {
      admin: [{ action: 'manage', subject: 'all' }],
      sales_manager: [{ action: 'read', subject: 'all' }],
      sales_rep: [{ action: 'read', subject: 'all' }],
      warehouse_manager: [{ action: 'read', subject: 'all' }],
    }

    const rules = abilityRulesMap[role?.toLowerCase()] ?? [{ action: 'read', subject: 'all' }]

    userAbilityRulesCookie.value = rules
    ability.update(rules)
  }

  // ── Internal: clear all auth state ───────────────────────────────────────
  const clearAuthState = () => {
    accessTokenCookie.value = null
    refreshTokenCookie.value = null
    userDataCookie.value = null
    userAbilityRulesCookie.value = null
    ability.update([])
  }

  // ── login() ──────────────────────────────────────────────────────────────
  /**
   * Authenticate user. Handles:
   *  - Lockout enforcement
   *  - Failed attempt tracking
   *  - First-time login redirect
   *  - Normal dashboard redirect
   *
   * @param {string} email
   * @param {string} password
   * @param {string} [redirectTo] - Optional path to redirect to after login
   */
  const login = async (email, password, redirectTo = '/') => {
    // Refresh lockout state from localStorage before checking
    syncLockout()

    if (isLockedOut.value) {
      loginError.value = `Too many failed attempts. Please try again in ${lockoutRemainingFormatted.value}.`

      return
    }

    isLoading.value = true
    loginError.value = ''

    try {
      const data = await loginUser(email, password)

      // ✅ Successful login — clear any lockout counter
      clearLockout()

      // Persist tokens and user info to cookies
      persistAuthData(data)

      // Update CASL ability rules
      updateAbility(data.role)

      // ── First-Time Login Flow ──────────────────────────────────────────
      // The backend signals a first-time user via `isFirstLogin: true`.
      // Redirect them to the mandatory password reset page.
      if (data.isFirstLogin === true || data.mustChangePassword === true) {
        // Temporarily mark the user as needing a password reset.
        // The guard will read this flag to allow access to first-time-reset-password.
        userDataCookie.value = { ...userDataCookie.value, isFirstLogin: true }
        await router.replace({ name: 'first-time-reset-password' })

        return
      }

      // ── Normal Login → Redirect ───────────────────────────────────────
      await nextTick(() => {
        router.replace(redirectTo !== '/' ? redirectTo : '/')
      })
    } catch (error) {
      const status = error?.response?.status
      const message = error?.response?.data?.message

      // ── Single-Session Eviction (conflict from another login) ─────────
      // Some backends return 409 or a specific message for session conflicts
      if (status === 409 || message?.toLowerCase().includes('session')) {
        loginError.value = 'Your account is already logged in on another device. Please try again.'

        return
      }

      // ── Invalid credentials ───────────────────────────────────────────
      if (status === 401 || status === 400 || status === 403) {
        recordFailedAttempt()
        syncLockout()

        const remaining = MAX_ATTEMPTS - getLockoutState().attempts

        if (isLockedOut.value) {
          loginError.value = `Account locked after ${MAX_ATTEMPTS} failed attempts. Try again in 15 minutes.`
        } else {
          const attemptsLeft = remaining > 0 ? remaining : 0
          loginError.value = attemptsLeft > 0
            ? `Invalid email or password. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining.`
            : 'Invalid email or password.'
        }

        return
      }

      // ── Network / Server error ────────────────────────────────────────
      loginError.value = message || 'Login failed. Please check your connection and try again.'
    } finally {
      isLoading.value = false
    }
  }

  // ── logout() ─────────────────────────────────────────────────────────────
  /**
   * Log out the current user. Calls the backend, then clears local state.
   * Even if the API call fails, local state is cleared (graceful degradation).
   */
  const logout = async () => {
    isLoading.value = true

    try {
      await logoutUser()
    } catch (error) {
      // Logout API failure should not prevent local cleanup
      console.warn('[useAuth] Logout API call failed — clearing local state anyway.', error)
    } finally {
      clearAuthState()
      isLoading.value = false
      await router.replace({ name: 'login' })
    }
  }

  // ── forceLogout() ────────────────────────────────────────────────────────
  /**
   * Called by the Axios interceptor on unrecoverable 401s (e.g. expired refresh token
   * or single-session eviction from another device).
   * Does NOT call the API — just wipes local state and redirects.
   */
  const forceLogout = () => {
    clearAuthState()

    // The Axios interceptor handles the window.location redirect,
    // but we also ensure Vue Router is updated if called from a component.
    if (router.currentRoute.value?.name !== 'login') {
      router.replace({ name: 'login', query: { session: 'expired' } })
    }
  }

  // ── changePassword() ─────────────────────────────────────────────────────
  /**
   * Change the authenticated user's password.
   * On success after first-time login: clears the `isFirstLogin` flag and
   * redirects to the main dashboard.
   *
   * @param {string} currentPassword
   * @param {string} newPassword
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  const changePassword = async (currentPassword, newPassword) => {
    isLoading.value = true

    try {
      const result = await changePasswordService(currentPassword, newPassword)

      if (result.success) {
        // ── Clear first-time-login flag ────────────────────────────────
        if (userDataCookie.value?.isFirstLogin) {
          userDataCookie.value = { ...userDataCookie.value, isFirstLogin: false }
        }

        // ── Redirect to dashboard ──────────────────────────────────────
        await nextTick(() => {
          router.replace('/')
        })

        return { success: true }
      }

      return { success: false, error: result.message || 'Password change failed.' }
    } catch (error) {
      const message = error?.response?.data?.message

      // Handle common change-password errors
      if (error?.response?.status === 400) {
        return { success: false, error: message || 'Current password is incorrect.' }
      }

      return { success: false, error: message || 'Failed to update password. Please try again.' }
    } finally {
      isLoading.value = false
    }
  }

  return {
    // State
    isLoading,
    loginError,
    isAuthenticated,
    userData,
    isLockedOut,
    lockoutRemainingMs,
    lockoutRemainingFormatted,

    // Methods
    login,
    logout,
    forceLogout,
    changePassword,
    syncLockout,
  }
}
