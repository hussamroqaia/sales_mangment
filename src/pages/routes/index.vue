<script setup>
/**
 * Routes List Page
 *
 * Route name: routes  →  /routes
 *   (manually registered in additional-routes.js because the parentheses in
 *    the project directory name break unplugin-vue-router's glob scanner)
 *
 * Thin wrapper; all UI lives in the RouteList view.
 */

definePage({
  meta: {
    action: 'read',
    subject: 'Auth',
  },
})

import RouteList from '@/views/apps/logistics/routes/RouteList.vue'
</script>

<template>
  <RouteList />
</template>
