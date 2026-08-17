<script setup>
/**
 * Visit Details Page
 *
 * Route name: visits-id  →  /visits/:id
 *   Registered manually in additional-routes.js — see visits/index.vue for why.
 *
 * Thin wrapper; passes the route param `id` to the VisitDetails view.
 */

definePage({
  meta: {
    action: 'read',
    subject: 'Management',
    navActiveLink: 'visits',
  },
})

import VisitDetails from '@/views/apps/logistics/visits/VisitDetails.vue'

const route = useRoute()
const visitId = computed(() => route.params.id)
</script>

<template>
  <VisitDetails :visit-id="visitId" />
</template>
