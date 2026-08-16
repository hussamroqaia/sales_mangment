<script setup>
/**
 * Reports Page
 *
 * Route name: reports  →  /reports
 *
 * Thin wrapper; all UI lives in the ReportsWorkspace view (project convention —
 * see src/pages/tracking/index.vue, which is likewise auto-registered).
 *
 * Guarded by the `Reports` ability, held by ADMIN (manage all), SALES_MANAGER
 * and WAREHOUSE_MANAGER — but NOT SALES_REP. Which report categories appear
 * inside the page is gated separately, per the backend's own split.
 */

definePage({
  meta: {
    action: 'read',
    subject: 'Reports',
  },
})

import ReportsWorkspace from '@/views/apps/reports/ReportsWorkspace.vue'
</script>

<template>
  <ReportsWorkspace />
</template>
