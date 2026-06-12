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
      console.log(`[AXIOS] 📤 Request: ${config.method?.toUpperCase()} ${config.url} | accessToken: "${token.slice(0, 20)}..."`)
    } else {
      console.warn(`[AXIOS] ⚠️ Request: ${config.method?.toUpperCase()} ${config.url} | NO accessToken in cookie`)
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

apiClient.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config

    // Only handle 401 errors that haven't been retried yet
    if (error.response?.status !== 401 || originalRequest._retry) {
      console.log(`[AXIOS] 📥 Response error: ${error.response?.status} for ${originalRequest?.url} (not a 401 or already retried — skipping refresh)`)
      return Promise.reject(error)
    }

    console.warn(`[AXIOS] 🔑 401 received for: ${originalRequest?.url} — attempting token refresh...`)

    // Don't try to refresh if the failing request IS the refresh endpoint
    if (originalRequest.url?.includes(REFRESH_ENDPOINT)) {
      console.error('[AXIOS] 🚫 Refresh endpoint itself returned 401 — calling forceLogout()')
      forceLogout()

      return Promise.reject(error)
    }

    // If a refresh is already in-flight, queue this request
    if (isRefreshing) {
      console.log('[AXIOS] ⏳ Refresh already in progress — queuing request:', originalRequest?.url)
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      }).then(token => {
        originalRequest.headers.Authorization = `Bearer ${token}`

        return apiClient(originalRequest)
      }).catch(err => Promise.reject(err))
    }

    // Mark as retried to prevent infinite loops
    originalRequest._retry = true
    isRefreshing = true

    const refreshTokenValue = getCookie('refreshToken')

    if (!refreshTokenValue) {
      console.error('[AXIOS] 🚫 No refreshToken cookie found — calling forceLogout()')
      isRefreshing = false
      forceLogout()

      return Promise.reject(error)
    }

    console.log(`[AXIOS] 🔄 Refresh token found: "${refreshTokenValue.slice(0, 20)}..." — calling ${REFRESH_ENDPOINT}`)

    try {
      // Call refresh endpoint — send the refreshToken as the Bearer Authorization header
      // The backend's /auth/refresh endpoint reads the refresh token from Authorization: Bearer <refreshToken>
      const response = await axios.post(
        `${import.meta.env.VITE_API_BASE_URL}${REFRESH_ENDPOINT}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${refreshTokenValue}`,
          },
        },
      )

      const { accessToken: newAccessToken, refreshToken: newRefreshToken } = response.data?.data || response.data

      console.log(`[AXIOS] ✅ Token refresh SUCCESS — new accessToken: "${newAccessToken?.slice(0, 20)}..."`)

      // Persist new tokens
      setCookie('accessToken', newAccessToken, 15 * 60 * 1000) // 15 minutes
      if (newRefreshToken) {
        setCookie('refreshToken', newRefreshToken, SEVEN_DAYS_MS) // 7 days
        console.log(`[AXIOS] 💾 New refreshToken saved: "${newRefreshToken.slice(0, 20)}..."`)
      }

      // Update default headers for future requests
      apiClient.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`

      // Process queued requests with the new token
      processQueue(null, newAccessToken)

      // Retry the original failed request
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
      console.log(`[AXIOS] 🔁 Retrying original request: ${originalRequest?.url}`)

      return apiClient(originalRequest)
    } catch (refreshError) {
      console.error('[AXIOS] ❌ Token refresh FAILED — calling forceLogout()', refreshError?.response?.data || refreshError.message)
      processQueue(refreshError, null)
      forceLogout()

      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  },
)

export default apiClient
