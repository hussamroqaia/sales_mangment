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
  completeSheet,
  clearSelected,
} = useReturnSheets()

const headers = [
  { title: 'Rep ID', key: 'representativeId',  sortable: true  },
  { title: 'Date',   key: 'returnDate',        sortable: true  },
  { title: 'Status', key: 'status',            sortable: true  },
  { title: 'Action', key: 'actions',           sortable: false, align: 'end' },
]

const isDrawerOpen = ref(false)
const isModalOpen  = ref(false)

const openCreate = () => { isDrawerOpen.value = true }

const onSubmit = async payload => {
  const result = await createSheet(payload)
  if (result.success) isDrawerOpen.value = false
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
  const confirmed = await confirmAction({
    title: `Complete return #${sheet.id}?`,
    text: `This will move the returned stock back to the warehouse from Rep #${sheet.representativeId}'s van and mark the sheet as COMPLETED. This cannot be undone.`,
    confirmText: 'Complete Return',
    icon: 'warning',
  })
  if (!confirmed) return
  await completeSheet(sheet.id)
}

const formatDate = value => {
  if (!value) return '—'
  const d = new Date(value)

  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat('en-US', {
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
        <VCardTitle>Return Sheets</VCardTitle>
        <template #append>
          <VBtn
            prepend-icon="tabler-plus"
            @click="openCreate"
          >
            New Return Sheet
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
              placeholder="Filter by Return Date"
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
          @click="fetchAllSheets"
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
              No return sheets found.
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

            <!-- Complete Return — only when still DRAFT -->
            <VTooltip
              v-if="item.status === 'DRAFT'"
              text="Complete Return"
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
