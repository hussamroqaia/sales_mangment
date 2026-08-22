/**
 * dashboard.service.js
 *
 * Pure service layer — only Axios calls, no state, no composables.
 * The Axios instance (src/services/apiClient.js) auto-attaches the Bearer token.
 *
 * Backend contract (DashboardController — @RequestMapping("/api/reports/dashboard")):
 *   GET /reports/dashboard/sales                → SalesDashboard       ADMIN, SALES_MANAGER
 *   GET /reports/dashboard/sales/analytics      → SalesAnalytics       ADMIN, SALES_MANAGER
 *   GET /reports/dashboard/inventory            → InventoryDashboard   ADMIN, WAREHOUSE_MANAGER
 *   GET /reports/dashboard/inventory/analytics  → InventoryAnalytics   ADMIN, WAREHOUSE_MANAGER
 *
 * The `/analytics` pair is the period-scoped companion of the two KPI
 * endpoints: same authorization, same module, but filtered by a date window and
 * returning series and rankings rather than single figures. They live here
 * rather than in report.service.js because they share this file's controller
 * and its role split, and because they have no export path.
 *
 * The split is deliberate on the backend: authorization lives entirely on
 * @PreAuthorize, so a warehouse manager calling the sales endpoint gets a 403
 * rather than a trimmed payload. Callers must therefore branch on the user's
 * role BEFORE requesting — see useDashboard.
 *
 * Scope: dashboard KPIs only. The rest of /api/reports/** (sales, customers,
 * routes, inventory reports) is a separate module and is deliberately absent.
 */

import apiClient from '@/services/apiClient'

const BASE = '/reports/dashboard'

// ─── GET /reports/dashboard/sales ─────────────────────────────────────────────
/**
 * Sales KPI tiles. Requires ADMIN or SALES_MANAGER.
 *
 * `topTerritoryName` / `topRepName` are nullable — the backend has nothing to
 * name when the period produced no sales at all.
 *
 * @returns {Promise<{
 *   todaySalesTotal: number,
 *   todayInvoiceCount: number,
 *   monthSalesTotal: number,
 *   monthInvoiceCount: number,
 *   activeRoutesToday: number,
 *   topTerritoryName: string | null,
 *   topTerritorySales: number,
 *   topRepName: string | null,
 *   topRepSales: number,
 *   monthOverMonthPercent: number,
 * }>}
 */
export const fetchSalesDashboard = async () => {
  const response = await apiClient.get(`${BASE}/sales`)

  return response.data?.data ?? response.data
}

// ─── GET /reports/dashboard/inventory ─────────────────────────────────────────
/**
 * Inventory KPI tiles. Requires ADMIN or WAREHOUSE_MANAGER.
 *
 * @returns {Promise<{
 *   belowMinimumCount: number,
 *   agingCount: number,
 *   totalSkus: number,
 *   monthFillRatePercent: number,
 *   totalStockValue: number,
 * }>}
 */
export const fetchInventoryDashboard = async () => {
  const response = await apiClient.get(`${BASE}/inventory`)

  return response.data?.data ?? response.data
}

// ─── Analytics ────────────────────────────────────────────────────────────────
/**
 * Query for the two analytics endpoints, carrying ONLY the params that have a
 * value.
 *
 * Both endpoints declare every param optional and apply their own defaults when
 * one is absent (last 30 days, DAY, top 5 — verified against the live service).
 * Sending `from=undefined` would defeat that: Axios drops `undefined` but not
 * an empty string, and an empty `from` is a 400 rather than a default. Building
 * the object by presence keeps "no filter chosen yet" meaning "let the backend
 * decide", which is what the first page load relies on.
 *
 * Values are passed through untouched — `from`/`to` are plain `YYYY-MM-DD`
 * strings all the way from the picker, never Date objects, so no timezone
 * conversion can shift a day. Range semantics are half-open `[from, to)`;
 * converting the user's inclusive end date is the composable's job, not this
 * layer's.
 */
const buildAnalyticsParams = ({ from, to, granularity, top } = {}) => {
  const params = {}

  if (from) params.from = from
  if (to) params.to = to
  if (granularity) params.granularity = granularity
  if (top !== null && top !== undefined && top !== '') params.top = top

  return params
}

// ─── GET /reports/dashboard/sales/analytics ───────────────────────────────────
/**
 * Sales analytics for a period. Requires ADMIN or SALES_MANAGER.
 *
 * Backend constraints, confirmed against the running service:
 *   granularity ∈ DAY | WEEK | MONTH   — anything else is a 400
 *   top         ∈ 1..20                — outside the range is a 400
 *   from        must be strictly before `to`, which is EXCLUSIVE
 *
 * The response echoes the `from`/`to`/`granularity` it actually applied, so the
 * caller can align its filter controls with the window the data describes.
 *
 * @param {{ from?: string, to?: string, granularity?: string, top?: number }} params
 * @param {AbortSignal} [signal] cancels a superseded request
 */
export const fetchSalesAnalytics = async (params = {}, signal) => {
  const response = await apiClient.get(`${BASE}/sales/analytics`, {
    params: buildAnalyticsParams(params),
    signal,
  })

  return response.data?.data ?? response.data
}

// ─── GET /reports/dashboard/inventory/analytics ───────────────────────────────
/**
 * Inventory analytics for a period. Requires ADMIN or WAREHOUSE_MANAGER.
 *
 * Same parameter contract as the sales endpoint.
 *
 * ⚠️ `fillRateTrend[].fillRatePercent` is nullable and the null carries meaning:
 * null = nothing was requested in that period, 0 = something was requested and
 * none of it was fulfilled. Consumers must not coalesce it to 0.
 *
 * @param {{ from?: string, to?: string, granularity?: string, top?: number }} params
 * @param {AbortSignal} [signal] cancels a superseded request
 */
export const fetchInventoryAnalytics = async (params = {}, signal) => {
  const response = await apiClient.get(`${BASE}/inventory/analytics`, {
    params: buildAnalyticsParams(params),
    signal,
  })

  return response.data?.data ?? response.data
}
