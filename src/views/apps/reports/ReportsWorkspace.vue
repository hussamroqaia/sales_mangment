<script setup>
/**
 * ReportsWorkspace.vue
 *
 * One Reports area covering all 11 management report endpoints, rather than
 * eleven disconnected pages. The report picker lists only the categories the
 * signed-in role may open, filters are rendered from the selected report's real
 * backend contract, and Run/Export share those same filters.
 *
 * Rendering: every report is tabular on the backend too — the export path
 * converts each DTO to a generic `ReportTable` — so an array response is shown
 * as a table whose columns come from the response keys, and a summary object is
 * shown as a key/value list. Column labels and cell formatting are derived from
 * the field names; no report data is invented or hardcoded.
 */

import RepresentativeSelect from '@/views/apps/logistics/RepresentativeSelect.vue'
import CustomerSelect from '@/views/apps/logistics/CustomerSelect.vue'
import {
  useReports,
  REPORT_CATEGORIES,
  formatReportCell,
  humaniseKey,
} from '@/composables/useReports'

const {
  allowedCategories,
  allowedReports,
  hasAnyReportAccess,
  selectedReportKey,
  selectedReport,
  showsDateRange,
  showsRepresentative,
  showsCustomer,
  from,
  to,
  representativeId,
  customerId,
  dateRangeError,
  reportData,
  isRunning,
  runError,
  hasRun,
  isStale,
  run,
  exportingFormat,
  exportError,
  exportAs,
} = useReports()

// ── Report picker, grouped by the categories this role may open ───────────────
const reportOptions = computed(() => {
  const items = []

  allowedCategories.value.forEach(category => {
    allowedReports.value
      .filter(r => r.category === category.key)
      .forEach(r => items.push({ title: r.title, value: r.key }))
  })

  return items
})

const selectedCategoryTitle = computed(() =>
  (selectedReport.value ? REPORT_CATEGORIES[selectedReport.value.category]?.title : ''))

// ── Result shape ──────────────────────────────────────────────────────────────
// Arrays render as a table; a bare object renders as a key/value summary. Some
// endpoints wrap their rows in a single array-valued property — unwrap that so
// it renders as the table it is.
const resultRows = computed(() => {
  const d = reportData.value

  if (Array.isArray(d)) return d
  if (d && typeof d === 'object') {
    const arrayEntry = Object.values(d).find(Array.isArray)

    if (arrayEntry) return arrayEntry
  }

  return null
})

const resultSummary = computed(() => {
  const d = reportData.value

  if (!d || Array.isArray(d) || typeof d !== 'object') return null

  return Object.entries(d).filter(([, v]) => !Array.isArray(v))
})

const columns = computed(() => {
  const rows = resultRows.value
  if (!rows?.length) return []

  return Object.keys(rows[0]).map(key => ({
    key,
    title: humaniseKey(key),
    sortable: false,
  }))
})

const isEmptyResult = computed(() =>
  hasRun.value
  && !runError.value
  && (resultRows.value?.length === 0 || (!resultRows.value && !resultSummary.value?.length)))

const canSubmit = computed(() =>
  Boolean(selectedReportKey.value) && !dateRangeError.value)
</script>

<template>
  <section>
    <!--
      Roles with no report access never reach this page (route meta), but the
      guard is repeated here so the component is safe wherever it is mounted. 
    -->
    <VCard v-if="!hasAnyReportAccess">
      <VCardText class="d-flex flex-column align-center justify-center py-12 gap-3">
        <VIcon
          icon="tabler-lock"
          size="48"
          color="secondary"
        />
        <p class="text-body-1 text-medium-emphasis mb-0">
          حسابك لا يملك صلاحية الوصول إلى أي تقارير.
        </p>
      </VCardText>
    </VCard>

    <template v-else>
      <VCard>
        <VCardItem class="pb-2">
          <VCardTitle>التقارير</VCardTitle>
          <VCardSubtitle>
            {{ selectedCategoryTitle ? `${selectedCategoryTitle} · ${selectedReport?.title}` : 'اختر تقريرًا' }}
          </VCardSubtitle>
        </VCardItem>

        <!--
          Report picker + filters. Only filters the selected report's
          controller actually declares are rendered. 
        -->
        <VCardText>
          <VRow>
            <VCol
              cols="12"
              md="4"
            >
              <AppSelect
                v-model="selectedReportKey"
                label="التقرير"
                :items="reportOptions"
                item-title="title"
                item-value="value"
              />
            </VCol>

            <VCol
              v-if="showsDateRange"
              cols="12"
              md="3"
              sm="6"
            >
              <AppDateTimePicker
                v-model="from"
                label="من تاريخ"
                placeholder="سنة-شهر-يوم"
                :config="{ dateFormat: 'Y-m-d' }"
              />
            </VCol>

            <VCol
              v-if="showsDateRange"
              cols="12"
              md="3"
              sm="6"
            >
              <AppDateTimePicker
                v-model="to"
                label="إلى تاريخ"
                placeholder="سنة-شهر-يوم"
                :config="{ dateFormat: 'Y-m-d' }"
              />
            </VCol>

            <VCol
              v-if="showsRepresentative"
              cols="12"
              md="3"
              sm="6"
            >
              <RepresentativeSelect
                v-model="representativeId"
                label="المندوب"
                placeholder="كل المندوبين"
                clearable
              />
            </VCol>

            <VCol
              v-if="showsCustomer"
              cols="12"
              md="3"
              sm="6"
            >
              <CustomerSelect
                v-model="customerId"
                label="العميل"
                placeholder="كل العملاء"
                clearable
              />
            </VCol>
          </VRow>

          <VAlert
            v-if="dateRangeError"
            type="warning"
            variant="tonal"
            density="compact"
            class="mt-2"
          >
            {{ dateRangeError }}
          </VAlert>
        </VCardText>

        <VDivider />

        <!-- Actions. Exports reuse exactly the filters above. -->
        <VCardText class="d-flex flex-wrap align-center gap-4">
          <VBtn
            prepend-icon="tabler-player-play"
            :loading="isRunning"
            :disabled="!canSubmit || isRunning"
            @click="run"
          >
            تشغيل التقرير
          </VBtn>

          <VChip
            v-if="isStale"
            color="warning"
            size="small"
            label
          >
            تغيّرت عوامل التصفية — أعد التشغيل
          </VChip>

          <VSpacer />

          <VBtn
            variant="tonal"
            color="secondary"
            prepend-icon="tabler-file-spreadsheet"
            :loading="exportingFormat === 'xlsx'"
            :disabled="!canSubmit || Boolean(exportingFormat)"
            @click="exportAs('xlsx')"
          >
            تصدير XLSX
          </VBtn>

          <VBtn
            variant="tonal"
            color="secondary"
            prepend-icon="tabler-file-type-pdf"
            :loading="exportingFormat === 'pdf'"
            :disabled="!canSubmit || Boolean(exportingFormat)"
            @click="exportAs('pdf')"
          >
            تصدير PDF
          </VBtn>
        </VCardText>

        <VAlert
          v-if="exportError"
          type="error"
          variant="tonal"
          class="mx-4 mb-4"
          closable
        >
          {{ exportError }}
        </VAlert>
      </VCard>

      <!-- ── Results ──────────────────────────────────────────────────────── -->
      <VCard class="mt-6">
        <VCardText v-if="runError">
          <VAlert
            type="error"
            variant="tonal"
          >
            {{ runError }}
          </VAlert>
        </VCardText>

        <VCardText v-else-if="isRunning && !reportData">
          <VSkeletonLoader type="table-row@6" />
        </VCardText>

        <!-- Initial state: no fabricated figures, just an instruction. -->
        <VCardText
          v-else-if="!hasRun"
          class="d-flex flex-column align-center justify-center py-12 gap-3"
        >
          <VIcon
            icon="tabler-report-analytics"
            size="48"
            color="secondary"
          />
          <p class="text-body-1 text-medium-emphasis mb-0">
            اختر تقريرًا ثم اضغط «تشغيل التقرير» لعرضه.
          </p>
        </VCardText>

        <VCardText
          v-else-if="isEmptyResult"
          class="d-flex flex-column align-center justify-center py-12 gap-3"
        >
          <VIcon
            icon="tabler-database-off"
            size="48"
            color="secondary"
          />
          <p class="text-body-1 text-medium-emphasis mb-0">
            لم يُرجع هذا التقرير أي بيانات لعوامل التصفية المحددة.
          </p>
        </VCardText>

        <template v-else>
          <!-- Summary fields (non-array properties of an object response) -->
          <VCardText v-if="resultSummary?.length">
            <VRow>
              <VCol
                v-for="[key, value] in resultSummary"
                :key="key"
                cols="12"
                sm="6"
                md="3"
              >
                <div class="d-flex flex-column">
                  <h5 class="text-h5">
                    {{ formatReportCell(key, value) }}
                  </h5>
                  <span class="text-body-2 text-medium-emphasis">{{ humaniseKey(key) }}</span>
                </div>
              </VCol>
            </VRow>
          </VCardText>

          <VDivider v-if="resultSummary?.length && resultRows?.length" />

          <VDataTable
            v-if="resultRows?.length"
            :headers="columns"
            :items="resultRows"
            class="text-no-wrap"
            :items-per-page="25"
          >
            <template
              v-for="column in columns"
              :key="column.key"
              #[`item.${column.key}`]="{ item }"
            >
              <span>{{ formatReportCell(column.key, item[column.key]) }}</span>
            </template>
          </VDataTable>
        </template>
      </VCard>
    </template>
  </section>
</template>
