<script setup>
definePage({
  meta: {
    action: 'manage',
    subject: 'all',
  },
})
import AddNewUserDrawer from '@/views/apps/user/list/AddNewUserDrawer.vue'
import UserDetailDialog from '@/views/apps/user/list/UserDetailDialog.vue'
import { INTL_LOCALE } from '@/utils/locale'
import {
  useUsers,
  resolveRoleVariant,
  resolveRoleTitle,
  resolveUserStatusVariant,
  resolveStatusTitle,
  USER_ROLES,
  USER_STATUSES,
} from '@/composables/useUsers'

// ── Composable ────────────────────────────────────────────────────────────────
const {
  paginatedUsers,
  totalUsers,
  counts,
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
  { title: 'المستخدم',    key: 'name',      sortable: true  },
  { title: 'الدور',    key: 'role',      sortable: true  },
  { title: 'الحالة',  key: 'status',    sortable: true  },
  { title: 'تاريخ الإنشاء', key: 'createdAt', sortable: true  },
  { title: 'الإجراءات', key: 'actions',   sortable: false, align: 'end' },
]

// ── Drawer & Dialog State ─────────────────────────────────────────────────────
const isAddDrawerOpen    = ref(false)
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

  return new Date(dateStr).toLocaleDateString(INTL_LOCALE, {
    year:  'numeric',
    month: 'short',
    day:   'numeric',
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
                إجمالي المستخدمين
              </div>
              <h4 class="text-h4">
                {{ counts.total }}
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
                نشط
              </div>
              <h4 class="text-h4">
                {{ counts.active }}
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
                غير نشط
              </div>
              <h4 class="text-h4">
                {{ counts.inactive }}
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
                موقوف
              </div>
              <h4 class="text-h4">
                {{ counts.suspended }}
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
        <VCardTitle>إدارة المستخدمين</VCardTitle>
      </VCardItem>

      <VCardText>
        <VRow>
          <VCol
            cols="12"
            sm="4"
          >
            <AppSelect
              v-model="selectedRole"
              placeholder="تصفية حسب الدور"
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
              placeholder="تصفية حسب الحالة"
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
          ]"
          style="inline-size: 6.25rem;"
          @update:model-value="itemsPerPage = parseInt($event, 10)"
        />

        <VSpacer />

        <!-- Search -->
        <div style="inline-size: 15.625rem;">
          <AppTextField
            v-model="searchQuery"
            placeholder="ابحث بالاسم أو البريد الإلكتروني…"
            prepend-inner-icon="tabler-search"
            clearable
          />
        </div>

        <!-- Add user -->
        <VBtn
          prepend-icon="tabler-plus"
          @click="isAddDrawerOpen = true"
        >
          إضافة مستخدم
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

      <!--
        VDataTableServer: server-side pagination/sorting.
        - :items-length  = total record count from the server
        - @update:options fires when user changes page / sort inside the table
        - We disable the built-in footer and render our own TablePagination below.
      -->
      <VDataTableServer
        :headers="headers"
        :items="paginatedUsers"
        :items-length="totalUsers"
        :loading="isListLoading"
        :page="page"
        :items-per-page="itemsPerPage"
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
                ? 'لا يوجد مستخدمون مطابقون لعوامل التصفية'
                : 'لا يوجد مستخدمون. أنشئ أول مستخدم.' }}
            </p>
            <VBtn
              v-if="!searchQuery && !selectedRole && !selectedStatus"
              prepend-icon="tabler-plus"
              size="small"
              @click="isAddDrawerOpen = true"
            >
              إضافة مستخدم
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
            :color="resolveUserStatusVariant(item.status)"
            size="small"
            label
          >
            {{ resolveStatusTitle(item.status) }}
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
            <VTooltip text="عرض التفاصيل">
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
                    <VListItemTitle>عرض التفاصيل</VListItemTitle>
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
                        :color="resolveUserStatusVariant(s.value)"
                      />
                    </template>
                    <VListItemTitle>تعيين كـ {{ s.title }}</VListItemTitle>
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
      </VDataTableServer>
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
      :is-loading="isDetailLoading"
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
