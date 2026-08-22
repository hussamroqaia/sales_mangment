<script setup>
/**
 * Dashboard
 *
 * Route name: dashboards-analytics  →  /dashboards/analytics
 *
 * Contains real backend figures only. The ten Vuexy demo widgets that used to
 * sit on this page (website analytics, sales by countries, campaign state,
 * project table, …) were hardcoded template sample data with no backend behind
 * them and have been removed — a dashboard that mixes real figures with
 * invented ones is worse than a smaller honest one.
 *
 * Two blocks, in reading order:
 *
 *   DashboardKpiOverview  — the unfiltered "right now" figures: today's sales,
 *                           this month's, current stock counts. No date range;
 *                           they answer "where do we stand".
 *   DashboardAnalytics    — the same two endpoints' period-scoped companions,
 *                           under a date/granularity/top filter bar. Trends,
 *                           rankings and distributions; they answer "how did
 *                           the chosen window go".
 *
 * They are separate components with separate requests on purpose: the KPI tiles
 * take no filters and must not blank out or reload when the analytics window
 * changes underneath them.
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
import DashboardAnalytics from '@/views/dashboards/DashboardAnalytics.vue'
import DashboardKpiOverview from '@/views/dashboards/DashboardKpiOverview.vue'
</script>

<template>
  <!--
    No grid wrapper here: each block lays out its own sections, with its own
    heading and rows, so wrapping them in a single full-width column would only
    add a nesting level that flattens that hierarchy back out.
  -->
  <DashboardKpiOverview />

  <DashboardAnalytics class="mt-6" />
</template>
