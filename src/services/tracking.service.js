/**
 * tracking.service.js
 *
 * Pure service layer for the GPS Tracking module — no state, no composables.
 *
 * Architecture:  UI → useTracking (state) → tracking.service (transport)
 *
 * Two transports live here, deliberately:
 *
 *  1. REST  (`GET /tracking/latest`, `GET /tracking/reps/{repId}/trail`)
 *     use the shared Axios instance (src/services/apiClient.js) exactly like
 *     every other service — Bearer token, base URL and 401-refresh come for free.
 *
 *  2. SSE   (`GET /tracking/live`)
 *     CANNOT go through Axios: the browser XHR/fetch adapter buffers the body,
 *     so a never-ending `text/event-stream` response would never surface events.
 *     Native `EventSource` is equally unusable here because this backend
 *     authenticates with `Authorization: Bearer <jwt>` (see apiClient.js) and
 *     EventSource cannot send custom headers. Putting the JWT in the query
 *     string is NOT done — it leaks the token into logs/history and nothing in
 *     this repo or the API contract proves the backend accepts it.
 *     So the SSE transport uses a streaming `fetch()` + `ReadableStream` reader,
 *     reusing apiClient's base URL and token accessor. This exception is
 *     contained in `connectLiveTracking()` and nowhere else.
 *
 * ⚠️ `POST /tracking/gps` (GPS ingestion) is intentionally NOT implemented —
 *    it is out of scope for the web dashboard and belongs to the mobile client.
 */

import apiClient, {
  getAccessToken,
  getApiBaseUrl,
  hasUsableAccessToken,
  refreshAccessToken,
} from '@/services/apiClient'

const BASE = '/tracking'

// At most one silent refresh per stream per minute. See the 401/403 branch in
// `run()` for why a plain once-per-connection budget is not enough.
const AUTH_REFRESH_COOLDOWN_MS = 60 * 1000

const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please log in again.'

// ─── GET /tracking/latest ────────────────────────────────────────────────────
/**
 * Latest known position of every representative.
 *
 * Allowed roles: ADMIN, SALES_MANAGER (the backend is authoritative).
 *
 * @returns {Promise<Array<{
 *   representativeId: number,
 *   representativeName: string,
 *   latitude: number,
 *   longitude: number,
 *   recordedAt: string,   // ISO-8601 UTC instant
 *   active: boolean       // backend flag: point is < ~15 min old
 * }>>} Empty array is a valid, non-error response.
 */
export const fetchLatestLocations = async () => {
  try {
    const response = await apiClient.get(`${BASE}/latest`)

    return response.data?.data ?? response.data ?? []
  } catch (error) {
    throw error
  }
}

// ─── GET /tracking/reps/{repId}/trail ────────────────────────────────────────
/**
 * Historical GPS trail of one representative for one calendar day.
 *
 * Allowed roles: ADMIN, SALES_MANAGER, and the SALES_REP themselves.
 *
 * @param {number|string} repId
 * @param {string} date - Calendar date, `YYYY-MM-DD`. Must NOT be a full
 *                        timestamp: the backend treats it as a local calendar
 *                        day, not an instant.
 * @returns {Promise<Array<{ latitude: number, longitude: number, recordedAt: string }>>}
 */
export const fetchRepresentativeTrail = async (repId, date) => {
  try {
    const response = await apiClient.get(`${BASE}/reps/${repId}/trail`, {
      params: { date },
    })

    return response.data?.data ?? response.data ?? []
  } catch (error) {
    throw error
  }
}

// ─── SSE: GET /tracking/live ─────────────────────────────────────────────────

/** Progressive backoff between reconnection attempts (ms), capped at 30 s. */
const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 30000]

/** Frames are separated by a blank line — CRLF and LF are both legal SSE. */
const FRAME_SEPARATOR = /\r\n\r\n|\n\n|\r\r/

/**
 * Parse one raw SSE frame into `{ event, data }`.
 *
 * Handles the parts of the spec this endpoint actually uses:
 *   - `event:` / `data:` fields (multi-line `data:` is concatenated with \n)
 *   - comment lines starting with `:` (the `:ping` heartbeat) → ignored
 *   - unknown fields (`id:`, `retry:`) → ignored
 *
 * @returns {{ event: string, data: string } | null} null for a
 *          heartbeat/comment-only frame that carries no payload.
 */
const parseFrame = raw => {
  const dataLines = []
  let event = 'message'

  for (const line of raw.split(/\r\n|\n|\r/)) {
    // Comment / heartbeat — `:ping`. Keeps the socket warm, carries no data.
    if (line.startsWith(':')) continue

    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)

    // Per spec a single leading space after the colon is stripped.
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)

    if (field === 'event') event = value
    else if (field === 'data') dataLines.push(value)
  }

  if (!dataLines.length) return null

  return { event, data: dataLines.join('\n') }
}

/**
 * Open an authenticated live-tracking stream.
 *
 * Owns the whole transport lifecycle: connection, SSE framing, heartbeat
 * filtering, error classification, progressive-backoff reconnection and abort.
 * The caller only reacts to callbacks — no stream parsing leaks into the UI.
 *
 * Reconnection policy:
 *   - network/5xx/stream-ended  → retry with backoff (1s, 2s, 5s, 10s, 30s…)
 *   - 401                       → retry: the Axios interceptor refreshes the
 *                                 access-token cookie on the next REST call
 *                                 (the composable refetches `/latest` on
 *                                 failure), so a later attempt picks up a fresh
 *                                 token. No refresh logic is duplicated here.
 *   - 403                       → STOP. A permission/backend-security problem
 *                                 will not fix itself; hammering it is noise.
 *                                 Surfaced so the UI can show a real blocker
 *                                 plus a manual retry.
 *
 * Only ONE in-flight request exists at any time: a retry is scheduled solely
 * after the previous attempt has terminated.
 *
 * @param {Object}   options
 * @param {(location: Object) => void} [options.onLocation] - one `location` event
 * @param {(status: string, detail?: Object) => void} [options.onStatus]
 *        'connecting' | 'connected' | 'reconnecting' | 'unavailable'
 * @param {(error: Object) => void} [options.onError] - `{ message, status, kind }`
 *        where kind is 'permission' | 'auth' | 'network' | 'protocol'
 * @param {() => void} [options.onReconnected] - fired when a retry attempt
 *        (not the first connection) succeeds — the caller should resync
 *        `/latest` because events emitted while offline are not replayed.
 * @returns {{ close: () => void }} Call `close()` on unmount/navigation.
 */
export const connectLiveTracking = ({
  onLocation,
  onStatus,
  onError,
  onReconnected,
} = {}) => {
  const controller = new AbortController()

  let attempt = 0
  let retryTimer = null
  let isClosed = false
  let hasConnectedOnce = false
  let lastAuthRefreshAt = 0

  const url = `${getApiBaseUrl()}${BASE}/live`

  const emitStatus = (status, detail) => onStatus?.(status, detail)

  /** Schedule the next attempt. Never called while a request is in flight. */
  const scheduleRetry = () => {
    if (isClosed) return

    const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)]

    attempt += 1
    emitStatus('reconnecting', { attempt, delay })

    retryTimer = setTimeout(() => {
      retryTimer = null
      // eslint-disable-next-line no-use-before-define
      run()
    }, delay)
  }

  /** Turn a decoded chunk buffer into complete frames; returns the remainder. */
  const drainBuffer = buffer => {
    let rest = buffer
    let match = rest.match(FRAME_SEPARATOR)

    while (match) {
      const raw = rest.slice(0, match.index)

      rest = rest.slice(match.index + match[0].length)

      const frame = parseFrame(raw)

      // Heartbeats (`:ping`) and field-only frames produce null — never an error.
      if (frame && frame.event === 'location') {
        try {
          onLocation?.(JSON.parse(frame.data))
        } catch {
          // A single malformed payload must not kill the stream or the page.
          console.warn('[tracking] Discarded a malformed live location event.')
        }
      }

      match = rest.match(FRAME_SEPARATOR)
    }

    return rest
  }

  const run = async () => {
    if (isClosed) return

    emitStatus(hasConnectedOnce ? 'reconnecting' : 'connecting')

    let response

    try {
      const token = getAccessToken()

      response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',

          // Never logged, never placed in the URL.
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },

        // Long-lived stream: no caching layer may buffer or replay it.
        cache: 'no-store',
        signal: controller.signal,
      })
    } catch (error) {
      if (isClosed || error?.name === 'AbortError') return

      onError?.({
        message: 'Live tracking connection failed (network).',
        status: null,
        kind: 'network',
      })
      scheduleRetry()

      return
    }

    // ── Validate before treating the body as a stream ────────────────────────
    if (!response.ok) {
      const status = response.status

      // The stream reads the same signal as the Axios interceptor: 401 is
      // always authentication, but 403 is only authentication when we hold no
      // live access token. The backend answers a missing Authorization header
      // with 403 (Spring Security's default entry point), which is exactly what
      // an idle tab sends once the 15-minute accessToken cookie lapses.
      const isAuthFailure = status === 401 || (status === 403 && !hasUsableAccessToken())

      if (status === 403 && !isAuthFailure) {
        // Terminal: authorisation, not connectivity. Refreshing cannot grant a
        // role, so this must never re-enter the refresh path.
        onError?.({
          message: 'The server rejected the live tracking stream (403 Forbidden).',
          status,
          kind: 'permission',
        })
        emitStatus('unavailable', { status })

        return
      }

      if (isAuthFailure) {
        // Reported as 401 whatever the wire status was, so the dashboard shows
        // "session expired" rather than its permission-denied banner.
        // Silent once closed: a refresh that fails after the page was torn down
        // must not push a status back into a composable that has already reset.
        const failAuth = () => {
          if (isClosed) return

          onError?.({ message: SESSION_EXPIRED_MESSAGE, status: 401, kind: 'auth' })
          emitStatus('unavailable', { status: 401 })
        }

        // A cooldown rather than a once-per-connection flag. Resetting the
        // budget on every successful handshake looks equivalent but is not: a
        // server that accepts the connection and drops the stream immediately
        // would hand back a fresh budget on each reconnect, and the 1s first
        // backoff would turn that into a refresh-per-second loop against
        // /auth/refresh. The cooldown bounds it no matter the reconnect shape,
        // while still allowing recovery when the token genuinely ages out.
        if (Date.now() - lastAuthRefreshAt < AUTH_REFRESH_COOLDOWN_MS) {
          failAuth()

          return
        }

        lastAuthRefreshAt = Date.now()

        try {
          // Shares apiClient's lock, so an Axios 401 racing this one produces a
          // single /auth/refresh round-trip, not two.
          await refreshAccessToken()
        } catch {
          // Refresh token expired or revoked — the session is unrecoverable.
          // apiClient has already started the logout redirect.
          failAuth()

          return
        }

        // close() may have run while the refresh was in flight: unmounting the
        // Tracking page during a refresh must not resurrect the stream.
        if (!isClosed) run()

        return
      }

      onError?.({
        message: `Live tracking stream returned HTTP ${status}.`,
        status,
        kind: 'network',
      })
      scheduleRetry()

      return
    }

    const contentType = response.headers.get('content-type') ?? ''

    if (!contentType.includes('text/event-stream') || !response.body) {
      // e.g. a JSON error envelope or an HTML proxy page served with 200.
      onError?.({
        message: `Expected an event stream but received "${contentType || 'no content-type'}".`,
        status: response.status,
        kind: 'protocol',
      })
      scheduleRetry()

      return
    }

    // ── Connected ────────────────────────────────────────────────────────────
    attempt = 0
    emitStatus('connected')

    if (hasConnectedOnce) onReconnected?.()
    hasConnectedOnce = true

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      // A chunk is NOT an event: frames split across chunks, and one chunk may
      // hold several frames. The buffer is only drained on complete frames.
      for (;;) {
        const { value, done } = await reader.read()

        if (done) break

        buffer += decoder.decode(value, { stream: true })
        buffer = drainBuffer(buffer)
      }
    } catch (error) {
      if (isClosed || error?.name === 'AbortError') return

      onError?.({
        message: 'Live tracking stream was interrupted.',
        status: null,
        kind: 'network',
      })
      scheduleRetry()

      return
    }

    // Server closed the stream cleanly — reconnect unless we are shutting down.
    if (isClosed) return

    scheduleRetry()
  }

  run()

  return {
    close: () => {
      if (isClosed) return
      isClosed = true

      if (retryTimer) {
        clearTimeout(retryTimer)
        retryTimer = null
      }

      controller.abort()
      emitStatus('disconnected')
    },
  }
}
