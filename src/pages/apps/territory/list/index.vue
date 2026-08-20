<script setup>
/**
 * Territory List Page
 *
 * Route name: apps-territory-list  →  /apps/territory/list
 *
 * Access rules:
 *   - ADMIN / SALES_MANAGER / WAREHOUSE_MANAGER can VIEW the list
 *     (action: 'read', subject: 'Management' — SALES_REP is excluded)
 *   - Only ADMIN can CREATE / EDIT / DELETE (checked via useAuth userData.role)
 */

definePage({
  meta: {
    action: 'read',
    subject: 'Management',
  },
})

import TerritoryFormDrawer from '@/views/apps/territory/TerritoryFormDrawer.vue'
import { useTerritories } from '@/composables/useTerritories'
import { useAuth } from '@/composables/useAuth'
import { INTL_LOCALE } from '@/utils/locale'

// ── Auth — role guard for mutating actions ────────────────────────────────────
const { userData } = useAuth()
const isAdmin = computed(() => userData.value?.role?.toLowerCase() === 'admin')

// ── Composable ─────────────────────────────────────────────────────────────────
const {
  territories,
  totalTerritories,
  isListLoading,
  listError,
  page,
  itemsPerPage,
  search,
  editingTerritory,
  isDetailLoading,
  isSubmitting,
  snackbar,
  fetchAllTerritories,
  fetchTerritory,
  createTerritory,
  updateTerritory,
  deleteTerritory,
  clearEditing,
} = useTerritories()

// ── Table Headers ──────────────────────────────────────────────────────────────
const headers = [
  { title: 'الاسم',        key: 'name',         sortable: false                },
  { title: 'الوصف', key: 'description',  sortable: false                },
  { title: 'تاريخ الإنشاء',     key: 'createdAt',    sortable: false                },
  { title: 'تاريخ التحديث',     key: 'updatedAt',    sortable: false                },
  { title: 'الإجراءات',     key: 'actions',      sortable: false, align: 'end'  },
]

// ── Drawer State ───────────────────────────────────────────────────────────────
const isDrawerOpen = ref(false)

// ── Delete Confirmation Dialog State ──────────────────────────────────────────
const isDeleteDialogOpen  = ref(false)
const territoryToDelete   = ref(null)   // { id, name } of the row pending deletion

// ── Handlers ───────────────────────────────────────────────────────────────────

/** Open drawer in CREATE mode */
const openCreate = () => {
  clearEditing()
  isDrawerOpen.value = true
}

/** Open drawer in EDIT mode — fetch latest data first */
const openEdit = async territory => {
  isDrawerOpen.value = true

  // The row already holds the full TerritoryResponse, so it seeds the form
  // immediately; the request that follows refreshes it from the server.
  await fetchTerritory(territory.id, territory)
}

/** Unified submit from drawer — create or update based on mode */
const onSubmit = async ({ id, name, description }) => {
  let result

  if (id) {
    result = await updateTerritory(id, { name, description })
  } else {
    result = await createTerritory({ name, description })
  }

  if (result.success) {
    isDrawerOpen.value = false
    clearEditing()
  }
}

/** Close drawer and clear state */
const onDrawerClose = () => {
  isDrawerOpen.value = false
  clearEditing()
}

/** Show delete confirmation dialog */
const onDelete = territory => {
  territoryToDelete.value  = territory
  isDeleteDialogOpen.value = true
}

/** Confirmed delete — called when user clicks 'حذف' in the dialog */
const onConfirmDelete = async () => {
  if (!territoryToDelete.value) return
  isDeleteDialogOpen.value = false
  await deleteTerritory(territoryToDelete.value.id)
  territoryToDelete.value = null
}

/** Cancel delete dialog */
const onCancelDelete = () => {
  isDeleteDialogOpen.value = false
  territoryToDelete.value  = null
}

// ── Formatted date helper ──────────────────────────────────────────────────────
const formatDate = dateStr => {
  if (!dateStr) return '—'

  return new Date(dateStr).toLocaleDateString(INTL_LOCALE, {
    year:  'numeric',
    month: 'short',
    day:   'numeric',
  })
}

// ── Fetch on mount ─────────────────────────────────────────────────────────────
onMounted(fetchAllTerritories)
</script>

<template>
  <section>
    <!-- ── Page Header Widget ──────────────────────────────────────────────── -->
    <VRow class="mb-6">
      <VCol
        cols="12"
        sm="6"
        md="4"
      >
        <VCard>
          <VCardText class="d-flex justify-space-between align-center">
            <div>
              <div class="text-body-2 text-medium-emphasis mb-1">
                إجمالي المناطق
              </div>
              <h4 class="text-h4">
                {{ totalTerritories }}
              </h4>
            </div>
            <VAvatar
              color="primary"
              variant="tonal"
              rounded
              size="44"
            >
              <VIcon
                icon="tabler-map-pins"
                size="26"
              />
            </VAvatar>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>

    <!-- ── Main Card ────────────────────────────────────────────────────────── -->
    <VCard>
      <VCardItem class="pb-2">
        <VCardTitle>إدارة المناطق</VCardTitle>
      </VCardItem>

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
        <AppTextField
          v-model="search"
          placeholder="ابحث عن منطقة…"
          prepend-inner-icon="tabler-search"
          style="inline-size: 15rem;"
          clearable
          @click:clear="search = ''"
        />

        <!-- Add Territory — Admin only -->
        <VBtn
          v-if="isAdmin"
          prepend-icon="tabler-plus"
          @click="openCreate"
        >
          إضافة منطقة
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
        VDataTableServer — server-side pagination.
        We disable the built-in footer and render our own TablePagination.
      -->
      <VDataTableServer
        :headers="headers"
        :items="territories"
        :items-length="totalTerritories"
        :loading="isListLoading"
        :page="page"
        :items-per-page="itemsPerPage"
        item-value="id"
        class="text-no-wrap"
        hide-default-footer
      >
        <!-- Loading overlay -->
        <template #loading>
          <VSkeletonLoader type="table-row@8" />
        </template>

        <!-- Empty state -->
        <template #no-data>
          <div class="d-flex flex-column align-center justify-center py-10 gap-3">
            <VIcon
              icon="tabler-map-off"
              size="48"
              color="secondary"
            />
            <p class="text-body-1 text-medium-emphasis mb-0">
              <template v-if="search">
                لا توجد مناطق مطابقة لـ &laquo;<strong>{{ search }}</strong>&raquo;.
              </template>
              <template v-else>
                لا توجد مناطق.
                <span v-if="isAdmin">أنشئ أول منطقة للبدء.</span>
              </template>
            </p>
            <VBtn
              v-if="isAdmin && !search"
              prepend-icon="tabler-plus"
              size="small"
              @click="openCreate"
            >
              إضافة منطقة
            </VBtn>
          </div>
        </template>

        <!-- Name column -->
        <template #item.name="{ item }">
          <div class="d-flex align-center gap-x-3">
            <VAvatar
              size="36"
              color="primary"
              variant="tonal"
            >
              <VIcon
                icon="tabler-map-pin"
                size="18"
              />
            </VAvatar>
            <span class="text-body-1 font-weight-medium text-high-emphasis">
              {{ item.name }}
            </span>
          </div>
        </template>

        <!-- Description column -->
        <template #item.description="{ item }">
          <span
            class="text-body-2 text-medium-emphasis"
            style="max-inline-size: 300px; display: inline-block; white-space: normal;"
          >
            {{ item.description || '—' }}
          </span>
        </template>

        <!-- Created At column -->
        <template #item.createdAt="{ item }">
          <span class="text-body-2 text-medium-emphasis">
            {{ formatDate(item.createdAt) }}
          </span>
        </template>

        <!-- Updated At column -->
        <template #item.updatedAt="{ item }">
          <span class="text-body-2 text-medium-emphasis">
            {{ formatDate(item.updatedAt) }}
          </span>
        </template>

        <!-- Actions column — Edit & Delete visible only to Admin -->
        <template #item.actions="{ item }">
          <div class="d-flex justify-end gap-1">
            <!-- Edit — Admin only -->
            <VTooltip
              v-if="isAdmin"
              text="تعديل المنطقة"
            >
              <template #activator="{ props: tooltipProps }">
                <IconBtn
                  v-bind="tooltipProps"
                  :loading="isDetailLoading"
                  @click="openEdit(item)"
                >
                  <VIcon icon="tabler-edit" />
                </IconBtn>
              </template>
            </VTooltip>

            <!-- Delete — Admin only -->
            <VTooltip
              v-if="isAdmin"
              text="حذف المنطقة"
            >
              <template #activator="{ props: tooltipProps }">
                <IconBtn
                  v-bind="tooltipProps"
                  color="error"
                  :disabled="isSubmitting"
                  @click="onDelete(item)"
                >
                  <VIcon icon="tabler-trash" />
                </IconBtn>
              </template>
            </VTooltip>

            <!-- Non-admin: read-only indicator -->
            <VChip
              v-if="!isAdmin"
              size="small"
              color="secondary"
              variant="tonal"
              label
            >
              عرض فقط
            </VChip>
          </div>
        </template>

        <!-- Pagination footer -->
        <template #bottom>
          <TablePagination
            v-model:page="page"
            :items-per-page="itemsPerPage"
            :total-items="totalTerritories"
          />
        </template>
      </VDataTableServer>
    </VCard>

    <!-- ── Territory Form Drawer (Create / Edit) ─────────────────────────── -->
    <TerritoryFormDrawer
      v-model:is-drawer-open="isDrawerOpen"
      :territory="editingTerritory"
      :is-submitting="isSubmitting"
      @submit="onSubmit"
      @update:is-drawer-open="val => { if (!val) onDrawerClose() }"
    />

    <!-- ── Delete Confirmation Dialog ────────────────────────────────────── -->
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
          حذف المنطقة
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-4">
          <p class="mb-1">
            هل أنت متأكد من حذف
            <strong>{{ territoryToDelete?.name }}</strong>?
          </p>
          <p class="text-medium-emphasis text-body-2 mb-0">
            لا يمكن التراجع عن هذا الإجراء.
          </p>
        </VCardText>

        <VCardActions class="pa-4 pt-0 gap-2 justify-end">
          <VBtn
            variant="tonal"
            color="secondary"
            :disabled="isSubmitting"
            @click="onCancelDelete"
          >
            إلغاء
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
            حذف
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- ── Global Snackbar ────────────────────────────────────────────────── -->
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
