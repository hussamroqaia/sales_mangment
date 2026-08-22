/**
 * useDashboard.js
 *
 * Central composable for the dashboard: the KPI tiles AND the period-scoped
 * analytics that sit under them.
 *
 * Architecture:
 *   UI → useDashboard (state + role gating) → dashboard.service (pure Axios)
 *
 * The two halves are deliberately one composable rather than two. They answer
 * to the same roles, hit the same controller, and are read by the same page;
 * splitting them would mean maintaining the role gate below in two places and
 * keeping the two copies in step. Each half owns its own loading flags and
 * errors, so a caller that needs only one is unaffected by the other — the KPI
 * overview never triggers an analytics request, and vice versa.
 *
 * ─── Role gating is decided BEFORE the request, never from a 403 ─────────────
 * The backend splits the two dashboards by @PreAuthorize, so an unauthorised
 * call is answered 403 rather than with a trimmed payload. Discovering the role
 * by firing a request and reading the failure would put a guaranteed-forbidden
 * call in every warehouse manager's network log — and, with the shared refresh
 * interceptor, a 403 arriving without a live access token is treated as an
 * authentication failure. So the role is read from the session first and only
 * the permitted endpoint is ever requested.
 *
 *   ADMIN             → sales + inventory
 *   SALES_MANAGER     → sales only
 *   WAREHOUSE_MANAGER → inventory only
 *   SALES_REP         → neither (operational workflows live in the mobile app)
 */

import {
  fetchInventoryAnalytics,
  fetchInventoryDashboard,
  fetchSalesAnalytics,
  fetchSalesDashboard,
} from '@/services/dashboard.service'
import { resolveApiError } from '@/utils/apiErrors'
import { useAuth } from '@/composables/useAuth'
import { INTL_LOCALE } from '@/utils/locale'

const SALES_DASHBOARD_ROLES     = ['admin', 'sales_manager']
const INVENTORY_DASHBOARD_ROLES = ['admin', 'warehouse_manager']

// ─── Formatters ───────────────────────────────────────────────────────────────
// Neutral formatting: neither the backend DTOs nor any frontend config declare a
// currency, so amounts are rendered as plain grouped decimals rather than
// inventing a symbol. `BigDecimal` serialises to a JSON number.

/**
 * Money-like value. Returns '—' ONLY for null/undefined — 0 is real business
 * data (no sales today is a fact, not a missing value).
 *
 * Unlike `formatMoney` — which pins two decimals so invoice lines and unit
 * prices line up column against column — these tiles carry period totals. A
 * trailing `.00` on `16,805,000` only widens the figure and pushes the eye
 * past the digits that matter, so decimals appear only when the backend
 * actually sent a fractional amount.
 */
export const formatDashboardAmount = value => {
  if (value === null || value === undefined || value === '') return '—'

  const n = Number(value)

  return Number.isNaN(n)
    ? '—'
    : n.toLocaleString(INTL_LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

/**
 * A figure shortened for a chart axis: `263 ألف`, `1.8 مليون`.
 *
 * An axis tick has room for about six characters; `16,805,000` written out five
 * times over is a wall of digits that hides the shape of the line it is meant
 * to scale. `Intl`'s compact notation rather than a hand-rolled divide-by-1000
 * because the unit word is Arabic and its form depends on the magnitude —
 * something a `${n/1000} ألف` template gets wrong the moment the figure reaches
 * a million.
 *
 * Axis labels only. Tooltips and KPI tiles print the exact figure.
 */
export const formatDashboardCompact = value => {
  if (value === null || value === undefined) return '—'

  const n = Number(value)

  return Number.isNaN(n)
    ? '—'
    : n.toLocaleString(INTL_LOCALE, { notation: 'compact', maximumFractionDigits: 1 })
}

/** Integer count. 0 is valid data, so only null/undefined become '—'. */
export const formatDashboardCount = value => {
  if (value === null || value === undefined) return '—'

  const n = Number(value)

  return Number.isNaN(n) ? '—' : n.toLocaleString(INTL_LOCALE)
}

/**
 * Percentage for display. 0 % is valid data.
 *
 * At most one decimal, and none when the figure is whole: a fill rate of
 * exactly 100 reads as `100%`, not `100.0%`. The extra digit adds no
 * precision the backend actually claimed.
 */
export const formatDashboardPercent = value => {
  if (value === null || value === undefined) return '—'

  const n = Number(value)

  return Number.isNaN(n)
    ? '—'
    : `${n.toLocaleString(INTL_LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`
}

/**
 * The size of a change, without its sign: `12.5%` for both +12.5 and -12.5.
 *
 * Direction is carried by the arrow and the semantic colour beside it, so a
 * leading `-` would state it twice — and a bare sign is exactly the character
 * an RTL paragraph reorders to the wrong end of the number. Callers still
 * isolate the figure with `dir="ltr"`.
 */
export const formatDashboardChangeMagnitude = value => {
  if (value === null || value === undefined) return '—'

  const n = Number(value)

  return Number.isNaN(n) ? '—' : `${Math.abs(n).toFixed(1)}%`
}

/**
 * A percentage reduced to something a 0–100 gauge can draw, or null when there
 * is nothing to draw at all.
 *
 * null stays distinct from 0: an empty ring reads as "nothing was fulfilled
 * this month", a far stronger claim than "the backend sent no figure". Values
 * outside the range are clamped for the arc only — the figure printed in the
 * middle of the ring is still whatever the API returned.
 */
export const clampDashboardPercent = value => {
  if (value === null || value === undefined) return null

  const n = Number(value)
  if (Number.isNaN(n)) return null

  return Math.min(100, Math.max(0, n))
}

/**
 * Direction of a change percentage, for the colour/icon state of a tile.
 * A missing figure is 'neutral', not 'down' — no data is not a decline.
 *
 * @returns {'up' | 'down' | 'neutral'}
 */
export const dashboardDeltaState = value => {
  const n = Number(value)

  if (value === null || value === undefined || Number.isNaN(n)) return 'neutral'

  if (n > 0) return 'up'

  return n < 0 ? 'down' : 'neutral'
}

/**
 * A nullable name coming back from the backend (`topTerritoryName`,
 * `topRepName`): null when the period produced no sales to rank at all.
 * An empty string counts as absent too.
 */
export const formatDashboardName = value => {
  if (value === null || value === undefined) return '—'

  const text = String(value).trim()

  return text || '—'
}


// ─── Analytics: filter vocabulary ─────────────────────────────────────────────
// Mirrors exactly what the backend accepts. Both endpoints answer 400 for a
// granularity outside this set and for a `top` outside 1..20, so the UI offers
// nothing else and no request can be built from an invalid value.

/** STATIC_UI_CONFIGURATION: Arabic label → the literal the API expects. */
export const ANALYTICS_GRANULARITIES = [
  { title: 'يومي',   value: 'DAY' },
  { title: 'أسبوعي', value: 'WEEK' },
  { title: 'شهري',   value: 'MONTH' },
]

/** `top` options. The backend's hard ceiling is 20; its default is 5. */
export const ANALYTICS_TOP_OPTIONS = [5, 10, 15, 20]

const GRANULARITY_VALUES = ANALYTICS_GRANULARITIES.map(g => g.value)

// ─── Analytics: plain-date arithmetic ─────────────────────────────────────────
/**
 * `YYYY-MM-DD` in, `YYYY-MM-DD` out — no local timezone anywhere in between.
 *
 * The API's `from`/`to` are Java `LocalDate`s: calendar days with no instant
 * behind them. Routing them through `new Date('2026-08-01')` (parsed as UTC
 * midnight) and back through `toISOString()` after any local-time handling is
 * how a picker in UTC+3 turns the 1st into the 31st. Every date this composable
 * sends is built by `Date.UTC` and read back with `getUTC*`, so the arithmetic
 * happens on a fixed axis and the string that leaves is the day the user saw.
 *
 * @returns {string|null} null when the input is not a plain ISO date
 */
export const shiftPlainDate = (isoDate, days) => {
  if (typeof isoDate !== 'string') return null

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim())
  if (!match) return null

  const [, y, m, d] = match
  const shifted = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) + days))

  return shifted.toISOString().slice(0, 10)
}

/** Today as `YYYY-MM-DD` in the user's own calendar, not UTC's. */
export const todayPlainDate = () => {
  const now = new Date()

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
}

/** A plain ISO date as a Date pinned to UTC noon — safe to hand to Intl. */
const plainDateToUtc = isoDate => {
  if (typeof isoDate !== 'string') return null

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim())
  if (!match) return null

  const [, y, m, d] = match

  // Noon, not midnight: Intl formats in the browser's zone, and a UTC midnight
  // renders as the previous day for anyone west of Greenwich.
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12))
}

const intlDate = options => new Intl.DateTimeFormat(INTL_LOCALE, { timeZone: 'UTC', ...options })

// ─── Analytics: period labels ─────────────────────────────────────────────────
/**
 * The short label under a chart's x-axis. Concise by granularity, because an
 * axis with thirty ticks has room for `22 آب` and not for a full date.
 *
 * A WEEK bucket is labelled by the day it starts on — the backend returns the
 * bucket's `periodStart`, and naming a week by its Monday is the only claim the
 * payload actually supports.
 */
export const formatAnalyticsPeriod = (isoDate, granularity = 'DAY') => {
  const date = plainDateToUtc(isoDate)
  if (!date) return isoDate ?? '—'

  if (granularity === 'MONTH') return intlDate({ month: 'long', year: 'numeric' }).format(date)

  return intlDate({ day: 'numeric', month: 'short' }).format(date)
}

/**
 * The long label inside a tooltip, where there is room to be unambiguous —
 * including the year, which the axis label drops.
 */
export const formatAnalyticsPeriodLong = (isoDate, granularity = 'DAY') => {
  const date = plainDateToUtc(isoDate)
  if (!date) return isoDate ?? '—'

  if (granularity === 'MONTH') return intlDate({ month: 'long', year: 'numeric' }).format(date)

  const day = intlDate({ day: 'numeric', month: 'long', year: 'numeric' }).format(date)

  return granularity === 'WEEK' ? `أسبوع ${day}` : day
}

/** `من 1 آب 2026 إلى 31 آب 2026` — both ends inclusive, as the user chose them. */
export const formatAnalyticsRange = (from, toInclusive) => {
  const start = plainDateToUtc(from)
  const end = plainDateToUtc(toInclusive)
  if (!start || !end) return ''

  const fmt = intlDate({ day: 'numeric', month: 'long', year: 'numeric' })

  return `من ${fmt.format(start)} إلى ${fmt.format(end)}`
}

// ─── Composable ───────────────────────────────────────────────────────────────
export const useDashboard = () => {
  const { userData } = useAuth()

  const role = computed(() => userData.value?.role?.toLowerCase() ?? null)

  const canViewSalesDashboard = computed(() =>
    SALES_DASHBOARD_ROLES.includes(role.value))

  const canViewInventoryDashboard = computed(() =>
    INVENTORY_DASHBOARD_ROLES.includes(role.value))

  /** True when this role has no dashboard KPIs at all (e.g. SALES_REP). */
  const hasAnyDashboard = computed(() =>
    canViewSalesDashboard.value || canViewInventoryDashboard.value)

  // ── Sales state ─────────────────────────────────────────────────────────────
  const salesDashboard  = ref(null)
  const isSalesLoading  = ref(false)
  const salesError      = ref('')

  // ── Inventory state ─────────────────────────────────────────────────────────
  const inventoryDashboard = ref(null)
  const isInventoryLoading = ref(false)
  const inventoryError     = ref('')

  const isLoading = computed(() => isSalesLoading.value || isInventoryLoading.value)

  // ── Loaders ─────────────────────────────────────────────────────────────────
  // Each guards on the role itself, so calling them directly can never produce
  // a request the session is not entitled to make.

  const loadSalesDashboard = async () => {
    if (!canViewSalesDashboard.value) return

    isSalesLoading.value = true
    salesError.value     = ''

    try {
      salesDashboard.value = await fetchSalesDashboard()
    } catch (error) {
      // Deliberately no fallback numbers — a failed request must not be
      // dressed up as business data.
      salesDashboard.value = null
      salesError.value = resolveApiError(error, 'تعذّر تحميل لوحة مؤشرات المبيعات.')
    } finally {
      isSalesLoading.value = false
    }
  }

  const loadInventoryDashboard = async () => {
    if (!canViewInventoryDashboard.value) return

    isInventoryLoading.value = true
    inventoryError.value     = ''

    try {
      inventoryDashboard.value = await fetchInventoryDashboard()
    } catch (error) {
      inventoryDashboard.value = null
      inventoryError.value = resolveApiError(error, 'تعذّر تحميل لوحة مؤشرات المخزون.')
    } finally {
      isInventoryLoading.value = false
    }
  }

  /**
   * Load every dashboard this role may see. A plain on-demand snapshot load —
   * these endpoints are ordinary REST reads, so there is no polling or stream.
   */
  const loadDashboards = async () => {
    await Promise.all([loadSalesDashboard(), loadInventoryDashboard()])
  }


  // ── Analytics: filters ──────────────────────────────────────────────────────
  // `analyticsTo` is INCLUSIVE — it is what the date picker shows the user, and
  // "إلى 31 آب" has to mean the 31st is in the figures. The API's window is
  // half-open `[from, to)`, so the value sent is this date plus one day. That
  // conversion happens once, in `analyticsRequestParams`, and nowhere else.
  const analyticsFrom        = ref(null)
  const analyticsTo          = ref(null)
  const analyticsGranularity = ref('DAY')
  const analyticsTop         = ref(5)

  /**
   * Whether the filter controls describe a window the backend has confirmed.
   *
   * Until the first response arrives the pickers are empty ON PURPOSE: the
   * endpoints already default to the last 30 days by day, and inventing a
   * frontend default would mean two sources of truth that drift apart the day
   * the backend's changes. The first request therefore sends no window at all,
   * and the controls are filled in from the `from`/`to`/`granularity` that the
   * response echoes back.
   */
  const hasResolvedAnalyticsWindow = ref(false)

  const analyticsRangeError = computed(() => {
    if (!analyticsFrom.value || !analyticsTo.value) return ''

    return analyticsFrom.value > analyticsTo.value
      ? 'يجب ألّا يكون تاريخ البداية بعد تاريخ النهاية.'
      : ''
  })

  /** Only a granularity the API accepts ever reaches a request. */
  const analyticsGranularityValue = computed(() =>
    (GRANULARITY_VALUES.includes(analyticsGranularity.value) ? analyticsGranularity.value : 'DAY'))

  /** Only a `top` inside the API's 1..20 range ever reaches a request. */
  const analyticsTopValue = computed(() => {
    const n = Number(analyticsTop.value)

    if (!Number.isFinite(n)) return null

    return Math.min(20, Math.max(1, Math.trunc(n)))
  })

  /**
   * The query both analytics endpoints receive.
   *
   * Empty before the first response, which is what hands the choice of window
   * to the backend. Afterwards it always carries all four values — the user is
   * looking at controls that state them, so leaving one out would show a filter
   * the data does not obey.
   */
  const analyticsRequestParams = computed(() => {
    if (!hasResolvedAnalyticsWindow.value) return {}

    return {
      from: analyticsFrom.value || undefined,

      // Inclusive → exclusive. Pure string arithmetic on a fixed axis; see
      // shiftPlainDate for why a Date round-trip is not safe here.
      to: analyticsTo.value ? shiftPlainDate(analyticsTo.value, 1) : undefined,
      granularity: analyticsGranularityValue.value,
      top: analyticsTopValue.value ?? undefined,
    }
  })

  // ── Analytics: state ────────────────────────────────────────────────────────
  const salesAnalytics          = ref(null)
  const isSalesAnalyticsLoading = ref(false)
  const salesAnalyticsError     = ref('')

  const inventoryAnalytics          = ref(null)
  const isInventoryAnalyticsLoading = ref(false)
  const inventoryAnalyticsError     = ref('')

  const isAnalyticsLoading = computed(() =>
    isSalesAnalyticsLoading.value || isInventoryAnalyticsLoading.value)

  /**
   * The query the data on screen was actually fetched with, serialised.
   *
   * "Stale" is a comparison, not an event. A `watch` on the four controls looked
   * simpler and was wrong: hydrating them from the first response mutates all
   * three at once, the watcher runs on the next flush — after the load has
   * already finished — and the page opens claiming its own fresh data is out of
   * date. Comparing the controls to what was fetched cannot get that wrong,
   * because re-selecting the value that is already applied is genuinely not a
   * change.
   */
  const appliedAnalyticsQuery = ref(null)

  const isAnalyticsStale = computed(() =>
    appliedAnalyticsQuery.value !== null
    && appliedAnalyticsQuery.value !== JSON.stringify(analyticsRequestParams.value))

  /**
   * The window the numbers on screen actually describe, taken from the response
   * rather than from the controls: after a filter edit the two disagree, and a
   * caption under a chart must describe the data, not the pending request. `to`
   * is converted back to the inclusive day for display.
   */
  const analyticsAppliedRange = computed(() => {
    const source = salesAnalytics.value ?? inventoryAnalytics.value
    if (!source?.from || !source?.to) return ''

    return formatAnalyticsRange(source.from, shiftPlainDate(source.to, -1))
  })

  /** Granularity of the data on screen — again the response's, not the control's. */
  const appliedAnalyticsGranularity = computed(() =>
    salesAnalytics.value?.granularity ?? inventoryAnalytics.value?.granularity ?? 'DAY')

  // ── Analytics: loading ──────────────────────────────────────────────────────
  // A run id plus an AbortController: rapid filter changes must not leave the
  // slower of two responses painting the screen. The in-flight pair is aborted
  // outright rather than merely ignored, so a superseded request stops costing
  // the backend anything.
  let analyticsRunId = 0
  let analyticsInFlight = null

  const abortAnalytics = () => {
    analyticsInFlight?.abort()
    analyticsInFlight = null
  }

  /** True for the "we cancelled this ourselves" rejections, which are not errors. */
  const isAbortError = error =>
    error?.name === 'CanceledError' || error?.name === 'AbortError' || error?.code === 'ERR_CANCELED'

  /**
   * Fill the filter controls from the window the backend applied.
   *
   * Runs once, off the first response. Re-running it on every load would fight
   * the user: they would change a filter and have the response write the
   * control back — harmless until the day the backend clamps a window, at which
   * point the control would silently disagree with what they asked for.
   */
  const hydrateAnalyticsWindow = data => {
    if (hasResolvedAnalyticsWindow.value || !data) return

    if (data.from) analyticsFrom.value = data.from

    // Response `to` is exclusive; the picker is inclusive.
    if (data.to) analyticsTo.value = shiftPlainDate(data.to, -1) ?? data.to
    if (GRANULARITY_VALUES.includes(data.granularity)) analyticsGranularity.value = data.granularity

    hasResolvedAnalyticsWindow.value = true
  }

  /**
   * Load every analytics section this role may see, in parallel.
   *
   * `Promise.allSettled`, not `Promise.all`: the two endpoints are authorised
   * separately and fail separately, and an inventory 500 must not take a
   * perfectly good sales section off the screen with it. Each branch owns its
   * loading flag and its error, so the page renders whatever arrived.
   *
   * Role gating happens here rather than through a caught 403 — same reasoning
   * as the KPI loaders above: the request is never made in the first place.
   */
  const loadAnalytics = async () => {
    if (!hasAnyDashboard.value) return
    if (analyticsRangeError.value) return

    abortAnalytics()

    const controller = new AbortController()

    analyticsInFlight = controller

    const runId = ++analyticsRunId
    const params = analyticsRequestParams.value
    const wantsSales = canViewSalesDashboard.value
    const wantsInventory = canViewInventoryDashboard.value

    if (wantsSales) {
      isSalesAnalyticsLoading.value = true
      salesAnalyticsError.value = ''
    }
    if (wantsInventory) {
      isInventoryAnalyticsLoading.value = true
      inventoryAnalyticsError.value = ''
    }

    const [salesResult, inventoryResult] = await Promise.allSettled([
      wantsSales ? fetchSalesAnalytics(params, controller.signal) : Promise.resolve(null),
      wantsInventory ? fetchInventoryAnalytics(params, controller.signal) : Promise.resolve(null),
    ])

    // A superseded run touches nothing: the run that replaced it already owns
    // the flags, and writing them here would clear a spinner still spinning.
    if (runId !== analyticsRunId) return

    if (wantsSales) {
      if (salesResult.status === 'fulfilled') {
        salesAnalytics.value = salesResult.value
        hydrateAnalyticsWindow(salesResult.value)
      } else if (!isAbortError(salesResult.reason)) {
        // No fallback series — a failed request must not be dressed up as data.
        salesAnalytics.value = null
        salesAnalyticsError.value = resolveApiError(salesResult.reason, 'تعذّر تحميل تحليلات المبيعات.')
      }
      isSalesAnalyticsLoading.value = false
    }

    if (wantsInventory) {
      if (inventoryResult.status === 'fulfilled') {
        inventoryAnalytics.value = inventoryResult.value
        hydrateAnalyticsWindow(inventoryResult.value)
      } else if (!isAbortError(inventoryResult.reason)) {
        inventoryAnalytics.value = null
        inventoryAnalyticsError.value = resolveApiError(inventoryResult.reason, 'تعذّر تحميل تحليلات المخزون.')
      }
      isInventoryAnalyticsLoading.value = false
    }

    // Read AFTER hydration, so the first run — which deliberately sent no
    // window at all — records the window the backend chose and now shown in the
    // controls, rather than the empty query it was issued with.
    appliedAnalyticsQuery.value = JSON.stringify(analyticsRequestParams.value)

    analyticsInFlight = null
  }

  /**
   * Apply the filters on screen. A no-op while a load is already running, so a
   * double click cannot open a second pair of requests.
   */
  const applyAnalyticsFilters = async () => {
    if (isAnalyticsLoading.value || analyticsRangeError.value) return

    await loadAnalytics()
  }

  /** Re-fetch with the filters untouched — the header's refresh control. */
  const refreshAnalytics = applyAnalyticsFilters

  // Note there is no watcher firing requests off the filters. Four controls
  // feeding two endpoints would mean eight requests for one change of mind, and
  // the reports module already establishes Apply as this project's answer to
  // that; `isAnalyticsStale` above is what keeps the deferral visible.

  // A pair still in flight when the page unmounts is cancelled, not left
  // dangling on a component that no longer exists.
  onScopeDispose(abortAnalytics)

  return {
    // Role gating
    role,
    canViewSalesDashboard,
    canViewInventoryDashboard,
    hasAnyDashboard,

    // Sales
    salesDashboard,
    isSalesLoading,
    salesError,
    loadSalesDashboard,

    // Inventory
    inventoryDashboard,
    isInventoryLoading,
    inventoryError,
    loadInventoryDashboard,

    // Combined
    isLoading,
    loadDashboards,

    // ── Analytics ─────────────────────────────────────────────────────────────
    // Filters
    analyticsFrom,
    analyticsTo,
    analyticsGranularity,
    analyticsTop,
    analyticsRangeError,
    hasResolvedAnalyticsWindow,

    // Data
    salesAnalytics,
    isSalesAnalyticsLoading,
    salesAnalyticsError,
    inventoryAnalytics,
    isInventoryAnalyticsLoading,
    inventoryAnalyticsError,

    // Derived
    isAnalyticsLoading,
    isAnalyticsStale,
    analyticsAppliedRange,
    appliedAnalyticsGranularity,

    // Actions
    loadAnalytics,
    applyAnalyticsFilters,
    refreshAnalytics,
  }
}
