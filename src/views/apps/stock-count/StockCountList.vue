<script setup>
/**
 * StockCountList.vue
 *
 * Main view for the Stock Counts module (physical warehouse stock-take).
 *
 * ⚠️ Unlike the other list screens this one is CLIENT-side paginated and sorted
 * (VDataTable, not VDataTableServer): GET /stock-counts answers with a plain
 * array, so there is no page to ask the server for.
 *
 * Row actions:
 *   - View Details → read-only modal with the nested lines
 *   - Edit Lines   → form drawer, DRAFT only (PUT replaces the whole line set)
 *   - Finalize     → POST /finalize, DRAFT only, behind a SweetAlert2 confirm
 *
 * All Axios access lives in the service layer; all state/business logic lives in
 * useStockCounts. This view only wires UI events to the composable.
 */

import StockCountFormDrawer from '@/views/apps/stock-count/StockCountFormDrawer.vue'
import StockCountDetailsModal from '@/views/apps/stock-count/StockCountDetailsModal.vue'
import {
  useStockCounts,
  STOCK_COUNT_STATUSES,
  isDraftCount,
  resolveStockCountStatusTitle,
  resolveStockCountStatusVariant,
} from '@/composables/useStockCounts'
import { useAuth } from '@/composables/useAuth'
import { confirmAction } from '@/utils/swal'
import { INTL_LOCALE } from '@/utils/locale'

// ── Auth — role guard for mutating actions ───────────────────────────────────
// The route itself is gated on `read: StockCounts`, which ADMIN,
// WAREHOUSE_MANAGER and SALES_MANAGER all hold — the list and detail endpoints
// admit all three. Create / edit-lines / finalize do NOT: they are
// ADMIN + WAREHOUSE_MANAGER, so SALES_MANAGER gets a read-only page and every
// write control below hangs off this flag.
const { userData } = useAuth()

const STOCK_MANAGER_ROLES = ['admin', 'warehouse_manager']

const canManageCounts = computed(() =>
  STOCK_MANAGER_ROLES.includes(userData.value?.role?.toLowerCase()))

// ── Composable ────────────────────────────────────────────────────────────────
const {
  counts,
  filteredCounts,
  totalCounts,
  draftTotal,
  isListLoading,
  listError,
  selectedStatus,
  countDate,
  page,
  itemsPerPage,
  selectedCount,
  isDetailLoading,
  isSubmitting,
  snackbar,
  fetchAllCounts,
  fetchCount,
  createCount,
  saveLines,
  finalizeCount,
  clearSelected,
} = useStockCounts()

// ── Table Headers ─────────────────────────────────────────────────────────────
const headers = [
  { title: 'رقم الجرد', key: 'id',          sortable: true  },
  { title: 'تاريخ الجرد', key: 'countDate',   sortable: true  },
  { title: 'عدد الأصناف', key: 'lineCount',   sortable: true  },
  { title: 'الحالة',    key: 'status',      sortable: true  },
  { title: 'تاريخ الاعتماد', key: 'finalizedAt', sortable: true  },
  { title: 'الإجراءات', key: 'actions',     sortable: false, align: 'end' },
]

// VDataTable sorts on the raw item values, so the "عدد الأصناف" column needs a
// real key on the row rather than a slot-only computation.
const tableItems = computed(() =>
  filteredCounts.value.map(c => ({ ...c, lineCount: c.lines?.length ?? 0 })))

// ── Drawer / Modal State ──────────────────────────────────────────────────────
const isDrawerOpen  = ref(false)
const isModalOpen   = ref(false)
const editingCount  = ref(null)   // null → create mode

const openCreate = () => {
  editingCount.value  = null
  isDrawerOpen.value  = true
}

const openEdit = count => {
  editingCount.value = { ...count }
  isDrawerOpen.value = true
}

/** One submit handler for both drawer modes — the payload shape tells them apart. */
const onSubmit = async payload => {
  const result = editingCount.value
    ? await saveLines(editingCount.value.id, payload.lines)
    : await createCount(payload)

  if (result.success) {
    isDrawerOpen.value = false
    editingCount.value = null
  }
}

const openDetails = async count => {
  isModalOpen.value = true
  await fetchCount(count.id)
}

const onModalToggle = val => {
  isModalOpen.value = val
  if (!val) clearSelected()
}

// ── Finalize — SweetAlert2 confirmation before POST /finalize ─────────────────
const onFinalize = async count => {
  const lineCount = count.lines?.length ?? 0

  const confirmed = await confirmAction({
    title: `اعتماد عملية الجرد رقم ${count.id}؟`,
    text: `سيقارن النظام ${lineCount} سطرًا بكميات المخزون المسجّلة ويحتسب الفروقات. لا يمكن التراجع عن هذا الإجراء ولا تعديل الأسطر بعده.`,
    confirmText: 'اعتماد الجرد',
    icon: 'warning',
  })

  if (!confirmed) return

  const result = await finalizeCount(count.id)

  // Jump straight to the variances the finalize just produced — that result is
  // the whole point of finalizing, and it is not visible anywhere in the row.
  if (result.success) {
    isModalOpen.value = true
    await fetchCount(count.id)
  }
}

// ── Formatters ────────────────────────────────────────────────────────────────
const formatDate = value => {
  if (!value) return '—'

  const d = new Date(value)

  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat(INTL_LOCALE, {
    year: 'numeric', month: 'short', day: '2-digit',
  }).format(d)
}

const formatDateTime = value => {
  if (!value) return '—'

  const d = new Date(value)

  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat(INTL_LOCALE, {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(d)
}

onMounted(fetchAllCounts)
</script>

<template>
  <section>
    <!--
      ── Summary Widgets ──────────────────────────────────────────────────────
      Deliberately unfiltered: these are at-a-glance totals, and having them
      jump around as filters are applied would make them unreadable. The count
      for the current filter is already in the table's own footer.
    -->
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
                عمليات الجرد
              </div>
              <h4 class="text-h4">
                {{ counts.length }}
              </h4>
            </div>
            <VAvatar
              color="primary"
              variant="tonal"
              rounded
              size="44"
            >
              <VIcon
                icon="tabler-clipboard-list"
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
                مسودات بانتظار الاعتماد
              </div>
              <h4 class="text-h4">
                {{ draftTotal }}
              </h4>
            </div>
            <VAvatar
              color="warning"
              variant="tonal"
              rounded
              size="44"
            >
              <VIcon
                icon="tabler-file-pencil"
                size="26"
              />
            </VAvatar>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>

    <!-- ── Main Card ───────────────────────────────────────────────────────── -->
    <VCard>
      <VCardItem class="pb-2">
        <VCardTitle>جرد المخزون</VCardTitle>
        <template #append>
          <VBtn
            v-if="canManageCounts"
            prepend-icon="tabler-plus"
            @click="openCreate"
          >
            عملية جرد جديدة
          </VBtn>

          <!--
            Read-only roles (SALES_MANAGER) — say so instead of just showing a
            page with no controls on it.
          -->
          <VChip
            v-else
            size="small"
            color="secondary"
            variant="tonal"
            label
          >
            عرض فقط
          </VChip>
        </template>
      </VCardItem>

      <!-- Filters -->
      <VCardText>
        <VRow>
          <VCol
            cols="12"
            sm="6"
          >
            <AppSelect
              v-model="selectedStatus"
              placeholder="تصفية حسب الحالة"
              :items="STOCK_COUNT_STATUSES"
              item-title="title"
              item-value="value"
              clearable
              clear-icon="tabler-x"
            />
          </VCol>
          <VCol
            cols="12"
            sm="6"
          >
            <AppDateTimePicker
              v-model="countDate"
              placeholder="تصفية حسب تاريخ الجرد"
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
          variant="tonal"
          color="secondary"
          prepend-icon="tabler-refresh"
          :loading="isListLoading"
          @click="fetchAllCounts"
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

      <!--
        VDataTable (client-side): GET /stock-counts is not paginated, so sorting
        and paging both run over the array we already hold. Our own
        TablePagination replaces the built-in footer, as everywhere else.
      -->
      <VDataTable
        v-model:page="page"
        :headers="headers"
        :items="tableItems"
        :loading="isListLoading"
        :items-per-page="itemsPerPage"
        item-value="id"
        class="text-no-wrap"
        hide-default-footer
      >
        <template #loading>
          <VSkeletonLoader type="table-row@8" />
        </template>

        <template #no-data>
          <div class="d-flex flex-column align-center justify-center py-10 gap-3">
            <VIcon
              icon="tabler-clipboard-off"
              size="48"
              color="secondary"
            />
            <p class="text-body-1 text-medium-emphasis mb-0">
              <template v-if="selectedStatus || countDate">
                لا توجد عمليات جرد مطابقة لعوامل التصفية.
              </template>
              <template v-else>
                لا توجد عمليات جرد بعد.
              </template>
            </p>
            <VBtn
              v-if="canManageCounts && !selectedStatus && !countDate"
              prepend-icon="tabler-plus"
              size="small"
              @click="openCreate"
            >
              عملية جرد جديدة
            </VBtn>
          </div>
        </template>

        <!-- Count id column -->
        <template #item.id="{ item }">
          <div class="d-flex align-center gap-x-3">
            <VAvatar
              size="32"
              :color="resolveStockCountStatusVariant(item.status)"
              variant="tonal"
            >
              <VIcon
                icon="tabler-clipboard-list"
                size="18"
              />
            </VAvatar>
            <span class="text-body-1 font-weight-medium text-high-emphasis">
              #{{ item.id }}
            </span>
          </div>
        </template>

        <!-- Count date column -->
        <template #item.countDate="{ item }">
          <span class="text-body-2">{{ formatDate(item.countDate) }}</span>
        </template>

        <!-- Line count column -->
        <template #item.lineCount="{ item }">
          <span class="text-body-2 text-medium-emphasis">{{ item.lineCount }}</span>
        </template>

        <!-- Status column -->
        <template #item.status="{ item }">
          <VChip
            :color="resolveStockCountStatusVariant(item.status)"
            size="small"
            label
          >
            {{ resolveStockCountStatusTitle(item.status) }}
          </VChip>
        </template>

        <!-- Finalized-at column -->
        <template #item.finalizedAt="{ item }">
          <span class="text-body-2 text-medium-emphasis">{{ formatDateTime(item.finalizedAt) }}</span>
        </template>

        <!-- Actions column -->
        <template #item.actions="{ item }">
          <div class="d-flex justify-end gap-1">
            <VTooltip text="عرض التفاصيل">
              <template #activator="{ props: tp }">
                <IconBtn
                  v-bind="tp"
                  @click="openDetails(item)"
                >
                  <VIcon icon="tabler-eye" />
                </IconBtn>
              </template>
            </VTooltip>

            <template v-if="canManageCounts && isDraftCount(item)">
              <!-- Edit lines -->
              <VTooltip text="تعديل الأسطر">
                <template #activator="{ props: tp }">
                  <IconBtn
                    v-bind="tp"
                    color="primary"
                    @click="openEdit(item)"
                  >
                    <VIcon icon="tabler-pencil" />
                  </IconBtn>
                </template>
              </VTooltip>

              <!-- Finalize -->
              <VTooltip text="اعتماد الجرد">
                <template #activator="{ props: tp }">
                  <IconBtn
                    v-bind="tp"
                    color="success"
                    @click="onFinalize(item)"
                  >
                    <VIcon icon="tabler-checkbox" />
                  </IconBtn>
                </template>
              </VTooltip>
            </template>
          </div>
        </template>

        <!-- Pagination footer -->
        <template #bottom>
          <TablePagination
            v-model:page="page"
            :items-per-page="itemsPerPage"
            :total-items="totalCounts"
          />
        </template>
      </VDataTable>
    </VCard>

    <!-- ── Create / Edit Drawer ────────────────────────────────────────────── -->
    <StockCountFormDrawer
      v-model:is-drawer-open="isDrawerOpen"
      :count="editingCount"
      :is-submitting="isSubmitting"
      @submit="onSubmit"
    />

    <!-- ── Details Modal ──────────────────────────────────────────────────── -->
    <StockCountDetailsModal
      :is-dialog-open="isModalOpen"
      :count="selectedCount"
      :is-loading="isDetailLoading"
      @update:is-dialog-open="onModalToggle"
    />

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
