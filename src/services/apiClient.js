import axios from 'axios'

// ─── Constants ───────────────────────────────────────────────────────────────
const REFRESH_ENDPOINT = '/auth/refresh'
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

// ─── Axios Instance ───────────────────────────────────────────────────────────
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
})

// ─── Helper: Cookie Utilities ─────────────────────────────────────────────────
// We use raw document.cookie for the interceptor context (outside Vue component)
const getCookie = name => {
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`))

  return match ? decodeURIComponent(match[2]) : null
}

const setCookie = (name, value, maxAgeMs) => {
  const maxAge = Math.floor(maxAgeMs / 1000)
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Strict`
}

const removeCookie = name => {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Strict`
}

// ─── Token / Base URL Accessors ───────────────────────────────────────────────
// Exported so transports that cannot go through Axios (browser SSE needs a
// streaming `fetch()` — see tracking.service.js) reuse THIS token source and
// base URL instead of re-implementing cookie/JWT handling.
// This is a read-only accessor: refreshing stays the response interceptor's job.
export const getAccessToken = () => getCookie('accessToken')

export const getApiBaseUrl = () => apiClient.defaults.baseURL ?? ''

// ─── Access-Token Usability ───────────────────────────────────────────────────
// Reads the `exp` claim only, and never verifies the signature — that is the
// server's job. This exists solely to tell the two causes of a 403 apart; see
// the response interceptor below for why the backend cannot tell us.
//
// Tolerance for clock skew between browser and server. Erring on the side of
// "expired" is safe: the worst case is one unnecessary refresh.
const CLOCK_SKEW_MS = 5000

const decodeJwtExpiry = token => {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null

    const { exp } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))

    return typeof exp === 'number' ? exp * 1000 : null
  } catch {
    return null
  }
}

/**
 * True when an access token is present AND has not visibly expired.
 *
 * A token whose `exp` cannot be read counts as usable: we do not discard a
 * token shape we fail to recognise, we let the server rule on it.
 */
export const hasUsableAccessToken = () => {
  const token = getCookie('accessToken')
  if (!token) return false

  const expiresAt = decodeJwtExpiry(token)
  if (expiresAt === null) return true

  return Date.now() + CLOCK_SKEW_MS < expiresAt
}

// ─── Force Logout Helper ──────────────────────────────────────────────────────
// Exported so useAuth composable can also trigger it (single-session eviction)
export const forceLogout = () => {
  removeCookie('accessToken')
  removeCookie('refreshToken')
  removeCookie('userData')
  removeCookie('userAbilityRules')

  // Redirect to login — using window.location to avoid circular imports with router
  if (window.location.pathname !== '/login') {
    window.location.href = '/login?session=expired'
  }
}

// ─── Request Interceptor ──────────────────────────────────────────────────────
// Attaches Bearer token from cookie to every outgoing request
apiClient.interceptors.request.use(
  config => {
    const token = getCookie('accessToken')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    return config
  },
  error => Promise.reject(error),
)

// ─── Response Interceptor ─────────────────────────────────────────────────────
// Handles 401 errors: attempts silent token refresh, retries original request.
// If refresh fails (invalid/expired refresh token) → force logout.

// Flag to prevent multiple concurrent refresh calls
let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })
  failedQueue = []
}

/**
 * Raw HTTP refresh call: POST /auth/refresh, persist new cookies, return new token.
 * Contains no queue management — callers own concurrency control.
 */
const doRefreshCycle = async () => {
  const refreshTokenValue = getCookie('refreshToken')
  if (!refreshTokenValue) throw new Error('no_refresh_token')

  const response = await axios.post(
    `${import.meta.env.VITE_API_BASE_URL}${REFRESH_ENDPOINT}`,
    {},
    { headers: { Authorization: `Bearer ${refreshTokenValue}` } },
  )

  const { accessToken: newAccessToken, refreshToken: newRefreshToken } = response.data?.data || response.data

  setCookie('accessToken', newAccessToken, 15 * 60 * 1000)
  if (newRefreshToken) setCookie('refreshToken', newRefreshToken, SEVEN_DAYS_MS)
  apiClient.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`

  return newAccessToken
}

/**
 * Refresh the access token from outside the Axios stack (e.g. the SSE transport).
 * Shares `isRefreshing` / `failedQueue` with the response interceptor so a
 * concurrent Axios refresh and an SSE-triggered refresh are serialised — only
 * one round-trip ever happens regardless of how many callers race.
 */
export const refreshAccessToken = async () => {
  if (isRefreshing) {
    return new Promise((resolve, reject) => { failedQueue.push({ resolve, reject }) })
  }

  isRefreshing = true

  try {
    const token = await doRefreshCycle()

    processQueue(null, token)

    return token
  } catch (error) {
    processQueue(error, null)
    forceLogout()
    throw error
  } finally {
    isRefreshing = false
  }
}

apiClient.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config
    const status = error.response?.status

    // ── Is this an authentication failure? ──────────────────────────────────
    // The backend does not answer this consistently, so the frontend decides.
    //
    //   401 — always authentication. JwtAuthFilter returns 401 for every token
    //         it rejects: expired, malformed, blacklisted, missing claims,
    //         unknown role, inactive or suspended account.
    //
    //   403 — ambiguous, and this is NOT a mistake we can fix from here. The
    //         backend's SecurityConfig registers no `authenticationEntryPoint`,
    //         so Spring Security's default Http403ForbiddenEntryPoint is in
    //         force: a request carrying NO Authorization header is answered
    //         403, not 401. A genuine @PreAuthorize role denial is also 403,
    //         and the two bodies are not reliably distinguishable (the
    //         unauthenticated one is Spring Boot's default error envelope,
    //         which no config here pins down).
    //
    // The disambiguator is local and exact. JwtAuthFilter rejects every bad
    // token with 401, so a request only ever reaches a role check when its
    // token was accepted. Therefore:
    //   403 while holding a live token  → real permission denial
    //   403 while holding no live token → the unauthenticated case, mis-statused
    //
    // This matters in the ordinary idle case, not some edge: the accessToken
    // cookie is written with a 15-minute max-age and the JWT is issued with a
    // 15-minute TTL, so an idle tab loses the cookie and starts sending no
    // Authorization header at all.
    const isAuthFailure = status === 401 || (status === 403 && !hasUsableAccessToken())

    if (!isAuthFailure || originalRequest._retry) {
      return Promise.reject(error)
    }

    // Don't try to refresh if the failing request IS the refresh endpoint
    if (originalRequest.url?.includes(REFRESH_ENDPOINT)) {
      forceLogout()

      return Promise.reject(error)
    }

    // If a refresh is already in-flight, queue this request.
    // `_retry` is set here too: a queued request that still comes back
    // unauthenticated after being replayed with the new token must not be
    // allowed to open a second refresh cycle.
    if (isRefreshing) {
      originalRequest._retry = true

      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      }).then(token => {
        originalRequest.headers.Authorization = `Bearer ${token}`

        return apiClient(originalRequest)
      })
    }

    // Mark as retried to prevent infinite loops
    originalRequest._retry = true
    isRefreshing = true

    if (!getCookie('refreshToken')) {
      isRefreshing = false
      processQueue(error, null)
      forceLogout()

      return Promise.reject(error)
    }

    let newAccessToken

    try {
      newAccessToken = await doRefreshCycle()
    } catch (refreshError) {
      processQueue(refreshError, null)
      forceLogout()

      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }

    // Released before replaying our own request, and deliberately outside the
    // try above: once doRefreshCycle() has resolved the refresh has succeeded,
    // so a failure of the retry below belongs to the ORIGINAL request. Leaving
    // the retry inside the try would report a 500 from the replayed call as a
    // refresh failure and force a logout the session never earned.
    processQueue(null, newAccessToken)

    originalRequest.headers.Authorization = `Bearer ${newAccessToken}`

    return apiClient(originalRequest)
  },
)

export default apiClient
