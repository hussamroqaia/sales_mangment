<script setup>
/**
 * VisitList.vue
 *
 * Visits list view with a server-side paginated/sorted table.
 * Row action: View Details → navigates to /visits/:id
 *
 * No create/edit/delete actions are exposed — the backend only documents
 * GET /visits and GET /visits/{id} for this module.
 *
 * All Axios access lives in the service layer; state/logic in useVisits.
 */

import RepresentativeSelect from '@/views/apps/logistics/RepresentativeSelect.vue'
import RouteSelect from '@/views/apps/logistics/RouteSelect.vue'
import CustomerSelect from '@/views/apps/logistics/CustomerSelect.vue'
import {
  useVisits,
  VISIT_STATUSES,
  resolveVisitStatusVariant,
  visitStatusTitle,
  formatVisitDateTime,
  formatVisitDuration,
} from '@/composables/useVisits'
import { useAuth } from '@/composables/useAuth'

const { userData } = useAuth()

// Only ADMIN / SALES_MANAGER can query other representatives. For a SALES_REP
// the backend ignores `representativeId` entirely, so showing the filter would
// promise something the API cannot deliver.
const REPRESENTATIVE_FILTER_ROLES = ['admin', 'sales_manager']

const canFilterByRepresentative = computed(() =>
  REPRESENTATIVE_FILTER_ROLES.includes(userData.value?.role?.toLowerCase()))

const router = useRouter()

const {
  visits,
  totalVisits,
  isListLoading,
  listError,
  selectedRepresentativeId,
  selectedRouteId,
  selectedCustomerId,
  selectedStatus,
  resetFilters,
  page,
  itemsPerPage,
  updateOptions,
  snackbar,
  fetchAllVisits,
} = useVisits()

// ── Table Headers ─────────────────────────────────────────────────────────────
// `sortable` is true only for columns the backend can actually sort on — the
// computed Duration column must never send `sortBy=duration`.
const headers = [
  { title: 'العميل',       key: 'customerName',       sortable: false },
  { title: 'المندوب', key: 'representativeName', sortable: false },
  { title: 'المسار',          key: 'routeName',          sortable: false },
  { title: 'الحالة',         key: 'status',             sortable: true  },
  { title: 'المدة',       key: 'duration',           sortable: false },
  { title: 'الإجراء',         key: 'actions',            sortable: false, align: 'end' },
]



// ── Dependent filters ─────────────────────────────────────────────────────────
// Keep the raw selected route so the customer filter can narrow to its stops.
const selectedRouteObject = ref(null)

const routeStops = computed(() => selectedRouteObject.value?.stops ?? null)

const onRouteSelect = route => {
  selectedRouteObject.value = route

  // Drop a customer that is not a stop on the newly selected route.
  if (route && selectedCustomerId.value) {
    const stopIds = new Set((route.stops ?? []).map(s => s.customerId))

    if (!stopIds.has(selectedCustomerId.value)) selectedCustomerId.value = null
  }
}

// Changing the representative re-scopes the route options, so a route that no
// longer belongs to them (and any customer derived from it) must be cleared.
watch(selectedRepresentativeId, () => {
  if (selectedRouteId.value !== null) selectedRouteId.value = null
  selectedRouteObject.value = null
})

const hasActiveFilters = computed(() => Boolean(
  selectedRepresentativeId.value
  || selectedRouteId.value
  || selectedCustomerId.value
  || selectedStatus.value,
))

const onResetFilters = () => {
  selectedRouteObject.value = null
  resetFilters()
}

// ── View Details — navigate to /visits/:id ────────────────────────────────────
const viewDetails = visit => {
  router.push({ path: `/visits/${visit.id}` })
}

onMounted(fetchAllVisits)
</script>

<template>
  <section>
    <VCard>
      <VCardItem class="pb-2">
        <VCardTitle>الزيارات</VCardTitle>
        <VCardSubtitle>متابعة زيارات المندوبين للعملاء</VCardSubtitle>
      </VCardItem>

      <!-- Filters -->
      <VCardText>
        <VRow>
          <VCol
            v-if="canFilterByRepresentative"
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
            <RouteSelect
              v-model="selectedRouteId"
              :representative-id="selectedRepresentativeId"
              label="المسار"
              placeholder="تصفية حسب المسار"
              clearable
              @select="onRouteSelect"
            />
          </VCol>

          <VCol
            cols="12"
            md="3"
            sm="6"
          >
            <CustomerSelect
              v-model="selectedCustomerId"
              :stops="routeStops"
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
              :items="VISIT_STATUSES"
              item-title="title"
              item-value="value"
              clearable
              clear-icon="tabler-x"
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
          @click="onResetFilters"
        >
          إعادة تعيين عوامل التصفية
        </VBtn>
        <VBtn
          variant="tonal"
          color="secondary"
          prepend-icon="tabler-refresh"
          :loading="isListLoading"
          @click="fetchAllVisits"
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
        :items="visits"
        :items-length="totalVisits"
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
              icon="tabler-map-pin-off"
              size="48"
              color="secondary"
            />
            <p class="text-body-1 text-medium-emphasis mb-0">
              لا توجد زيارات مطابقة لعوامل التصفية المحددة.
            </p>
          </div>
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

        <template #item.routeName="{ item }">
          <span class="text-body-2">{{ item.routeName || `Route #${item.routeId}` }}</span>
        </template>

        <template #item.status="{ item }">
          <VChip
            :color="resolveVisitStatusVariant(item.status)"
            size="small"
            label
            class="text-no-wrap"
          >
            {{ visitStatusTitle(item.status) }}
          </VChip>
        </template>

        <template #item.duration="{ item }">
          <span class="text-body-2">
            {{ formatVisitDuration(item.checkInTime, item.checkOutTime) }}
          </span>
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
            :total-items="totalVisits"
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
