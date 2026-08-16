/**
 * useTracking.js
 *
 * Central composable for the GPS Tracking module.
 *
 * Architecture:
 *   UI → useTracking (state + business logic) → tracking.service (transport)
 *
 * Three independent concerns, three independent lifecycles — deliberately NOT
 * sharing one `loading` / `error` pair:
 *
 *   latest  →  the current snapshot          (GET /tracking/latest)
 *   live    →  incremental updates on top    (SSE /tracking/live)
 *   trail   →  one rep's history for one day (GET /tracking/reps/{id}/trail)
 *
 * So a briefly reconnecting stream never blanks the map, and loading a trail
 * never disturbs live state. Trail points are kept completely separate from the
 * live marker state.
 *
 * ⚠️ GPS ingestion (`POST /tracking/gps`) is out of scope — there is no
 *    geolocation capture anywhere in this module.
 */

import {
  fetchLatestLocations,
  fetchRepresentativeTrail,
  connectLiveTracking,
} from '@/services/tracking.service'

// ─── Roles ────────────────────────────────────────────────────────────────────
// Role strings are lower-cased in userData by useAuth().persistAuthData.
// Frontend role checks are UX only — the backend stays authoritative.
export const TRACKING_MANAGER_ROLES = ['admin', 'sales_manager']

// ─── Activity window ──────────────────────────────────────────────────────────
/**
 * The backend marks a point `active` when it is within ~15 minutes of the
 * server's clock. That flag is a snapshot taken at response time: a page left
 * open for an hour would keep showing a stale "Active" chip.
 *
 * `isRecentlyActive()` re-applies the SAME documented 15-minute rule at display
 * time. The API payload is never mutated — the derived value is attached to a
 * new object (see `representatives`), and `active` from the server is preserved.
 */
export const ACTIVE_WINDOW_MS = 15 * 60 * 1000

export const isRecentlyActive = (recordedAt, nowMs = Date.now()) => {
  const time = Date.parse(recordedAt)

  if (Number.isNaN(time)) return false

  return nowMs - time <= ACTIVE_WINDOW_MS
}

// ─── Coordinate validation ────────────────────────────────────────────────────
/**
 * Defensive guard so one malformed point cannot break the whole map.
 * The bounds are INCLUSIVE: (-90, -180) is a legal coordinate and appears in
 * the current backend test data — it must not be rejected.
 */
export const isValidCoordinate = (latitude, longitude) =>
  Number.isFinite(latitude)
  && Number.isFinite(longitude)
  && latitude >= -90 && latitude <= 90
  && longitude >= -180 && longitude <= 180

// ─── Formatters ───────────────────────────────────────────────────────────────
/**
 * `recordedAt` is a UTC instant (e.g. "2026-08-16T13:59:47.450Z").
 * Rendered in the viewer's local timezone with the same Intl formatter the
 * Visits module uses — no timezone suffix is appended by hand.
 */
export const formatTrackingDateTime = value => {
  if (!value) return '—'

  const d = new Date(value)

  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(d)
}

/** Time-only variant, used for dense trail lists. */
export const formatTrackingTime = value => {
  if (!value) return '—'

  const d = new Date(value)

  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(d)
}

/** Compact "3 min ago" style label for the last-sync indicator. */
export const formatRelativeTime = (value, nowMs = Date.now()) => {
  const time = Date.parse(value)

  if (Number.isNaN(time)) return '—'

  const seconds = Math.max(0, Math.round((nowMs - time) / 1000))

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`

  return `${Math.floor(seconds / 86400)} d ago`
}

/**
 * Format a calendar date for the trail query.
 *
 * The endpoint expects a CALENDAR DATE (`YYYY-MM-DD`), not an instant, so this
 * uses the LOCAL date parts. `toISOString()` is deliberately avoided: for a user
 * east of UTC it would turn 2026-08-16 into 2026-08-15.
 *
 * @param {Date|string|null} value - `AppDateTimePicker` already emits `Y-m-d`
 *                                   strings; Date objects are handled too.
 */
export const toApiDate = value => {
  if (!value) return ''

  if (typeof value === 'string') {
    // Already `YYYY-MM-DD` (flatpickr `dateFormat: 'Y-m-d'`) — pass through.
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/)

    if (match) return match[1]

    const parsed = new Date(value)

    if (Number.isNaN(parsed.getTime())) return ''

    return toApiDate(parsed)
  }

  const d = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(d.getTime())) return ''

  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

/** Today's calendar date in the user's timezone — the default trail date. */
export const todayApiDate = () => toApiDate(new Date())

// ─── Composable ───────────────────────────────────────────────────────────────
export const useTracking = () => {
  // ── Latest snapshot state ─────────────────────────────────────────────────
  // Keyed by representativeId so an SSE update is an O(1) upsert and can never
  // produce a duplicate marker. Identity is the ID — never the name.
  const locationsById = ref(new Map())

  const isLatestLoading = ref(false)
  const latestError = ref('')
  const lastSyncedAt = ref(null)

  // ── Live stream state ─────────────────────────────────────────────────────
  // 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'unavailable' | 'disconnected'
  const liveStatus = ref('idle')
  const liveError = ref('')
  const liveErrorStatus = ref(null)

  // ── Trail state (independent of everything above) ─────────────────────────
  const selectedRepresentativeId = ref(null)
  const selectedDate = ref(todayApiDate())
  const trail = ref([])
  const isTrailLoading = ref(false)
  const trailError = ref('')
  const hasLoadedTrail = ref(false)

  // ── Display clock ─────────────────────────────────────────────────────────
  // Drives the derived activity chips and the relative "last sync" label so
  // they stay honest while the page is open. Ticks once a minute — cheap.
  const now = ref(Date.now())

  const { pause: pauseClock, resume: resumeClock } = useIntervalFn(
    () => { now.value = Date.now() },
    30_000,
    { immediate: false },
  )

  // ── Derived: representative markers ───────────────────────────────────────
  /**
   * UI-friendly view of the live snapshot. Each entry is a NEW object: the
   * server payload (including its `active` flag) is copied, never mutated.
   *  - `active`      : the backend value, untouched
   *  - `isLive`      : derived from recordedAt via the documented 15-min rule
   *  - `hasValidCoordinates`: false points are listed but never mapped
   */
  const representatives = computed(() =>
    [...locationsById.value.values()].map(location => ({
      ...location,
      isLive: isRecentlyActive(location.recordedAt, now.value),
      hasValidCoordinates: isValidCoordinate(location.latitude, location.longitude),
    })),
  )

  /** Only the points Leaflet may safely render. */
  const mappableRepresentatives = computed(() =>
    representatives.value.filter(r => r.hasValidCoordinates))

  const invalidCoordinateCount = computed(() =>
    representatives.value.length - mappableRepresentatives.value.length)

  const activeCount = computed(() =>
    representatives.value.filter(r => r.isLive).length)

  const isLatestEmpty = computed(() =>
    !isLatestLoading.value && !latestError.value && representatives.value.length === 0)

  const isLiveConnected = computed(() => liveStatus.value === 'connected')

  // ── Upsert with stale-event protection ────────────────────────────────────
  /**
   * Insert or update one representative position.
   *
   * A reconnect or a delayed message can deliver an OLDER point than the one
   * already on screen; that must never move the marker backwards. Equal
   * timestamps are accepted (a retransmit of the current point is harmless).
   *
   * @returns {boolean} whether state changed — used to skip needless redraws.
   */
  const upsertLocation = location => {
    const id = location?.representativeId

    if (id === null || id === undefined) return false

    const incomingTime = Date.parse(location.recordedAt)
    const existing = locationsById.value.get(id)

    if (existing) {
      const existingTime = Date.parse(existing.recordedAt)

      // Unparseable incoming timestamp → keep what we already trust.
      if (Number.isNaN(incomingTime)) return false

      if (!Number.isNaN(existingTime) && incomingTime < existingTime) return false
    }

    // Reassign the Map so the computed refs re-evaluate.
    const next = new Map(locationsById.value)

    next.set(id, {
      ...existing,
      ...location,
      representativeId: id,
    })
    locationsById.value = next

    return true
  }

  // ── fetchLatest() ─────────────────────────────────────────────────────────
  /**
   * Load the current snapshot. Called once on mount and once after every
   * successful reconnection (the stream does not replay what was missed).
   *
   * @param {boolean} [silent=false] - background refresh: keeps the existing
   *        markers and the loading flag untouched so the map never flashes.
   */
  const fetchLatest = async (silent = false) => {
    if (!silent) isLatestLoading.value = true
    latestError.value = ''

    try {
      const data = await fetchLatestLocations()
      const list = Array.isArray(data) ? data : []

      if (silent) {
        // Merge — a live event that arrived while the request was in flight
        // must not be rolled back by an older snapshot.
        list.forEach(upsertLocation)
      } else {
        const next = new Map()

        list.forEach(location => {
          if (location?.representativeId !== null && location?.representativeId !== undefined)
            next.set(location.representativeId, location)
        })
        locationsById.value = next
      }

      lastSyncedAt.value = new Date().toISOString()
      now.value = Date.now()
    } catch (error) {
      // 401 is handled globally by the Axios interceptor (refresh → forceLogout);
      // we only translate what the user should see.
      const status = error?.response?.status

      if (status === 403)
        latestError.value = 'You do not have permission to view representative locations.'
      else
        latestError.value = error?.response?.data?.message || 'Failed to load representative locations.'

      if (!silent) locationsById.value = new Map()
    } finally {
      if (!silent) isLatestLoading.value = false
    }
  }

  // ── Live stream lifecycle ─────────────────────────────────────────────────
  // A single handle guarantees a single connection: startLive() is a no-op
  // while one exists, and every retry happens inside the service's own loop.
  let liveConnection = null

  const startLive = () => {
    if (liveConnection) return

    liveError.value = ''
    liveErrorStatus.value = null
    liveStatus.value = 'connecting'

    liveConnection = connectLiveTracking({
      onLocation: location => {
        upsertLocation(location)
        lastSyncedAt.value = new Date().toISOString()
      },
      onStatus: status => {
        liveStatus.value = status
        if (status === 'connected') {
          liveError.value = ''
          liveErrorStatus.value = null
        }
      },
      onError: error => {
        // Inline indicator only — no toast per failed attempt. A flapping
        // stream would otherwise spam notifications every few seconds.
        liveError.value = error.message
        liveErrorStatus.value = error.status ?? null
      },
      onReconnected: () => {
        // Events emitted while we were offline are not replayed, so resync the
        // snapshot once — silently, to keep the map stable.
        fetchLatest(true)
      },
    })
  }

  const stopLive = () => {
    liveConnection?.close()
    liveConnection = null
    liveStatus.value = 'idle'
  }

  /** Manual retry after a terminal failure (e.g. 403). */
  const restartLive = () => {
    stopLive()
    startLive()
  }

  // ── Trail ─────────────────────────────────────────────────────────────────
  // Guards against a slow earlier response overwriting a newer one when the
  // user changes rep/date quickly — same pattern as useVisits.
  let latestTrailRequestId = 0

  const canFetchTrail = computed(() =>
    !!selectedRepresentativeId.value && !!toApiDate(selectedDate.value))

  /**
   * Load one representative's trail for one calendar day.
   * Refuses to build `/reps/null/trail?date=` — the UI validates first.
   */
  const fetchTrail = async () => {
    const repId = selectedRepresentativeId.value
    const date = toApiDate(selectedDate.value)

    if (!repId || !date) {
      trailError.value = 'Select a representative and a date first.'

      return
    }

    const requestId = ++latestTrailRequestId

    isTrailLoading.value = true
    trailError.value = ''

    try {
      const data = await fetchRepresentativeTrail(repId, date)

      if (requestId !== latestTrailRequestId) return

      // Backend order is preserved when it is already chronological; we only
      // sort when it is not, so a correctly ordered response is untouched.
      const points = (Array.isArray(data) ? data : []).filter(p =>
        isValidCoordinate(p?.latitude, p?.longitude))

      const isChronological = points.every((p, i) =>
        i === 0 || Date.parse(points[i - 1].recordedAt) <= Date.parse(p.recordedAt))

      trail.value = isChronological
        ? points
        : [...points].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt))

      hasLoadedTrail.value = true
    } catch (error) {
      if (requestId !== latestTrailRequestId) return

      const status = error?.response?.status

      if (status === 403)
        trailError.value = 'You do not have permission to view this representative\'s trail.'
      else
        trailError.value = error?.response?.data?.message || 'Failed to load the representative trail.'

      trail.value = []
      hasLoadedTrail.value = true
    } finally {
      if (requestId === latestTrailRequestId) isTrailLoading.value = false
    }
  }

  const clearTrail = () => {
    latestTrailRequestId += 1
    trail.value = []
    trailError.value = ''
    hasLoadedTrail.value = false
    isTrailLoading.value = false
  }

  // ── Trail metadata (computed from the response only) ──────────────────────
  const trailSummary = computed(() => {
    const points = trail.value

    if (!points.length) return null

    return {
      pointCount: points.length,
      firstRecordedAt: points[0].recordedAt,
      lastRecordedAt: points[points.length - 1].recordedAt,
    }
  })

  const isTrailEmpty = computed(() =>
    hasLoadedTrail.value && !isTrailLoading.value && !trailError.value && trail.value.length === 0)

  // ── Orchestration ─────────────────────────────────────────────────────────
  /**
   * Page entry point: snapshot FIRST, then the stream.
   * The stream may stay silent until somebody moves, so it can never be the
   * source of the initial state.
   */
  const initLiveTracking = async () => {
    resumeClock()
    await fetchLatest()
    startLive()
  }

  /** Tear everything down — no orphan stream survives navigation. */
  const teardown = () => {
    stopLive()
    pauseClock()
  }

  // Safety net: if the owning component is destroyed without calling teardown
  // (error boundary, hot reload), the stream is still closed.
  onScopeDispose(() => {
    liveConnection?.close()
    liveConnection = null
  })

  return {
    // Latest / live snapshot
    representatives,
    mappableRepresentatives,
    invalidCoordinateCount,
    activeCount,
    isLatestLoading,
    latestError,
    isLatestEmpty,
    lastSyncedAt,

    // Live stream
    liveStatus,
    liveError,
    liveErrorStatus,
    isLiveConnected,

    // Trail
    selectedRepresentativeId,
    selectedDate,
    trail,
    trailSummary,
    isTrailLoading,
    trailError,
    isTrailEmpty,
    canFetchTrail,

    // Display clock (for relative labels in the UI)
    now,

    // Operations
    initLiveTracking,
    fetchLatest,
    startLive,
    stopLive,
    restartLive,
    fetchTrail,
    clearTrail,
    teardown,
  }
}
