<script setup>
/**
 * Customer List Page
 *
 * Route name: apps-customer-list  →  /apps/customer/list
 *
 * Access rules:
 *   - All authenticated roles can VIEW (action: 'read', subject: 'Auth')
 *   - Only ADMIN can CREATE / EDIT / DELETE (checked via useAuth userData.role)
 *   - All roles can change status (PATCH endpoint is role-agnostic per spec)
 */

definePage({
  meta: {
    action: 'read',
    subject: 'Auth',
  },
})

import CustomerFormDrawer from '@/views/apps/customer/CustomerFormDrawer.vue'
import {
  useCustomers,
  CUSTOMER_CATEGORIES,
  CUSTOMER_STATUSES,
  resolveCategoryVariant,
  resolveStatusVariant,
} from '@/composables/useCustomers'
import { useAuth } from '@/composables/useAuth'

// ── Auth ───────────────────────────────────────────────────────────────────────
const { userData } = useAuth()
const isAdmin = computed(() => userData.value?.role?.toLowerCase() === 'admin')

// ── Composable ─────────────────────────────────────────────────────────────────
const {
  customers,
  totalCustomers,
  isListLoading,
  listError,
  searchQuery,
  selectedStatus,
  selectedTerritory,
  page,
  itemsPerPage,
  updateOptions,
  territoriesList,
  isTerritoriesLoading,
  loadTerritories,
  editingCustomer,
  isDetailLoading,
  isSubmitting,
  snackbar,
  fetchAllCustomers,
  fetchCustomer,
  createCustomer,
  updateCustomer,
  changeCustomerStatus,
  deleteCustomer,
  clearEditing,
} = useCustomers()

// ── Table Headers ──────────────────────────────────────────────────────────────
const headers = [
  { title: 'Customer',  key: 'name',        sortable: true  },
  { title: 'Category',  key: 'category',    sortable: true  },
  { title: 'Territory', key: 'territoryId', sortable: false },
  { title: 'Phone',     key: 'phone',       sortable: false },
  { title: 'Status',    key: 'status',      sortable: true  },
  { title: 'Actions',   key: 'actions',     sortable: false, align: 'end' },
]

// ── Territory lookup map ───────────────────────────────────────────────────────
const territoryMap = computed(() =>
  Object.fromEntries(territoriesList.value.map(t => [t.id, t.name])),
)

const territoryItems = computed(() =>
  territoriesList.value.map(t => ({ title: t.name, value: t.id })),
)

// ── Drawer State ───────────────────────────────────────────────────────────────
const isDrawerOpen = ref(false)

// ── Delete Confirmation Dialog State ──────────────────────────────────────────
const isDeleteDialogOpen = ref(false)
const customerToDelete   = ref(null)

// ── Handlers ───────────────────────────────────────────────────────────────────

const openCreate = () => {
  clearEditing()
  isDrawerOpen.value = true
}

const openEdit = async customer => {
  isDrawerOpen.value = true
  await fetchCustomer(customer.id)
}

const onSubmit = async ({ id, ...payload }) => {
  const result = id
    ? await updateCustomer(id, payload)
    : await createCustomer(payload)

  if (result.success) {
    isDrawerOpen.value = false
    clearEditing()
  }
}

const onDrawerClose = () => {
  isDrawerOpen.value = false
  clearEditing()
}

const onDelete = customer => {
  customerToDelete.value   = customer
  isDeleteDialogOpen.value = true
}

const onConfirmDelete = async () => {
  if (!customerToDelete.value) return
  isDeleteDialogOpen.value = false
  await deleteCustomer(customerToDelete.value.id)
  customerToDelete.value = null
}

const onCancelDelete = () => {
  isDeleteDialogOpen.value = false
  customerToDelete.value   = null
}

const onChangeStatus = async (customer, newStatus) => {
  await changeCustomerStatus(customer.id, newStatus)
}

// ── Date helper ────────────────────────────────────────────────────────────────
const formatDate = dateStr => {
  if (!dateStr) return '—'

  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

// ── Init ───────────────────────────────────────────────────────────────────────
onMounted(async () => {
  await loadTerritories()
  await fetchAllCustomers()
})
</script>

<template>
  <section>
    <!-- ── Summary Widget ────────────────────────────────────────────────── -->
    <VRow class="mb-6">
      <VCol
        cols="12"
        sm="6"
        md="3"
      >
        <VCard>
          <VCardText class="d-flex justify-space-between align-center">
            <div>
              <div class="text-body-2 text-medium-emphasis mb-1">
                Total Customers
              </div>
              <h4 class="text-h4">
                {{ totalCustomers }}
              </h4>
            </div>
            <VAvatar
              color="primary"
              variant="tonal"
              rounded
              size="44"
            >
              <VIcon
                icon="tabler-users-group"
                size="26"
              />
            </VAvatar>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>

    <!-- ── Main Card ─────────────────────────────────────────────────────── -->
    <VCard>
      <VCardItem class="pb-2">
        <VCardTitle>Customer Management</VCardTitle>
      </VCardItem>

      <!-- Filters -->
      <VCardText>
        <VRow>
          <!-- Territory filter -->
          <VCol
            cols="12"
            sm="4"
          >
            <AppSelect
              v-model="selectedTerritory"
              placeholder="Filter by Territory"
              :items="territoryItems"
              item-title="title"
              item-value="value"
              :loading="isTerritoriesLoading"
              clearable
              clear-icon="tabler-x"
            />
          </VCol>

          <!-- Status filter -->
          <VCol
            cols="12"
            sm="4"
          >
            <AppSelect
              v-model="selectedStatus"
              placeholder="Filter by Status"
              :items="CUSTOMER_STATUSES"
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
        <!-- Items per page -->
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

        <!-- Search -->
        <div style="inline-size: 15.625rem;">
          <AppTextField
            v-model="searchQuery"
            placeholder="Search customers…"
            prepend-inner-icon="tabler-search"
            clearable
          />
        </div>

        <!-- Add Customer — Admin only -->
        <VBtn
          v-if="isAdmin"
          prepend-icon="tabler-plus"
          @click="openCreate"
        >
          Add Customer
        </VBtn>
      </VCardText>

      <VDivider />

      <!-- Error state -->
      <VAlert
        v-if="listError"
        type="error"
        variant="tonal"
        class="ma-4"
        closable
      >
        {{ listError }}
      </VAlert>

      <!-- Data Table -->
      <VDataTableServer
        :headers="headers"
        :items="customers"
        :items-length="totalCustomers"
        :loading="isListLoading"
        :page="page"
        :items-per-page="itemsPerPage"
        item-value="id"
        class="text-no-wrap"
        hide-default-footer
        @update:options="updateOptions"
      >
        <!-- Loading -->
        <template #loading>
          <VSkeletonLoader type="table-row@8" />
        </template>

        <!-- Empty -->
        <template #no-data>
          <div class="d-flex flex-column align-center justify-center py-10 gap-3">
            <VIcon
              icon="tabler-users-group"
              size="48"
              color="secondary"
            />
            <p class="text-body-1 text-medium-emphasis mb-0">
              No customers found.
              <span v-if="!searchQuery && !selectedStatus && !selectedTerritory && isAdmin">
                Create your first customer to get started.
              </span>
            </p>
            <VBtn
              v-if="!searchQuery && !selectedStatus && !selectedTerritory && isAdmin"
              prepend-icon="tabler-plus"
              size="small"
              @click="openCreate"
            >
              Add Customer
            </VBtn>
          </div>
        </template>

        <!-- Customer (name) column -->
        <template #item.name="{ item }">
          <div class="d-flex align-center gap-x-3">
            <VAvatar
              size="36"
              :color="resolveCategoryVariant(item.category).color"
              variant="tonal"
            >
              <VIcon
                :icon="resolveCategoryVariant(item.category).icon"
                size="18"
              />
            </VAvatar>
            <div class="d-flex flex-column">
              <span class="text-body-1 font-weight-medium text-high-emphasis">
                {{ item.name }}
              </span>
              <span
                v-if="item.address"
                class="text-sm text-medium-emphasis"
              >{{ item.address }}</span>
            </div>
          </div>
        </template>

        <!-- Category column -->
        <template #item.category="{ item }">
          <div class="d-flex align-center gap-x-2">
            <VIcon
              :icon="resolveCategoryVariant(item.category).icon"
              :color="resolveCategoryVariant(item.category).color"
              size="20"
            />
            <span class="text-body-2 text-capitalize">
              {{ item.category?.toLowerCase() ?? '—' }}
            </span>
          </div>
        </template>

        <!-- Territory column -->
        <template #item.territoryId="{ item }">
          <VChip
            v-if="territoryMap[item.territoryId]"
            size="small"
            color="info"
            variant="tonal"
            label
          >
            <VIcon
              start
              icon="tabler-map-pin"
              size="12"
            />
            {{ territoryMap[item.territoryId] }}
          </VChip>
          <span
            v-else
            class="text-medium-emphasis"
          >—</span>
        </template>

        <!-- Phone column -->
        <template #item.phone="{ item }">
          <span class="text-body-2">{{ item.phone || '—' }}</span>
        </template>

        <!-- Status column -->
        <template #item.status="{ item }">
          <VChip
            :color="resolveStatusVariant(item.status)"
            size="small"
            label
            class="text-capitalize"
          >
            {{ item.status?.toLowerCase() ?? '—' }}
          </VChip>
        </template>

        <!-- Actions column -->
        <template #item.actions="{ item }">
          <div class="d-flex justify-end gap-1">
            <!-- Edit — Admin only -->
            <VTooltip
              v-if="isAdmin"
              text="Edit Customer"
            >
              <template #activator="{ props: tp }">
                <IconBtn
                  v-bind="tp"
                  :loading="isDetailLoading"
                  @click="openEdit(item)"
                >
                  <VIcon icon="tabler-edit" />
                </IconBtn>
              </template>
            </VTooltip>

            <!-- Status toggle dropdown -->
            <VBtn
              icon
              variant="text"
              color="medium-emphasis"
              size="small"
            >
              <VIcon icon="tabler-dots-vertical" />
              <VMenu activator="parent">
                <VList density="compact">
                  <!-- Toggle status options -->
                  <VListItem
                    v-for="s in CUSTOMER_STATUSES.filter(st => st.value !== item.status)"
                    :key="s.value"
                    @click="onChangeStatus(item, s.value)"
                  >
                    <template #prepend>
                      <VIcon
                        :icon="s.value === 'ACTIVE' ? 'tabler-user-check' : 'tabler-user-off'"
                        :color="resolveStatusVariant(s.value)"
                        size="16"
                      />
                    </template>
                    <VListItemTitle>Set {{ s.title }}</VListItemTitle>
                  </VListItem>

                  <template v-if="isAdmin">
                    <VDivider class="my-1" />
                    <!-- Delete — Admin only -->
                    <VListItem @click="onDelete(item)">
                      <template #prepend>
                        <VIcon
                          icon="tabler-trash"
                          color="error"
                          size="16"
                        />
                      </template>
                      <VListItemTitle class="text-error">
                        Delete
                      </VListItemTitle>
                    </VListItem>
                  </template>
                </VList>
              </VMenu>
            </VBtn>

            <!-- View only chip for non-admins -->
            <VChip
              v-if="!isAdmin"
              size="small"
              color="secondary"
              variant="tonal"
              label
            >
              View only
            </VChip>
          </div>
        </template>

        <!-- Pagination footer -->
        <template #bottom>
          <TablePagination
            v-model:page="page"
            :items-per-page="itemsPerPage"
            :total-items="totalCustomers"
          />
        </template>
      </VDataTableServer>
    </VCard>

    <!-- ── Customer Form Drawer ──────────────────────────────────────────── -->
    <CustomerFormDrawer
      v-model:is-drawer-open="isDrawerOpen"
      :customer="editingCustomer"
      :is-submitting="isSubmitting"
      :territories="territoriesList"
      @submit="onSubmit"
      @update:is-drawer-open="val => { if (!val) onDrawerClose() }"
    />

    <!-- ── Delete Confirmation Dialog ───────────────────────────────────── -->
    <VDialog
      v-model="isDeleteDialogOpen"
      max-width="440"
      persistent
    >
      <VCard>
        <VCardTitle class="d-flex align-center gap-2 pa-4">
          <VIcon
            icon="tabler-alert-triangle"
            color="error"
            size="24"
          />
          Delete Customer
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-4">
          <p class="mb-1">
            Are you sure you want to delete
            <strong>{{ customerToDelete?.name }}</strong>?
          </p>
          <p class="text-medium-emphasis text-body-2 mb-0">
            This action cannot be undone.
          </p>
        </VCardText>

        <VCardActions class="pa-4 pt-0 gap-2 justify-end">
          <VBtn
            variant="tonal"
            color="secondary"
            :disabled="isSubmitting"
            @click="onCancelDelete"
          >
            Cancel
          </VBtn>
          <VBtn
            color="error"
            :loading="isSubmitting"
            @click="onConfirmDelete"
          >
            <VIcon
              icon="tabler-trash"
              start
            />
            Delete
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- ── Snackbar ──────────────────────────────────────────────────────── -->
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
