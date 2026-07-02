<script setup>
/**
 * RouteList.vue
 *
 * Routes list view with server-side paginated/sorted table.
 * Row actions:
 *   - View Details → navigates to /routes/:id
 *   - Delete       → SweetAlert2 confirm → DELETE /routes/:id
 *
 * All Axios access lives in the service layer; state/logic in useRoutes.
 */

import RouteFormDrawer from '@/views/apps/logistics/routes/RouteFormDrawer.vue'
import RouteEditDrawer from '@/views/apps/logistics/routes/RouteEditDrawer.vue'
import RepresentativeSelect from '@/views/apps/logistics/RepresentativeSelect.vue'
import {
  useRoutes,
  ROUTE_STATUSES,
  resolveRouteStatusVariant,
} from '@/composables/useRoutes'
import { confirmAction } from '@/utils/swal'
import { useAuth } from '@/composables/useAuth'

const { userData } = useAuth()
const ROUTE_MANAGER_ROLES = ['admin', 'sales_manager']
const canManageRoutes = computed(() =>
  ROUTE_MANAGER_ROLES.includes(userData.value?.role?.toLowerCase()))

const router = useRouter()

const {
  routes,
  totalRoutes,
  isListLoading,
  listError,
  selectedStatus,
  selectedRepresentativeId,
  selectedRouteDate,
  page,
  itemsPerPage,
  updateOptions,
  isSubmitting,
  snackbar,
  fetchAllRoutes,
  createRoute,
  updateSelectedRoute,
  removeRoute,
} = useRoutes()

// ── Table Headers ──────────────────────────────────────────────────────────────
const headers = [
  { title: 'Route Name', key: 'name',              sortable: true  },
  { title: 'Rep Name',  key: 'representativeName', sortable: false },
  { title: 'Territory', key: 'territoryName',      sortable: false },
  { title: 'Date',      key: 'routeDate',          sortable: true  },
  { title: 'Status',    key: 'status',             sortable: true  },
  { title: 'Optimized', key: 'isOptimized',        sortable: false },
  { title: 'Action',    key: 'actions',            sortable: false, align: 'end' },
]

// ── Drawer state ───────────────────────────────────────────────────────────────
const isDrawerOpen = ref(false)

const openCreate = () => { isDrawerOpen.value = true }

const onSubmit = async payload => {
  const result = await createRoute(payload)
  if (result.success) isDrawerOpen.value = false
}

// ── Edit Drawer state ─────────────────────────────────────────────────────────
const isEditDrawerOpen = ref(false)
const routeToEdit = ref(null)

const openEdit = route => {
  routeToEdit.value = route
  isEditDrawerOpen.value = true
}

const onEditSubmit = async ({ id, payload }) => {
  const result = await updateSelectedRoute(id, payload)
  if (result.success) isEditDrawerOpen.value = false
}

// ── View Details — navigate to /routes/:id ────────────────────────────────────
const viewDetails = route => {
  router.push({ path: `/routes/${route.id}` })
}

// ── Delete — SweetAlert2 confirmation before firing DELETE ────────────────────
const onDelete = async route => {
  const confirmed = await confirmAction({
    title: `Delete route "${route.name}"?`,
    text: 'This will permanently remove the route and all its stops. This cannot be undone.',
    confirmText: 'Delete',
    icon: 'warning',
  })
  if (!confirmed) return
  await removeRoute(route.id)
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
  ROUTE_STATUSES.find(s => s.value === status)?.title ?? status ?? '—'

onMounted(fetchAllRoutes)
</script>

<template>
  <section>
    <VCard>
      <VCardItem class="pb-2">
        <VCardTitle>Routes</VCardTitle>
        <template #append>
          <VBtn
            v-if="canManageRoutes"
            prepend-icon="tabler-plus"
            @click="openCreate"
          >
            New Route
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
              :items="ROUTE_STATUSES"
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
            <RepresentativeSelect
              v-model="selectedRepresentativeId"
              label="Sales Rep"
              placeholder="Filter by Representative"
              clearable
            />
          </VCol>
          <VCol
            cols="12"
            sm="4"
          >
            <AppDateTimePicker
              v-model="selectedRouteDate"
              placeholder="Filter by Date (YYYY-MM-DD)"
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
          variant="tonal"
          color="secondary"
          prepend-icon="tabler-refresh"
          :loading="isListLoading"
          @click="fetchAllRoutes"
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
        :items="routes"
        :items-length="totalRoutes"
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
              icon="tabler-route-off"
              size="48"
              color="secondary"
            />
            <p class="text-body-1 text-medium-emphasis mb-0">
              No routes found.
            </p>
          </div>
        </template>

        <template #item.name="{ item }">
          <span class="text-body-1 font-weight-medium">{{ item.name }}</span>
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

        <template #item.territoryName="{ item }">
          <span class="text-body-2">{{ item.territoryName || '—' }}</span>
        </template>

        <template #item.routeDate="{ item }">
          <span class="text-body-2">{{ formatDate(item.routeDate) }}</span>
        </template>

        <template #item.status="{ item }">
          <VChip
            :color="resolveRouteStatusVariant(item.status)"
            size="small"
            label
          >
            {{ statusTitle(item.status) }}
          </VChip>
        </template>

        <template #item.isOptimized="{ item }">
          <VChip
            :color="item.isOptimized ? 'success' : 'secondary'"
            size="small"
            label
          >
            <VIcon
              :icon="item.isOptimized ? 'tabler-check' : 'tabler-x'"
              size="14"
              class="me-1"
            />
            {{ item.isOptimized ? 'Optimized' : 'Not Optimized' }}
          </VChip>
        </template>

        <template #item.actions="{ item }">
          <div class="d-flex justify-end gap-1">
            <template v-if="canManageRoutes">
              <VTooltip text="Edit Route">
                <template #activator="{ props: tp }">
                  <IconBtn
                    v-bind="tp"
                    @click="openEdit(item)"
                  >
                    <VIcon icon="tabler-edit" />
                  </IconBtn>
                </template>
              </VTooltip>
            
              <VTooltip text="Delete Route">
                <template #activator="{ props: tp }">
                  <IconBtn
                    v-bind="tp"
                    color="error"
                    :loading="isSubmitting"
                    @click="onDelete(item)"
                  >
                    <VIcon icon="tabler-trash" />
                  </IconBtn>
                </template>
              </VTooltip>
            </template>
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
            :total-items="totalRoutes"
          />
        </template>
      </VDataTableServer>
    </VCard>

    <!-- Create Drawer -->
    <RouteFormDrawer
      v-model:is-drawer-open="isDrawerOpen"
      :is-submitting="isSubmitting"
      @submit="onSubmit"
    />

    <!-- Edit Drawer -->
    <RouteEditDrawer
      v-model:is-drawer-open="isEditDrawerOpen"
      :route="routeToEdit"
      :is-submitting="isSubmitting"
      @submit="onEditSubmit"
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
