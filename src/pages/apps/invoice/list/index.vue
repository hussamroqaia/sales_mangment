<script setup>
/**
 * Invoice List Page
 *
 * Route name: apps-invoice-list  →  /apps/invoice/list
 *
 * Thin wrapper; all UI lives in the InvoiceList view (project convention — see
 * src/pages/visits/index.vue).
 *
 * Guarded by the `Invoices` ability, which only ADMIN (manage all) and
 * SALES_MANAGER hold — matching @PreAuthorize("hasAnyRole('SALES_MANAGER',
 * 'ADMIN')") on GET /api/invoices. WAREHOUSE_MANAGER and SALES_REP cannot
 * reach this page.
 */

definePage({
  meta: {
    action: 'manage',
    subject: 'Invoices',
  },
})

import InvoiceList from '@/views/apps/invoice/InvoiceList.vue'
</script>

<template>
  <InvoiceList />
</template>
