<script setup>
/**
 * DashboardAnalytics.vue
 *
 * The analytics half of the dashboard: one filter bar over the two
 * period-scoped endpoints.
 *
 *   GET /api/reports/dashboard/sales/analytics      → ADMIN, SALES_MANAGER
 *   GET /api/reports/dashboard/inventory/analytics  → ADMIN, WAREHOUSE_MANAGER
 *
 * This is the only component here that talks to the composable. Everything
 * below it takes a DTO and a pair of flags as props and renders — no request,
 * no state, no knowledge of which role is looking. That is what lets the two
 * sections fail independently without either of them knowing the other exists.
 *
 * Role gating happens before the request, not after a 403: a SALES_MANAGER
 * never calls the inventory endpoint and a WAREHOUSE_MANAGER never calls the
 * sales one. See useDashboard for why a 403 is the wrong thing to learn a role
 * from in this app.
 */

import DashboardAnalyticsFilters from '@/views/dashboards/DashboardAnalyticsFilters.vue'
import DashboardInventoryAnalytics from '@/views/dashboards/DashboardInventoryAnalytics.vue'
import DashboardSalesAnalytics from '@/views/dashboards/DashboardSalesAnalytics.vue'

const {
  canViewSalesDashboard,
  canViewInventoryDashboard,
  hasAnyDashboard,

  analyticsFrom,
  analyticsTo,
  analyticsGranularity,
  analyticsTop,
  analyticsRangeError,

  salesAnalytics,
  isSalesAnalyticsLoading,
  salesAnalyticsError,

  inventoryAnalytics,
  isInventoryAnalyticsLoading,
  inventoryAnalyticsError,

  isAnalyticsLoading,
  isAnalyticsStale,
  analyticsAppliedRange,
  appliedAnalyticsGranularity,

  loadAnalytics,
  applyAnalyticsFilters,
  refreshAnalytics,
} = useDashboard()

// The first load deliberately sends no window, so the backend's own defaults
// decide it and the filter controls are then filled in from the response. See
// `hasResolvedAnalyticsWindow` in useDashboard.
onMounted(loadAnalytics)
</script>

<template>
  <!-- Renders nothing, and requests nothing, for a role with no dashboard. -->
  <div v-if="hasAnyDashboard">
    <div class="mb-4">
      <DashboardAnalyticsFilters
        v-model:from="analyticsFrom"
        v-model:to="analyticsTo"
        v-model:granularity="analyticsGranularity"
        v-model:top="analyticsTop"
        :loading="isAnalyticsLoading"
        :stale="isAnalyticsStale"
        :range-error="analyticsRangeError"
        :applied-range="analyticsAppliedRange"
        @apply="applyAnalyticsFilters"
        @refresh="refreshAnalytics"
      />
    </div>

    <DashboardSalesAnalytics
      v-if="canViewSalesDashboard"
      :data="salesAnalytics"
      :loading="isSalesAnalyticsLoading"
      :error="salesAnalyticsError"
      :granularity="appliedAnalyticsGranularity"
      :range-label="analyticsAppliedRange"
      @retry="refreshAnalytics"
    />

    <!--
      Spaced from the sales section only when there IS one above it, so a
      warehouse manager does not open the page to a gap where a section they
      cannot see would have been.
    -->
    <DashboardInventoryAnalytics
      v-if="canViewInventoryDashboard"
      :class="canViewSalesDashboard ? 'mt-6' : ''"
      :data="inventoryAnalytics"
      :loading="isInventoryAnalyticsLoading"
      :error="inventoryAnalyticsError"
      :granularity="appliedAnalyticsGranularity"
      :range-label="analyticsAppliedRange"
      @retry="refreshAnalytics"
    />
  </div>
</template>
