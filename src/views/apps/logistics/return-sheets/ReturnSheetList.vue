<script setup>
/**
 * ReturnSheetList.vue
 *
 * Return Sheets list (Van → Warehouse). Server-side paginated/sorted table with
 * Status / Date / Rep ID filters. Row actions:
 *   - View Details   → details modal (nested lines)
 *   - Complete Return → POST /complete, only when status === 'DRAFT', SweetAlert2 confirm
 */

import ReturnSheetFormDrawer from '@/views/apps/logistics/return-sheets/ReturnSheetFormDrawer.vue'
import ReturnSheetDetailsModal from '@/views/apps/logistics/return-sheets/ReturnSheetDetailsModal.vue'
import RepresentativeSelect from '@/views/apps/logistics/RepresentativeSelect.vue'
import {
  useReturnSheets,
  RETURN_SHEET_STATUSES,
  resolveReturnStatusVariant,
} from '@/composables/useReturnSheets'
import { confirmAction } from '@/utils/swal'
import { INTL_LOCALE } from '@/utils/locale'

const {
  sheets,
  totalSheets,
  isListLoading,
  listError,
  selectedStatus,
  returnDate,
  repIdFilter,
  page,
  itemsPerPage,
  updateOptions,
  selectedSheet,
  isDetailLoading,
  isSubmitting,
  snackbar,
  fetchAllSheets,
  fetchSheet,
  createSheet,
  autoCreateSheet,
  completeSheet,
  clearSelected,
} = useReturnSheets()

const headers = [
  { title: 'المندوب', key: 'representativeName',  sortable: false  },
  { title: 'التاريخ',   key: 'returnDate',        sortable: true  },
  { title: 'الحالة', key: 'status',            sortable: true  },
  { title: 'الإجراء', key: 'actions',           sortable: false, align: 'end' },
]

const isDrawerOpen = ref(false)
const isModalOpen  = ref(false)
const isAutoCreateModalOpen = ref(false)
const autoCreateRepId = ref(null)

const openCreate = () => { isDrawerOpen.value = true }

const onSubmit = async payload => {
  const result = await createSheet(payload)
  if (result.success) isDrawerOpen.value = false
}

const onAutoCreate = async () => {
  const result = await autoCreateSheet(autoCreateRepId.value)
  if (result.success) {
    isAutoCreateModalOpen.value = false
    autoCreateRepId.value = null
  }
}

const openDetails = async sheet => {
  isModalOpen.value = true
  await fetchSheet(sheet.id)
}

const onModalToggle = val => {
  isModalOpen.value = val
  if (!val) clearSelected()
}

// ── Complete Return — SweetAlert2 confirmation before POST /complete ──────────
const onComplete = async sheet => {
  const repName = sheet.representativeName || `مندوب رقم ${sheet.representativeId}`
  const confirmed = await confirmAction({
    title: `إكمال كشف المرتجعات رقم ${sheet.id}؟`,
    text: `سيتم إرجاع الكمية من مركبة ${repName} إلى المستودع وتحويل حالة الكشف إلى «مكتمل». لا يمكن التراجع عن هذا الإجراء.`,
    confirmText: 'إكمال الإرجاع',
    icon: 'warning',
  })
  if (!confirmed) return
  await completeSheet(sheet.id)
}

const formatDate = value => {
  if (!value) return '—'
  const d = new Date(value)

  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat(INTL_LOCALE, {
    year: 'numeric', month: 'short', day: '2-digit',
  }).format(d)
}

const statusTitle = status =>
  RETURN_SHEET_STATUSES.find(s => s.value === status)?.title ?? status ?? '—'

onMounted(fetchAllSheets)
</script>

<template>
  <section>
    <VCard>
      <VCardItem class="pb-2">
        <VCardTitle>كشوف المرتجعات</VCardTitle>
        <template #append>
          <div class="d-flex align-center gap-4">
            <VBtn
              color="secondary"
              variant="tonal"
              prepend-icon="tabler-wand"
              @click="isAutoCreateModalOpen = true"
            >
              إنشاء تلقائي
            </VBtn>
            <VBtn
              prepend-icon="tabler-plus"
              @click="openCreate"
            >
              كشف مرتجعات جديد
            </VBtn>
          </div>
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
              placeholder="تصفية حسب الحالة"
              :items="RETURN_SHEET_STATUSES"
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
              v-model="returnDate"
              placeholder="تصفية حسب تاريخ الإرجاع"
              :config="{ dateFormat: 'Y-m-d' }"
            />
          </VCol>
          <VCol
            cols="12"
            sm="4"
          >
            <RepresentativeSelect
              v-model="repIdFilter"
              label="تصفية حسب المندوب"
              placeholder="ابحث عن مندوب…"
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
          @click="fetchAllSheets"
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
        :items="sheets"
        :items-length="totalSheets"
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
              icon="tabler-truck-return"
              size="48"
              color="secondary"
            />
            <p class="text-body-1 text-medium-emphasis mb-0">
              لا توجد كشوف مرتجعات.
            </p>
          </div>
        </template>

        <template #item.representativeName="{ item }">
          <div class="d-flex align-center gap-3">
            <VAvatar
              size="32"
              color="primary"
              variant="tonal"
            >
              <span>{{ (item.representativeName || 'غير معروف').charAt(0).toUpperCase() }}</span>
            </VAvatar>
            <div class="d-flex flex-column">
              <span class="text-body-1 font-weight-medium">
                {{ item.representativeName || 'مندوب غير معروف' }}
              </span>
            </div>
          </div>
        </template>

        <template #item.returnDate="{ item }">
          <span class="text-body-2">{{ formatDate(item.returnDate) }}</span>
        </template>

        <template #item.status="{ item }">
          <VChip
            :color="resolveReturnStatusVariant(item.status)"
            size="small"
            label
          >
            {{ statusTitle(item.status) }}
          </VChip>
        </template>

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

            <!-- Complete Return — only when still DRAFT -->
            <VTooltip
              v-if="item.status === 'DRAFT'"
              text="إكمال الإرجاع"
            >
              <template #activator="{ props: tp }">
                <IconBtn
                  v-bind="tp"
                  color="success"
                  :loading="isSubmitting"
                  @click="onComplete(item)"
                >
                  <VIcon icon="tabler-circle-check" />
                </IconBtn>
              </template>
            </VTooltip>
          </div>
        </template>

        <template #bottom>
          <TablePagination
            v-model:page="page"
            :items-per-page="itemsPerPage"
            :total-items="totalSheets"
          />
        </template>
      </VDataTableServer>
    </VCard>

    <!-- Create Drawer -->
    <ReturnSheetFormDrawer
      v-model:is-drawer-open="isDrawerOpen"
      :is-submitting="isSubmitting"
      @submit="onSubmit"
    />

    <!-- Details Modal -->
    <ReturnSheetDetailsModal
      :is-dialog-open="isModalOpen"
      :sheet="selectedSheet"
      :is-loading="isDetailLoading"
      @update:is-dialog-open="onModalToggle"
    />

    <!-- Auto Create Modal -->
    <VDialog
      v-model="isAutoCreateModalOpen"
      max-width="500"
    >
      <VCard>
        <VCardTitle class="pt-4 px-6">إنشاء كشف مرتجعات تلقائيًا</VCardTitle>
        <VCardText class="pt-2 px-6">
          اختر مندوب مبيعات لإنشاء كشف مرتجعات تلقائيًا من مخزون مركبته الحالي.
          <RepresentativeSelect
            v-model="autoCreateRepId"
            label="المندوب"
            class="mt-4"
          />
        </VCardText>
        <VCardActions class="justify-end px-6 pb-4">
          <VBtn
            variant="tonal"
            color="secondary"
            @click="isAutoCreateModalOpen = false"
          >
            إلغاء
          </VBtn>
          <VBtn
            color="primary"
            :loading="isSubmitting"
            :disabled="!autoCreateRepId || isSubmitting"
            @click="onAutoCreate"
          >
            إنشاء تلقائي
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

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
