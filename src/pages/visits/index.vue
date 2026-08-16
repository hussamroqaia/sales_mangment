<script setup>
/**
 * Visits Page
 *
 * Route name: visits  →  /visits
 *   Registered manually in additional-routes.js: the project directory name
 *   contains parentheses ("مجلد جديد (2)"), which are glob special characters,
 *   so unplugin-vue-router never scans src/pages/visits/ and the route is not
 *   auto-generated (same workaround as /products).
 *
 * Thin wrapper; all UI lives in the VisitList view.
 */

definePage({
  meta: {
    action: 'read',
    subject: 'Auth',
  },
})

import VisitList from '@/views/apps/logistics/visits/VisitList.vue'
</script>

<template>
  <VisitList />
</template>
