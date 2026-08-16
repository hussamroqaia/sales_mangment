<script setup>
/**
 * Invoice Preview Page
 *
 * Route name: apps-invoice-preview-id  →  /apps/invoice/preview/:id
 *
 * Thin wrapper; all UI lives in the InvoicePreview view (project convention —
 * see src/pages/visits/[id].vue).
 *
 * Guarded by the `Invoices` ability. GET /api/invoices/{id} also admits
 * SALES_REP for their own invoices, but that is the mobile client's path — this
 * screen is the management review surface and exposes approve/reject.
 */

definePage({
  meta: {
    action: 'manage',
    subject: 'Invoices',
    navActiveLink: 'apps-invoice-list',
  },
})

import InvoicePreview from '@/views/apps/invoice/InvoicePreview.vue'

const route = useRoute()
const invoiceId = computed(() => route.params.id)
</script>

<template>
  <InvoicePreview :id="invoiceId" />
</template>
