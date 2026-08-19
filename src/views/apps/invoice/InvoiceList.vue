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
  { title: 'الحالة',         key: 'status',             sortable: true  },
  { title: 'العميل',       key: 'customerName',       sortable: false },
  { title: 'المندوب', key: 'representativeName', sortable: false },
  { title: 'تاريخ الفاتورة',   key: 'invoiceDate',        sortable: true  },
  { title: 'الإجمالي',          key: 'totalAmount',        sortable: true  },
  { title: 'الإجراء',         key: 'actions',            sortable: false, align: 'end' },
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
        <VCardTitle>الفواتير</VCardTitle>
        <VCardSubtitle>مراجعة فواتير المندوبين والموافقة عليها أو رفضها</VCardSubtitle>
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
              label="المندوب"
              placeholder="تصفية حسب المندوب"
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
              label="العميل"
              placeholder="تصفية حسب العميل"
              clearable
            />
          </VCol>

          <VCol
            cols="12"
            md="3"
            sm="6"
          >
            <VSelect
              v-model="selectedStatus"
              label="الحالة"
              placeholder="تصفية حسب الحالة"
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
              placeholder="تاريخ الفاتورة (سنة-شهر-يوم)"
              :config="{ dateFormat: 'Y-m-d' }"
              clearable
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
          إعادة تعيين عوامل التصفية
        </VBtn>
        <VBtn
          variant="tonal"
          color="secondary"
          prepend-icon="tabler-refresh"
          :loading="isListLoading"
          @click="fetchAllInvoices"
        >
          تحديث
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
              لا توجد فواتير مطابقة لعوامل التصفية المحددة.
            </p>
          </div>
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
            <VTooltip text="عرض التفاصيل">
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
