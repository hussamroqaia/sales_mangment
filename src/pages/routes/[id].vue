<script setup>
/**
 * Route Details Page
 *
 * Route name: routes-id  →  /routes/:id
 *   (manually registered in additional-routes.js because the parentheses in
 *    the project directory name break unplugin-vue-router's glob scanner)
 *
 * Thin wrapper; passes the route param `id` to the RouteDetails view.
 */

definePage({
  meta: {
    action: 'read',
    subject: 'Auth',
    navActiveLink: 'routes',
  },
})

import RouteDetails from '@/views/apps/logistics/routes/RouteDetails.vue'

const route = useRoute()
const routeId = computed(() => route.params.id)
</script>

<template>
  <RouteDetails :route-id="routeId" />
</template>
