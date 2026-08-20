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
import { INTL_LOCALE, formatMoney } from '@/utils/locale'

const SALES_DASHBOARD_ROLES     = ['admin', 'sales_manager']
const INVENTORY_DASHBOARD_ROLES = ['admin', 'warehouse_manager']

// ─── Formatters ───────────────────────────────────────────────────────────────
// Neutral formatting: neither the backend DTOs nor any frontend config declare a
// currency, so amounts are rendered as plain grouped decimals rather than
// inventing a symbol. `BigDecimal` serialises to a JSON number.

/**
 * Money-like value. Returns '—' ONLY for null/undefined — 0 is real business
 * data (no sales today is a fact, not a missing value).
 */
export const formatDashboardAmount = formatMoney

/** Integer count. 0 is valid data, so only null/undefined become '—'. */
export const formatDashboardCount = value => {
  if (value === null || value === undefined) return '—'

  const n = Number(value)

  return Number.isNaN(n) ? '—' : n.toLocaleString(INTL_LOCALE)
}

/** Percentage, one decimal. 0 % is valid data. */
export const formatDashboardPercent = value => {
  if (value === null || value === undefined) return '—'

  const n = Number(value)

  return Number.isNaN(n) ? '—' : `${n.toFixed(1)}%`
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
