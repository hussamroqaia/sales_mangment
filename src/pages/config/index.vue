<script setup>
/**
 * System Configuration Page
 *
 * Route name: config  →  /config
 *
 * Thin wrapper; all UI lives in the SystemConfigList view (project convention).
 *
 * Guarded by the `Config` ability, held by ADMIN (manage all) and
 * SALES_MANAGER — matching GET /api/config. Write controls are gated
 * separately inside the view, since PUT /api/config/{key} is ADMIN only.
 * WAREHOUSE_MANAGER and SALES_REP hold no `Config` ability.
 */

definePage({
  meta: {
    action: 'read',
    subject: 'Config',
  },
})

import SystemConfigList from '@/views/apps/config/SystemConfigList.vue'
</script>

<template>
  <SystemConfigList />
</template>
