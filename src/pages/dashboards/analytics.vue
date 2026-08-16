<script setup>
definePage({
  meta: {
    action: 'read',
    subject: 'Auth',
  },
})
import AnalyticsAverageDailySales from '@/views/dashboards/analytics/AnalyticsAverageDailySales.vue'
import AnalyticsEarningReportsWeeklyOverview from '@/views/dashboards/analytics/AnalyticsEarningReportsWeeklyOverview.vue'
import AnalyticsMonthlyCampaignState from '@/views/dashboards/analytics/AnalyticsMonthlyCampaignState.vue'
import AnalyticsProjectTable from '@/views/dashboards/analytics/AnalyticsProjectTable.vue'
import AnalyticsSalesByCountries from '@/views/dashboards/analytics/AnalyticsSalesByCountries.vue'
import AnalyticsSalesOverview from '@/views/dashboards/analytics/AnalyticsSalesOverview.vue'
import AnalyticsSourceVisits from '@/views/dashboards/analytics/AnalyticsSourceVisits.vue'
import AnalyticsSupportTracker from '@/views/dashboards/analytics/AnalyticsSupportTracker.vue'
import AnalyticsTotalEarning from '@/views/dashboards/analytics/AnalyticsTotalEarning.vue'
import AnalyticsWebsiteAnalytics from '@/views/dashboards/analytics/AnalyticsWebsiteAnalytics.vue'

// Real backend KPIs. Self-gating by role: renders nothing and issues no request
// for roles without dashboard access — which matters here because guards.js
// admits every logged-in user to this route, SALES_REP included.
import DashboardKpiOverview from '@/views/dashboards/DashboardKpiOverview.vue'
</script>

<template>
  <VRow class="match-height">
    <!-- 👉 Real backend KPIs (role-gated) -->
    <VCol cols="12">
      <DashboardKpiOverview />
    </VCol>

    <!-- 👉 Website analytics -->
    <VCol
      cols="12"
      md="6"
    >
      <AnalyticsWebsiteAnalytics />
    </VCol>

    <!-- 👉 Average Daily Sales -->
    <VCol
      cols="12"
      md="3"
      sm="6"
    >
      <AnalyticsAverageDailySales />
    </VCol>

    <!-- 👉 Sales Overview -->
    <VCol
      cols="12"
      md="3"
      sm="6"
    >
      <AnalyticsSalesOverview />
    </VCol>

    <!-- 👉 Earning Reports Weekly Overview -->
    <VCol
      cols="12"
      md="6"
    >
      <AnalyticsEarningReportsWeeklyOverview />
    </VCol>

    <!-- 👉 Support Tracker -->
    <VCol
      cols="12"
      md="6"
    >
      <AnalyticsSupportTracker />
    </VCol>

    <!-- 👉 Sales by Countries -->
    <VCol
      cols="12"
      sm="6"
      lg="4"
    >
      <AnalyticsSalesByCountries />
    </VCol>

    <!-- 👉 Total Earning -->
    <VCol
      cols="12"
      sm="6"
      lg="4"
    >
      <AnalyticsTotalEarning />
    </VCol>

    <!-- 👉 Monthly Campaign State -->
    <VCol
      cols="12"
      sm="6"
      lg="4"
    >
      <AnalyticsMonthlyCampaignState />
    </VCol>

    <!-- 👉 Source Visits -->
    <VCol
      cols="12"
      sm="6"
      lg="4"
    >
      <AnalyticsSourceVisits />
    </VCol>

    <!-- 👉 Project Table -->
    <VCol
      cols="12"
      lg="8"
    >
      <AnalyticsProjectTable />
    </VCol>
  </VRow>
</template>

<style lang="scss">
@use "@core/scss/template/libs/apex-chart.scss";
</style>
