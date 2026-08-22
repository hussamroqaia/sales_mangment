/**
 * useDashboard.js
 *
 * Central composable for the dashboard KPI tiles.
 *
 * Architecture:
 *   UI → useDashboard (state + role gating) → dashboard.service (pure Axios)
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

import { fetchInventoryDashboard, fetchSalesDashboard } from '@/services/dashboard.service'
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
  }
}
