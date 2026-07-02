<script setup>
/**
 * DemandOrderList.vue
 *
 * Demand Orders list (Warehouse → Van). Server-side paginated/sorted table with
 * Status / Date / Rep ID filters. Row actions:
 *   - View Details → details modal (nested lines)
 *   - Load Van     → POST /load, only when status !== 'LOADED', SweetAlert2 confirm
 *
 * All Axios access lives in the service layer; state/logic in useDemandOrders.
 */

import DemandOrderFormDrawer from '@/views/apps/logistics/demand-orders/DemandOrderFormDrawer.vue'
import DemandOrderDetailsModal from '@/views/apps/logistics/demand-orders/DemandOrderDetailsModal.vue'
import RepresentativeSelect from '@/views/apps/logistics/RepresentativeSelect.vue'
import {
  useDemandOrders,
  DEMAND_ORDER_STATUSES,
  resolveDemandStatusVariant,
} from '@/composables/useDemandOrders'
import { confirmAction } from '@/utils/swal'

const {
  orders,
  totalOrders,
  isListLoading,
  listError,
  selectedStatus,
  orderDate,
  repIdFilter,
  page,
  itemsPerPage,
  updateOptions,
  selectedOrder,
  isDetailLoading,
  isSubmitting,
  snackbar,
  fetchAllOrders,
  fetchOrder,
  createOrder,
  loadOrder,
  clearSelected,
} = useDemandOrders()

// ── Table Headers ──────────────────────────────────────────────────────────────
const headers = [
  { title: 'Rep ID', key: 'representativeId',  sortable: true  },
  { title: 'Date',   key: 'orderDate',         sortable: true  },
  { title: 'Status', key: 'status',            sortable: true  },
  { title: 'Action', key: 'actions',           sortable: false, align: 'end' },
]

// ── Drawer + Modal state ───────────────────────────────────────────────────────
const isDrawerOpen = ref(false)
const isModalOpen  = ref(false)

const openCreate = () => { isDrawerOpen.value = true }

const onSubmit = async payload => {
  const result = await createOrder(payload)
  if (result.success) isDrawerOpen.value = false
}

const openDetails = async order => {
  isModalOpen.value = true
  await fetchOrder(order.id)
}

const onModalToggle = val => {
  isModalOpen.value = val
  if (!val) clearSelected()
}

// ── Load Van — SweetAlert2 confirmation before firing POST /load ───────────────
const onLoadVan = async order => {
  const confirmed = await confirmAction({
    title: `Load order #${order.id}?`,
    text: `This will move the requested stock onto Rep #${order.representativeId}'s van and mark the order as LOADED. This cannot be undone.`,
    confirmText: 'Load Van',
    icon: 'warning',
  })
  if (!confirmed) return
  await loadOrder(order.id)
}

// ── Formatter ───────────────────────────────────────────────────────────────────
const formatDate = value => {
  if (!value) return '—'
  const d = new Date(value)

  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: '2-digit',
  }).format(d)
}

const statusTitle = status =>
  DEMAND_ORDER_STATUSES.find(s => s.value === status)?.title ?? status ?? '—'

onMounted(fetchAllOrders)
</script>

<template>
  <section>
    <VCard>
      <VCardItem class="pb-2">
        <VCardTitle>Demand Orders</VCardTitle>
        <template #append>
          <VBtn
            prepend-icon="tabler-plus"
            @click="openCreate"
          >
            New Demand Order
          </VBtn>
        </template>
      </VCardItem>

      <!-- Filters -->
      <VCardText>
        <VRow>
          <VCol
            cols="12"
            sm="4"
          >
            <AppSelect
              v-model="selectedStatus"
              placeholder="Filter by Status"
              :items="DEMAND_ORDER_STATUSES"
              item-title="title"
              item-value="value"
              clearable
              clear-icon="tabler-x"
            />
          </VCol>
          <VCol
            cols="12"
            sm="4"
          >
            <AppDateTimePicker
              v-model="orderDate"
              placeholder="Filter by Order Date"
              :config="{ dateFormat: 'Y-m-d' }"
            />
          </VCol>
          <VCol
            cols="12"
            sm="4"
          >
            <RepresentativeSelect
              v-model="repIdFilter"
              label="Filter by Sales Rep"
              placeholder="Search sales reps…"
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
          variant="tonal"
          color="secondary"
          prepend-icon="tabler-refresh"
          :loading="isListLoading"
          @click="fetchAllOrders"
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
        :items="orders"
        :items-length="totalOrders"
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
              icon="tabler-truck-off"
              size="48"
              color="secondary"
            />
            <p class="text-body-1 text-medium-emphasis mb-0">
              No demand orders found.
            </p>
          </div>
        </template>

        <template #item.representativeId="{ item }">
          <VChip
            size="small"
            color="primary"
            variant="tonal"
            label
          >
            Rep #{{ item.representativeId }}
          </VChip>
        </template>

        <template #item.orderDate="{ item }">
          <span class="text-body-2">{{ formatDate(item.orderDate) }}</span>
        </template>

        <template #item.status="{ item }">
          <VChip
            :color="resolveDemandStatusVariant(item.status)"
            size="small"
            label
          >
            {{ statusTitle(item.status) }}
          </VChip>
        </template>

        <template #item.actions="{ item }">
          <div class="d-flex justify-end gap-1">
            <VTooltip text="View Details">
              <template #activator="{ props: tp }">
                <IconBtn
                  v-bind="tp"
                  @click="openDetails(item)"
                >
                  <VIcon icon="tabler-eye" />
                </IconBtn>
              </template>
            </VTooltip>

            <!-- Load Van — only when not already LOADED -->
            <VTooltip
              v-if="item.status !== 'LOADED'"
              text="Load Van"
            >
              <template #activator="{ props: tp }">
                <IconBtn
                  v-bind="tp"
                  color="success"
                  :loading="isSubmitting"
                  @click="onLoadVan(item)"
                >
                  <VIcon icon="tabler-truck-loading" />
                </IconBtn>
              </template>
            </VTooltip>
          </div>
        </template>

        <template #bottom>
          <TablePagination
            v-model:page="page"
            :items-per-page="itemsPerPage"
            :total-items="totalOrders"
          />
        </template>
      </VDataTableServer>
    </VCard>

    <!-- Create Drawer -->
    <DemandOrderFormDrawer
      v-model:is-drawer-open="isDrawerOpen"
      :is-submitting="isSubmitting"
      @submit="onSubmit"
    />

    <!-- Details Modal -->
    <DemandOrderDetailsModal
      :is-dialog-open="isModalOpen"
      :order="selectedOrder"
      :is-loading="isDetailLoading"
      @update:is-dialog-open="onModalToggle"
    />

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
