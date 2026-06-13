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
    const status = error.response?.status

    // Handle both 401 (Unauthorized) and 403 (Forbidden / token expired)
    // Only retry once (guard against infinite loops)
    if ((status !== 401 && status !== 403) || originalRequest._retry) {
      return Promise.reject(error)
    }

    // Don't try to refresh if the failing request IS the refresh endpoint
    if (originalRequest.url?.includes(REFRESH_ENDPOINT)) {
      forceLogout()

      return Promise.reject(error)
    }

    // If a refresh is already in-flight, queue this request
    if (isRefreshing) {
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
      isRefreshing = false
      forceLogout()

      return Promise.reject(error)
    }

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

      // Persist new tokens
      setCookie('accessToken', newAccessToken, 15 * 60 * 1000) // 15 minutes
      if (newRefreshToken) {
        setCookie('refreshToken', newRefreshToken, SEVEN_DAYS_MS) // 7 days
      }

      // Update default headers for future requests
      apiClient.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`

      // Process queued requests with the new token
      processQueue(null, newAccessToken)

      // Retry the original failed request
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`

      return apiClient(originalRequest)
    } catch (refreshError) {
      processQueue(refreshError, null)
      forceLogout()

      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  },
)

export default apiClient
