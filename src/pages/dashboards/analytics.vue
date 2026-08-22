<script setup>
/**
 * Dashboard
 *
 * Route name: dashboards-analytics  →  /dashboards/analytics
 *
 * Contains real backend KPIs only. The ten Vuexy demo widgets that used to sit
 * on this page (website analytics, sales by countries, campaign state, project
 * table, …) were hardcoded template sample data with no backend behind them and
 * have been removed — a dashboard that mixes real figures with invented ones is
 * worse than a smaller honest one.
 */

definePage({
  meta: {
    action: 'read',
    subject: 'Auth',
  },
})

// Self-gating by role: renders nothing and issues no request for roles without
// dashboard access — which matters here because guards.js admits every
// logged-in user to this route, SALES_REP included.
import DashboardKpiOverview from '@/views/dashboards/DashboardKpiOverview.vue'
</script>

<template>
  <!--
    No grid wrapper here: the overview lays out its own sections, each with its
    own heading and row, so wrapping it in a single full-width column would only
    add a nesting level that flattens that hierarchy back out.
  -->
  <DashboardKpiOverview />
</template>
