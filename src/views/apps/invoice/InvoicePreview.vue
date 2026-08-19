<script setup>
/**
 * InvoicePreview.vue
 *
 * Manager/admin invoice detail + review screen.
 *
 * Covers four endpoints:
 *   GET  /invoices/{id}            — the invoice, its lines, and ePOD metadata
 *   POST /invoices/{id}/approve    — SENT → APPROVED
 *   POST /invoices/{id}/reject     — SENT → REJECTED, mandatory reason
 *   GET  /invoices/{id}/pdf        — protected binary
 *   GET  /invoices/{id}/epod/{t}   — protected binary
 *
 * There is no edit, delete, submit, or ePOD-upload action here: those transitions
 * are SALES_REP-only and live in the mobile client.
 *
 * Both binaries are fetched through the authenticated client and surfaced as
 * object URLs. A plain <a href> / <img src> would omit the Authorization header
 * and render a 401 body instead of the file.
 */

import {
  useInvoices,
  isReviewable,
  resolveInvoiceStatusVariant,
  invoiceStatusTitle,
  formatInvoiceDate,
  formatInvoiceTimestamp,
  formatAmount,
  REJECTION_REASON_MAX_LENGTH,
} from '@/composables/useInvoices'

const props = defineProps({
  id: {
    type: [String, Number],
    required: true,
  },
})

const router = useRouter()

const {
  selectedInvoice,
  isDetailLoading,
  detailError,
  detailStatus,
  isReviewing,
  reviewError,
  approve,
  reject,
  isPdfLoading,
  downloadPdf,
  epodUrls,
  isEpodLoading,
  epodError,
  loadEpod,
  revokeEpodUrls,
  snackbar,
  fetchInvoice,
  clearSelected,
} = useInvoices()

// ── Review dialogs ────────────────────────────────────────────────────────────
const isApproveDialogOpen = ref(false)
const isRejectDialogOpen  = ref(false)
const rejectionReason     = ref('')

const canReview = computed(() => isReviewable(selectedInvoice.value))

const statusMeta = computed(() => resolveInvoiceStatusVariant(selectedInvoice.value?.status))

const openApproveDialog = () => {
  reviewError.value = ''
  isApproveDialogOpen.value = true
}

const openRejectDialog = () => {
  reviewError.value = ''
  rejectionReason.value = ''
  isRejectDialogOpen.value = true
}

const confirmApprove = async () => {
  // `approve` returns false while another review is already in flight, so a
  // double click cannot produce a second POST.
  const ok = await approve(props.id)

  if (ok) isApproveDialogOpen.value = false
}

const trimmedReason = computed(() => rejectionReason.value.trim())

const isReasonValid = computed(() =>
  trimmedReason.value.length > 0
  && trimmedReason.value.length <= REJECTION_REASON_MAX_LENGTH)

const confirmReject = async () => {
  if (!isReasonValid.value) return

  const ok = await reject(props.id, rejectionReason.value)

  if (ok) {
    isRejectDialogOpen.value = false
    rejectionReason.value = ''
  }
}

// ── ePOD ──────────────────────────────────────────────────────────────────────
// The response carries metadata only; the bytes come from the protected
// endpoint, one authenticated request per artifact.
const epodArtifacts = computed(() => selectedInvoice.value?.epodArtifacts ?? [])

const epodLabel = type => (type === 'SIGNATURE' ? 'توقيع العميل' : 'صورة التسليم')

const loadAllEpod = async () => {
  for (const artifact of epodArtifacts.value)
    await loadEpod(props.id, artifact.type)
}

// ── Lines ─────────────────────────────────────────────────────────────────────
const lineHeaders = [
  { title: 'المنتج',  key: 'productName', sortable: false },
  { title: 'رمز الصنف',      key: 'sku',         sortable: false },
  { title: 'الكمية',      key: 'quantity',    sortable: false, align: 'end' },
  { title: 'السعر',    key: 'price',       sortable: false, align: 'end' },
  { title: 'الخصم', key: 'discount',    sortable: false, align: 'end' },
  { title: 'المجموع الفرعي', key: 'subtotal',    sortable: false, align: 'end' },
]

const lines = computed(() => selectedInvoice.value?.lines ?? [])

// ── Lifecycle ─────────────────────────────────────────────────────────────────
const load = async id => {
  // Release the previous invoice's blobs before the new ones are created,
  // otherwise navigating between invoices pins every image seen so far.
  revokeEpodUrls()
  await fetchInvoice(id)
  if (selectedInvoice.value) await loadAllEpod()
}

onMounted(() => load(props.id))

// Route param changes reuse this component instance, so refetch explicitly.
watch(() => props.id, id => load(id))

onBeforeUnmount(clearSelected)
</script>

<template>
  <section>
    <!-- Loading -->
    <VCard v-if="isDetailLoading">
      <VCardText>
        <VSkeletonLoader type="article, table-row@4" />
      </VCardText>
    </VCard>

    <!-- Error -->
    <VCard v-else-if="detailError">
      <VCardText class="d-flex flex-column align-center justify-center py-12 gap-4">
        <VIcon
          :icon="detailStatus === 403 ? 'tabler-lock' : 'tabler-file-off'"
          size="48"
          color="error"
        />
        <p class="text-body-1 text-medium-emphasis mb-0">
          {{ detailError }}
        </p>
        <VBtn
          variant="tonal"
          color="secondary"
          prepend-icon="tabler-arrow-left"
          :to="{ name: 'apps-invoice-list' }"
        >
          العودة إلى الفواتير
        </VBtn>
      </VCardText>
    </VCard>

    <template v-else-if="selectedInvoice">
      <VRow>
        <VCol
          cols="12"
          md="9"
        >
          <VCard>
            <!-- Header -->
            <VCardText class="d-flex flex-wrap justify-space-between align-center gap-4">
              <div class="d-flex flex-column gap-1">
                <div class="d-flex align-center gap-3">
                  <h5 class="text-h5 mb-0">
                    Invoice #{{ selectedInvoice.id }}
                  </h5>
                  <VChip
                    :color="statusMeta.color"
                    size="small"
                    label
                  >
                    <VIcon
                      :icon="statusMeta.icon"
                      size="14"
                      class="me-1"
                    />
                    {{ invoiceStatusTitle(selectedInvoice.status) }}
                  </VChip>
                </div>
                <span class="text-body-2 text-medium-emphasis">
                  Issued {{ formatInvoiceDate(selectedInvoice.invoiceDate) }}
                </span>
              </div>

              <div class="d-flex flex-wrap gap-3">
                <VBtn
                  variant="tonal"
                  color="secondary"
                  prepend-icon="tabler-download"
                  :loading="isPdfLoading"
                  @click="downloadPdf(selectedInvoice.id)"
                >
                  تنزيل PDF
                </VBtn>

                <!--
                  Review actions exist only while the invoice is SENT. The
                  backend answers 409 for any other status, so offering them
                  would promise a transition that cannot happen. 
                -->
                <template v-if="canReview">
                  <VBtn
                    color="error"
                    variant="tonal"
                    prepend-icon="tabler-x"
                    :disabled="isReviewing"
                    @click="openRejectDialog"
                  >
                    رفض
                  </VBtn>
                  <VBtn
                    color="success"
                    prepend-icon="tabler-check"
                    :disabled="isReviewing"
                    @click="openApproveDialog"
                  >
                    Approve
                  </VBtn>
                </template>
              </div>
            </VCardText>

            <VDivider />

            <!-- Parties -->
            <VCardText>
              <VRow>
                <VCol
                  cols="12"
                  sm="6"
                >
                  <h6 class="text-h6 mb-2">
                    العميل
                  </h6>
                  <p class="text-body-1 mb-1">
                    {{ selectedInvoice.customerName || `Customer #${selectedInvoice.customerId}` }}
                  </p>
                  <p class="text-body-2 text-medium-emphasis mb-0">
                    ID: {{ selectedInvoice.customerId }}
                  </p>
                </VCol>

                <VCol
                  cols="12"
                  sm="6"
                >
                  <h6 class="text-h6 mb-2">
                    المندوب
                  </h6>
                  <p class="text-body-1 mb-1">
                    {{ selectedInvoice.representativeName || `Rep #${selectedInvoice.representativeId}` }}
                  </p>
                  <p class="text-body-2 text-medium-emphasis mb-0">
                    ID: {{ selectedInvoice.representativeId }}
                  </p>
                </VCol>
              </VRow>
            </VCardText>

            <VDivider />

            <!-- Lines -->
            <VDataTable
              :headers="lineHeaders"
              :items="lines"
              class="text-no-wrap"
              hide-default-footer
              :items-per-page="-1"
            >
              <template #no-data>
                <div class="py-6 text-center text-body-2 text-medium-emphasis">
                  لا توجد أصناف في هذه الفاتورة.
                </div>
              </template>

              <template #item.productName="{ item }">
                {{ item.productName || `Product #${item.productId}` }}
              </template>

              <template #item.sku="{ item }">
                <span class="text-body-2 text-medium-emphasis">{{ item.sku || '—' }}</span>
              </template>

              <template #item.price="{ item }">
                {{ formatAmount(item.price) }}
              </template>

              <template #item.discount="{ item }">
                {{ formatAmount(item.discount) }}
              </template>

              <template #item.subtotal="{ item }">
                <span class="font-weight-medium">{{ formatAmount(item.subtotal) }}</span>
              </template>
            </VDataTable>

            <VDivider />

            <VCardText class="d-flex justify-end">
              <div class="d-flex align-center gap-4">
                <span class="text-body-1 font-weight-medium">Total</span>
                <span class="text-h5">{{ formatAmount(selectedInvoice.totalAmount) }}</span>
              </div>
            </VCardText>
          </VCard>

          <!-- ePOD -->
          <VCard class="mt-6">
            <VCardItem>
              <VCardTitle>إثبات التسليم</VCardTitle>
              <VCardSubtitle>تم التقاطه بواسطة المندوب عند التسليم</VCardSubtitle>
            </VCardItem>

            <VCardText>
              <VAlert
                v-if="epodError"
                type="error"
                variant="tonal"
                class="mb-4"
              >
                {{ epodError }}
              </VAlert>

              <div
                v-if="!epodArtifacts.length"
                class="text-body-2 text-medium-emphasis"
              >
                لا توجد مرفقات إثبات تسليم لهذه الفاتورة.
              </div>

              <VRow v-else>
                <VCol
                  v-for="artifact in epodArtifacts"
                  :key="artifact.type"
                  cols="12"
                  sm="6"
                >
                  <p class="text-body-1 font-weight-medium mb-2">
                    {{ epodLabel(artifact.type) }}
                  </p>

                  <VSkeletonLoader
                    v-if="isEpodLoading && !epodUrls[artifact.type]"
                    type="image"
                    height="180"
                  />

                  <VImg
                    v-else-if="epodUrls[artifact.type]"
                    :src="epodUrls[artifact.type]"
                    :alt="epodLabel(artifact.type)"
                    max-height="220"
                    class="rounded border"
                  />

                  <div
                    v-else
                    class="text-body-2 text-medium-emphasis"
                  >
                    المعاينة غير متاحة.
                  </div>

                  <div class="text-body-2 text-medium-emphasis mt-2">
                    <div>Captured {{ formatInvoiceTimestamp(artifact.capturedAt) }}</div>
                    <div v-if="artifact.latitude != null && artifact.longitude != null">
                      Location: {{ artifact.latitude }}, {{ artifact.longitude }}
                    </div>
                  </div>
                </VCol>
              </VRow>
            </VCardText>
          </VCard>
        </VCol>

        <!-- Side panel -->
        <VCol
          cols="12"
          md="3"
        >
          <VCard>
            <VCardItem>
              <VCardTitle>Review</VCardTitle>
            </VCardItem>

            <VCardText class="d-flex flex-column gap-3">
              <div>
                <p class="text-body-2 text-medium-emphasis mb-1">
                  روجعت بواسطة
                </p>
                <p class="text-body-1 mb-0">
                  {{ selectedInvoice.reviewedByName || '—' }}
                </p>
              </div>

              <div v-if="selectedInvoice.rejectionReason">
                <p class="text-body-2 text-medium-emphasis mb-1">
                  سبب الرفض
                </p>
                <VAlert
                  type="error"
                  variant="tonal"
                  density="compact"
                >
                  {{ selectedInvoice.rejectionReason }}
                </VAlert>
              </div>

              <VDivider />

              <div>
                <p class="text-body-2 text-medium-emphasis mb-1">
                  Visit
                </p>
                <p class="text-body-1 mb-0">
                  {{ selectedInvoice.visitId != null ? `#${selectedInvoice.visitId}` : '—' }}
                </p>
              </div>

              <div>
                <p class="text-body-2 text-medium-emphasis mb-1">
                  تاريخ الإنشاء
                </p>
                <p class="text-body-1 mb-0">
                  {{ formatInvoiceTimestamp(selectedInvoice.createdAt) }}
                </p>
              </div>

              <div>
                <p class="text-body-2 text-medium-emphasis mb-1">
                  آخر تحديث
                </p>
                <p class="text-body-1 mb-0">
                  {{ formatInvoiceTimestamp(selectedInvoice.updatedAt) }}
                </p>
              </div>
            </VCardText>

            <VDivider />

            <VCardText>
              <VBtn
                block
                variant="tonal"
                color="secondary"
                prepend-icon="tabler-arrow-left"
                @click="router.push({ name: 'apps-invoice-list' })"
              >
                العودة إلى الفواتير
              </VBtn>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>
    </template>

    <!-- Approve confirmation -->
    <VDialog
      v-model="isApproveDialogOpen"
      max-width="480"
    >
      <VCard title="الموافقة على هذه الفاتورة؟">
        <VCardText>
          الموافقة على الفاتورة رقم {{ selectedInvoice?.id }} تعتمدها كإيراد مؤكّد.
          هذا الإجراء نهائي — لا يمكن مراجعة الفاتورة بعد الموافقة عليها.
        </VCardText>

        <VAlert
          v-if="reviewError"
          type="error"
          variant="tonal"
          class="mx-6 mb-2"
        >
          {{ reviewError }}
        </VAlert>

        <VCardActions class="justify-end">
          <VBtn
            variant="tonal"
            color="secondary"
            :disabled="isReviewing"
            @click="isApproveDialogOpen = false"
          >
            إلغاء
          </VBtn>
          <VBtn
            color="success"
            :loading="isReviewing"
            :disabled="isReviewing"
            @click="confirmApprove"
          >
            Approve
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Reject confirmation — reason is mandatory (BR-3) -->
    <VDialog
      v-model="isRejectDialogOpen"
      max-width="560"
    >
      <VCard title="رفض هذه الفاتورة؟">
        <VCardText>
          <p class="mb-4">
            رفض الفاتورة رقم {{ selectedInvoice?.id }} إجراء نهائي. تبقى الكمية مخصومة
            من المخزون — وأي تصحيح يتطلّب إصدار فاتورة جديدة.
          </p>

          <AppTextarea
            v-model="rejectionReason"
            label="سبب الرفض"
            placeholder="اذكر سبب رفض هذه الفاتورة"
            rows="3"
            :counter="REJECTION_REASON_MAX_LENGTH"
            :error-messages="rejectionReason && !isReasonValid
              ? [`Provide a reason of at most ${REJECTION_REASON_MAX_LENGTH} characters.`]
              : []"
          />
        </VCardText>

        <VAlert
          v-if="reviewError"
          type="error"
          variant="tonal"
          class="mx-6 mb-2"
        >
          {{ reviewError }}
        </VAlert>

        <VCardActions class="justify-end">
          <VBtn
            variant="tonal"
            color="secondary"
            :disabled="isReviewing"
            @click="isRejectDialogOpen = false"
          >
            إلغاء
          </VBtn>
          <VBtn
            color="error"
            :loading="isReviewing"
            :disabled="isReviewing || !isReasonValid"
            @click="confirmReject"
          >
            رفض
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
