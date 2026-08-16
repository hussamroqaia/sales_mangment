/**
 * dashboard.service.js
 *
 * Pure service layer — only Axios calls, no state, no composables.
 * The Axios instance (src/services/apiClient.js) auto-attaches the Bearer token.
 *
 * Backend contract (DashboardController — @RequestMapping("/api/reports/dashboard")):
 *   GET /reports/dashboard/sales      → SalesDashboard      ADMIN, SALES_MANAGER
 *   GET /reports/dashboard/inventory  → InventoryDashboard  ADMIN, WAREHOUSE_MANAGER
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
 * @returns {Promise<{
 *   todaySalesTotal: number,
 *   todayInvoiceCount: number,
 *   monthSalesTotal: number,
 *   monthInvoiceCount: number,
 *   activeRoutesToday: number,
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
 * }>}
 */
export const fetchInventoryDashboard = async () => {
  const response = await apiClient.get(`${BASE}/inventory`)

  return response.data?.data ?? response.data
}
