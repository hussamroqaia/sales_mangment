<script setup>
import CrmActiveProject from '@/views/dashboards/crm/CrmActiveProject.vue'
import CrmActivityTimeline from '@/views/dashboards/crm/CrmActivityTimeline.vue'
import CrmAnalyticsSales from '@/views/dashboards/crm/CrmAnalyticsSales.vue'
import CrmEarningReportsYearlyOverview from '@/views/dashboards/crm/CrmEarningReportsYearlyOverview.vue'
import CrmOrderBarChart from '@/views/dashboards/crm/CrmOrderBarChart.vue'
import CrmProjectStatus from '@/views/dashboards/crm/CrmProjectStatus.vue'
import CrmRecentTransactions from '@/views/dashboards/crm/CrmRecentTransactions.vue'
import CrmRevenueGrowth from '@/views/dashboards/crm/CrmRevenueGrowth.vue'
import CrmSalesAreaCharts from '@/views/dashboards/crm/CrmSalesAreaCharts.vue'
import CrmSalesByCountries from '@/views/dashboards/crm/CrmSalesByCountries.vue'

// Real backend KPIs. Self-gating by role, so it issues only the requests the
// signed-in role is authorised to make.
import DashboardKpiOverview from '@/views/dashboards/DashboardKpiOverview.vue'

// The two "Total Profit" / "Total Sales" template cards that used to sit here
// were hardcoded Vuexy figures with invented week-over-week deltas. The backend
// exposes neither profit nor a period-over-period change, so rather than
// fabricate them they are dropped — the real KPI tiles above carry the numbers.
</script>

<template>
  <VRow class="match-height">
    <!-- 👉 Real backend KPIs (role-gated) -->
    <VCol cols="12">
      <DashboardKpiOverview />
    </VCol>

    <VCol
      cols="12"
      md="4"
      sm="6"
      lg="2"
    >
      <CrmOrderBarChart />
    </VCol>

    <VCol
      cols="12"
      md="4"
      sm="6"
      lg="2"
    >
      <CrmSalesAreaCharts />
    </VCol>

    <!-- 👉 Revenue Growth -->
    <VCol
      cols="12"
      md="8"
      lg="4"
    >
      <CrmRevenueGrowth />
    </VCol>

    <!-- 👉 Earning Reports -->
    <VCol
      cols="12"
      md="8"
    >
      <CrmEarningReportsYearlyOverview />
    </VCol>

    <!-- 👉 Sales -->
    <VCol
      cols="12"
      md="4"
    >
      <CrmAnalyticsSales />
    </VCol>

    <!-- 👉 Browser States -->
    <VCol
      cols="12"
      md="4"
    >
      <CrmSalesByCountries />
    </VCol>

    <!-- 👉 Project Status -->
    <VCol
      cols="12"
      md="4"
    >
      <CrmProjectStatus />
    </VCol>

    <!-- 👉 Active Project -->
    <VCol
      cols="12"
      md="4"
    >
      <CrmActiveProject />
    </VCol>

    <!-- 👉 Recent Transactions -->
    <VCol
      cols="12"
      md="6"
    >
      <CrmRecentTransactions />
    </VCol>

    <!-- 👉 Active timeline -->
    <VCol
      cols="12"
      md="6"
    >
      <CrmActivityTimeline />
    </VCol>
  </VRow>
</template>
