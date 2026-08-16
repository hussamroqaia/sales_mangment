<script setup>
/**
 * InvoiceList.vue
 *
 * Manager/admin invoice review queue, server-side paginated and sorted.
 * Row action: View Details → /apps/invoice/preview/:id
 *
 * No create / edit / delete / duplicate actions are exposed. Those endpoints
 * exist only for SALES_REP and belong to the mobile client — offering them here
 * would put a mobile workflow in the management app.
 *
 * All Axios access lives in the service layer; state/logic in useInvoices.
 */

import RepresentativeSelect from '@/views/apps/logistics/RepresentativeSelect.vue'
import CustomerSelect from '@/views/apps/logistics/CustomerSelect.vue'
import {
  useInvoices,
  INVOICE_STATUS_OPTIONS,
  resolveInvoiceStatusVariant,
  invoiceStatusTitle,
  formatInvoiceDate,
  formatAmount,
} from '@/composables/useInvoices'

const router = useRouter()

const {
  invoices,
  totalInvoices,
  isListLoading,
  listError,
  selectedRepresentativeId,
  selectedCustomerId,
  selectedStatus,
  selectedInvoiceDate,
  resetFilters,
  page,
  itemsPerPage,
  updateOptions,
  snackbar,
  fetchAllInvoices,
} = useInvoices()

// ── Table Headers ─────────────────────────────────────────────────────────────
// `sortable` is true only where the backend can actually sort: PageRequest turns
// `sortBy` straight into a Sort on that property name, so only real Invoice
// columns may be sent. `customerName` / `representativeName` are enriched by the
// service after the query and are NOT persisted columns — sorting on them would
// make Spring Data throw.
const headers = [
  { title: 'Invoice',        key: 'id',                 sortable: true  },
  { title: 'Status',         key: 'status',             sortable: true  },
  { title: 'Customer',       key: 'customerName',       sortable: false },
  { title: 'Representative', key: 'representativeName', sortable: false },
  { title: 'Invoice Date',   key: 'invoiceDate',        sortable: true  },
  { title: 'Total',          key: 'totalAmount',        sortable: true  },
  { title: 'Action',         key: 'actions',            sortable: false, align: 'end' },
]

const hasActiveFilters = computed(() => Boolean(
  selectedRepresentativeId.value
  || selectedCustomerId.value
  || selectedStatus.value
  || selectedInvoiceDate.value,
))

// ── View Details ──────────────────────────────────────────────────────────────
const viewDetails = invoice => {
  router.push({ name: 'apps-invoice-preview-id', params: { id: invoice.id } })
}

onMounted(fetchAllInvoices)
</script>

<template>
  <section>
    <VCard>
      <VCardItem class="pb-2">
        <VCardTitle>Invoices</VCardTitle>
        <VCardSubtitle>Review, approve, and reject representative invoices</VCardSubtitle>
      </VCardItem>

      <!-- Filters — exactly the four the backend accepts -->
      <VCardText>
        <VRow>
          <VCol
            cols="12"
            md="3"
            sm="6"
          >
            <RepresentativeSelect
              v-model="selectedRepresentativeId"
              label="Representative"
              placeholder="Filter by Representative"
              clearable
            />
          </VCol>

          <VCol
            cols="12"
            md="3"
            sm="6"
          >
            <CustomerSelect
              v-model="selectedCustomerId"
              label="Customer"
              placeholder="Filter by Customer"
              clearable
            />
          </VCol>

          <VCol
            cols="12"
            md="3"
            sm="6"
          >
            <AppSelect
              v-model="selectedStatus"
              label="Status"
              placeholder="Filter by Status"
              :items="INVOICE_STATUS_OPTIONS"
              item-title="title"
              item-value="value"
              clearable
              clear-icon="tabler-x"
            />
          </VCol>

          <VCol
            cols="12"
            md="3"
            sm="6"
          >
            <AppDateTimePicker
              v-model="selectedInvoiceDate"
              label="Invoice Date"
              placeholder="YYYY-MM-DD"
              :config="{ dateFormat: 'Y-m-d' }"
            />
          </VCol>
        </VRow>
      </VCardText>

      <VDivider />

      <!-- Toolbar -->
      <VCardText class="d-flex flex-wrap align-center gap-4">
        <AppSelect
          :model-value="itemsPerPage"
          :items="[
            { value: 10, title: '10' },
            { value: 25, title: '25' },
            { value: 50, title: '50' },
          ]"
          style="inline-size: 6.25rem;"
          @update:model-value="itemsPerPage = parseInt($event, 10)"
        />
        <VSpacer />
        <VBtn
          v-if="hasActiveFilters"
          variant="tonal"
          color="secondary"
          prepend-icon="tabler-filter-off"
          @click="resetFilters"
        >
          Reset Filters
        </VBtn>
        <VBtn
          variant="tonal"
          color="secondary"
          prepend-icon="tabler-refresh"
          :loading="isListLoading"
          @click="fetchAllInvoices"
        >
          Refresh
        </VBtn>
      </VCardText>

      <VDivider />

      <VAlert
        v-if="listError"
        type="error"
        variant="tonal"
        class="ma-4"
        closable
      >
        {{ listError }}
      </VAlert>

      <VDataTableServer
        :headers="headers"
        :items="invoices"
        :items-length="totalInvoices"
        :loading="isListLoading"
        :page="page"
        :items-per-page="itemsPerPage"
        item-value="id"
        class="text-no-wrap"
        hide-default-footer
        @update:options="updateOptions"
      >
        <template #loading>
          <VSkeletonLoader type="table-row@8" />
        </template>

        <template #no-data>
          <div class="d-flex flex-column align-center justify-center py-10 gap-3">
            <VIcon
              icon="tabler-file-invoice"
              size="48"
              color="secondary"
            />
            <p class="text-body-1 text-medium-emphasis mb-0">
              No invoices found for the selected filters.
            </p>
          </div>
        </template>

        <template #item.id="{ item }">
          <RouterLink
            :to="{ name: 'apps-invoice-preview-id', params: { id: item.id } }"
            class="text-link font-weight-medium"
          >
            #{{ item.id }}
          </RouterLink>
        </template>

        <template #item.status="{ item }">
          <VChip
            :color="resolveInvoiceStatusVariant(item.status).color"
            size="small"
            label
          >
            {{ invoiceStatusTitle(item.status) }}
          </VChip>
        </template>

        <template #item.customerName="{ item }">
          <span class="text-body-1 font-weight-medium">
            {{ item.customerName || `Customer #${item.customerId}` }}
          </span>
        </template>

        <template #item.representativeName="{ item }">
          <VChip
            size="small"
            color="primary"
            variant="tonal"
            label
          >
            {{ item.representativeName || `Rep #${item.representativeId}` }}
          </VChip>
        </template>

        <template #item.invoiceDate="{ item }">
          <span class="text-body-2">{{ formatInvoiceDate(item.invoiceDate) }}</span>
        </template>

        <template #item.totalAmount="{ item }">
          <span class="text-body-1 font-weight-medium">{{ formatAmount(item.totalAmount) }}</span>
        </template>

        <template #item.actions="{ item }">
          <div class="d-flex justify-end gap-1">
            <VTooltip text="View Details">
              <template #activator="{ props: tp }">
                <IconBtn
                  v-bind="tp"
                  @click="viewDetails(item)"
                >
                  <VIcon icon="tabler-eye" />
                </IconBtn>
              </template>
            </VTooltip>
          </div>
        </template>

        <template #bottom>
          <TablePagination
            v-model:page="page"
            :items-per-page="itemsPerPage"
            :total-items="totalInvoices"
          />
        </template>
      </VDataTableServer>
    </VCard>

    <!-- Snackbar -->
    <VSnackbar
      v-model="snackbar.show"
      :color="snackbar.color"
      :timeout="3500"
      location="bottom end"
    >
      <VIcon
        :icon="snackbar.color === 'success' ? 'tabler-circle-check' : 'tabler-alert-circle'"
        class="me-2"
      />
      {{ snackbar.message }}
    </VSnackbar>
  </section>
</template>
