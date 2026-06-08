<script setup>
definePage({
  meta: {
    action: 'manage',
    subject: 'all',
  },
})
import AddNewUserDrawer from '@/views/apps/user/list/AddNewUserDrawer.vue'
import UserDetailDialog from '@/views/apps/user/list/UserDetailDialog.vue'
import {
  useUsers,
  resolveRoleVariant,
  resolveRoleTitle,
  resolveStatusVariant,
  USER_ROLES,
  USER_STATUSES,
} from '@/composables/useUsers'

// ── Composable ────────────────────────────────────────────────────────────────
const {
  paginatedUsers,
  totalUsers,
  isListLoading,
  listError,
  searchQuery,
  selectedRole,
  selectedStatus,
  page,
  itemsPerPage,
  isSubmitting,
  snackbar,
  selectedUser,
  isDetailLoading,
  updateOptions,
  fetchAllUsers,
  fetchUser,
  createUser,
  changeUserStatus,
  resetPassword,
} = useUsers()

// ── Table Headers ─────────────────────────────────────────────────────────────
const headers = [
  { title: 'User', key: 'name', sortable: true },
  { title: 'Role', key: 'role', sortable: true },
  { title: 'Status', key: 'status', sortable: true },
  { title: 'Created', key: 'createdAt', sortable: true },
  { title: 'Actions', key: 'actions', sortable: false, align: 'end' },
]

// ── Drawer & Dialog State ─────────────────────────────────────────────────────
const isAddDrawerOpen = ref(false)
const isDetailDialogOpen = ref(false)

// ── Handlers ──────────────────────────────────────────────────────────────────
const openDetail = async user => {
  isDetailDialogOpen.value = true
  await fetchUser(user.id)
}

const onCreateUser = async payload => {
  const result = await createUser(payload)
  if (result.success) isAddDrawerOpen.value = false
}

const onChangeStatus = async (id, status) => {
  const result = await changeUserStatus(id, status)
  if (result.success) isDetailDialogOpen.value = false
}

const onResetPassword = async (id, newPassword) => {
  const result = await resetPassword(id, newPassword)
  if (result.success) isDetailDialogOpen.value = false
}

// ── Formatted date helper ─────────────────────────────────────────────────────
const formatDate = dateStr => {
  if (!dateStr) return '—'

  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// ── Fetch on mount ────────────────────────────────────────────────────────────
onMounted(fetchAllUsers)
</script>

<template>
  <section>
    <!-- ── Summary Widgets ──────────────────────────────────────────────────── -->
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
                Total Users
              </div>
              <h4 class="text-h4">
                {{ totalUsers }}
              </h4>
            </div>
            <VAvatar
              color="primary"
              variant="tonal"
              rounded
              size="44"
            >
              <VIcon
                icon="tabler-users"
                size="26"
              />
            </VAvatar>
          </VCardText>
        </VCard>
      </VCol>

      <VCol
        cols="12"
        sm="6"
        md="3"
      >
        <VCard>
          <VCardText class="d-flex justify-space-between align-center">
            <div>
              <div class="text-body-2 text-medium-emphasis mb-1">
                Active
              </div>
              <h4 class="text-h4">
                {{ paginatedUsers.filter(u => u.status === 'ACTIVE').length }}
              </h4>
            </div>
            <VAvatar
              color="success"
              variant="tonal"
              rounded
              size="44"
            >
              <VIcon
                icon="tabler-user-check"
                size="26"
              />
            </VAvatar>
          </VCardText>
        </VCard>
      </VCol>

      <VCol
        cols="12"
        sm="6"
        md="3"
      >
        <VCard>
          <VCardText class="d-flex justify-space-between align-center">
            <div>
              <div class="text-body-2 text-medium-emphasis mb-1">
                Inactive
              </div>
              <h4 class="text-h4">
                {{ paginatedUsers.filter(u => u.status === 'INACTIVE').length }}
              </h4>
            </div>
            <VAvatar
              color="secondary"
              variant="tonal"
              rounded
              size="44"
            >
              <VIcon
                icon="tabler-user-off"
                size="26"
              />
            </VAvatar>
          </VCardText>
        </VCard>
      </VCol>

      <VCol
        cols="12"
        sm="6"
        md="3"
      >
        <VCard>
          <VCardText class="d-flex justify-space-between align-center">
            <div>
              <div class="text-body-2 text-medium-emphasis mb-1">
                Suspended
              </div>
              <h4 class="text-h4">
                {{ paginatedUsers.filter(u => u.status === 'SUSPENDED').length }}
              </h4>
            </div>
            <VAvatar
              color="error"
              variant="tonal"
              rounded
              size="44"
            >
              <VIcon
                icon="tabler-user-x"
                size="26"
              />
            </VAvatar>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>

    <!-- ── Main Card ────────────────────────────────────────────────────────── -->
    <VCard>
      <!-- Filters -->
      <VCardItem class="pb-2">
        <VCardTitle>User Management</VCardTitle>
      </VCardItem>

      <VCardText>
        <VRow>
          <VCol
            cols="12"
            sm="4"
          >
            <AppSelect
              v-model="selectedRole"
              placeholder="Filter by Role"
              :items="USER_ROLES"
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
            <AppSelect
              v-model="selectedStatus"
              placeholder="Filter by Status"
              :items="USER_STATUSES"
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
            { value: -1, title: 'All' },
          ]"
          style="inline-size: 6.25rem;"
          @update:model-value="itemsPerPage = parseInt($event, 10)"
        />

        <VSpacer />

        <!-- Search -->
        <div style="inline-size: 15.625rem;">
          <AppTextField
            v-model="searchQuery"
            placeholder="Search by name or email…"
            prepend-inner-icon="tabler-search"
            clearable
          />
        </div>

        <!-- Add user -->
        <VBtn
          prepend-icon="tabler-plus"
          @click="isAddDrawerOpen = true"
        >
          Add User
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
      <VDataTable
        :headers="headers"
        :items="paginatedUsers"
        :loading="isListLoading"
        item-value="id"
        class="text-no-wrap"
        hide-default-footer
        @update:options="updateOptions"
      >
        <!-- Loading overlay -->
        <template #loading>
          <VSkeletonLoader type="table-row@8" />
        </template>

        <!-- Empty state -->
        <template #no-data>
          <div class="d-flex flex-column align-center justify-center py-10 gap-3">
            <VIcon
              icon="tabler-users-group"
              size="48"
              color="secondary"
            />
            <p class="text-body-1 text-medium-emphasis mb-0">
              {{ searchQuery || selectedRole || selectedStatus
                ? 'No users match your filters'
                : 'No users found. Create your first user.' }}
            </p>
            <VBtn
              v-if="!searchQuery && !selectedRole && !selectedStatus"
              prepend-icon="tabler-plus"
              size="small"
              @click="isAddDrawerOpen = true"
            >
              Add User
            </VBtn>
          </div>
        </template>

        <!-- User column -->
        <template #item.name="{ item }">
          <div class="d-flex align-center gap-x-3">
            <VAvatar
              size="36"
              :color="resolveRoleVariant(item.role).color"
              variant="tonal"
            >
              <VIcon
                :icon="resolveRoleVariant(item.role).icon"
                size="18"
              />
            </VAvatar>
            <div class="d-flex flex-column">
              <span class="text-body-1 font-weight-medium text-high-emphasis">
                {{ item.name }}
              </span>
              <span class="text-sm text-medium-emphasis">{{ item.email }}</span>
            </div>
          </div>
        </template>

        <!-- Role column -->
        <template #item.role="{ item }">
          <div class="d-flex align-center gap-x-2">
            <VIcon
              :icon="resolveRoleVariant(item.role).icon"
              :color="resolveRoleVariant(item.role).color"
              size="20"
            />
            <span class="text-body-1">{{ resolveRoleTitle(item.role) }}</span>
          </div>
        </template>

        <!-- Status column -->
        <template #item.status="{ item }">
          <VChip
            :color="resolveStatusVariant(item.status)"
            size="small"
            label
            class="text-capitalize"
          >
            {{ item.status }}
          </VChip>
        </template>

        <!-- Created At column -->
        <template #item.createdAt="{ item }">
          <span class="text-body-2 text-medium-emphasis">
            {{ formatDate(item.createdAt) }}
          </span>
        </template>

        <!-- Actions column -->
        <template #item.actions="{ item }">
          <div class="d-flex justify-end gap-1">
            <!-- View / Edit -->
            <VTooltip text="View Details">
              <template #activator="{ props: tooltipProps }">
                <IconBtn
                  v-bind="tooltipProps"
                  @click="openDetail(item)"
                >
                  <VIcon icon="tabler-eye" />
                </IconBtn>
              </template>
            </VTooltip>

            <!-- Quick status toggle dropdown -->
            <VBtn
              icon
              variant="text"
              color="medium-emphasis"
              size="small"
            >
              <VIcon icon="tabler-dots-vertical" />
              <VMenu activator="parent">
                <VList density="compact">
                  <!-- View -->
                  <VListItem @click="openDetail(item)">
                    <template #prepend>
                      <VIcon
                        icon="tabler-eye"
                        size="16"
                      />
                    </template>
                    <VListItemTitle>View Details</VListItemTitle>
                  </VListItem>

                  <VDivider class="my-1" />

                  <!-- Status options -->
                  <VListItem
                    v-for="s in USER_STATUSES.filter(st => st.value !== item.status)"
                    :key="s.value"
                    @click="changeUserStatus(item.id, s.value)"
                  >
                    <template #prepend>
                      <VIcon
                        :icon="s.value === 'ACTIVE' ? 'tabler-user-check' : s.value === 'SUSPENDED' ? 'tabler-user-x' : 'tabler-user-off'"
                        size="16"
                        :color="resolveStatusVariant(s.value)"
                      />
                    </template>
                    <VListItemTitle>Set {{ s.title }}</VListItemTitle>
                  </VListItem>
                </VList>
              </VMenu>
            </VBtn>
          </div>
        </template>

        <!-- Pagination footer -->
        <template #bottom>
          <TablePagination
            v-model:page="page"
            :items-per-page="itemsPerPage"
            :total-items="totalUsers"
          />
        </template>
      </VDataTable>
    </VCard>

    <!-- ── Add New User Drawer ───────────────────────────────────────────────── -->
    <AddNewUserDrawer
      v-model:is-drawer-open="isAddDrawerOpen"
      :is-submitting="isSubmitting"
      @submit="onCreateUser"
    />

    <!-- ── User Detail / Edit Dialog ─────────────────────────────────────────── -->
    <UserDetailDialog
      v-model="isDetailDialogOpen"
      :user="selectedUser"
      :is-submitting="isSubmitting"
      @change-status="onChangeStatus"
      @reset-password="onResetPassword"
    />

    <!-- ── Global Snackbar ───────────────────────────────────────────────────── -->
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
