<script setup>
/**
 * StockCountDetailsModal.vue
 *
 * Read-only modal for a stock count: header info plus the nested `lines`
 * (Product, SKU, Counted, Recorded, Variance).
 *
 * The Recorded and Variance columns are empty on a DRAFT — the backend only
 * fills them in at finalize time — so the table shows an em dash there and the
 * header carries a note explaining why, rather than looking like missing data.
 */

import { INTL_LOCALE } from '@/utils/locale'
import {
  isDraftCount,
  resolveStockCountStatusTitle,
  resolveStockCountStatusVariant,
  resolveVarianceVariant,
  resolveVarianceLabel,
} from '@/composables/useStockCounts'

const props = defineProps({
  isDialogOpen: {
    type: Boolean,
    required: true,
  },
  count: {
    type: Object,
    default: null,
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:isDialogOpen'])

const lines = computed(() => props.count?.lines ?? [])

const isDraft = computed(() => isDraftCount(props.count))

/** Net variance across every line — the headline number after a finalize. */
const netVariance = computed(() => {
  if (isDraft.value) return null

  return lines.value.reduce((sum, l) => sum + (l.variance ?? 0), 0)
})

const mismatchedLines = computed(() =>
  lines.value.filter(l => (l.variance ?? 0) !== 0).length)

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
</script>

<template>
  <VDialog
    :model-value="props.isDialogOpen"
    max-width="760"
    scrollable
    @update:model-value="emit('update:isDialogOpen', $event)"
  >
    <VCard>
      <VCardItem class="pb-2">
        <VCardTitle class="d-flex align-center gap-2">
          <VIcon
            icon="tabler-clipboard-list"
            size="22"
          />
          عملية الجرد
          <span
            v-if="props.count?.id"
            class="text-medium-emphasis"
          >#{{ props.count.id }}</span>
        </VCardTitle>
        <template #append>
          <IconBtn @click="emit('update:isDialogOpen', false)">
            <VIcon icon="tabler-x" />
          </IconBtn>
        </template>
      </VCardItem>

      <VDivider />

      <VCardText style="max-block-size: 70vh;">
        <div
          v-if="props.isLoading"
          class="d-flex justify-center py-10"
        >
          <VProgressCircular
            indeterminate
            color="primary"
          />
        </div>

        <template v-else-if="props.count">
          <VRow class="mb-2">
            <VCol
              cols="12"
              sm="3"
            >
              <div class="text-body-2 text-medium-emphasis">
                تاريخ الجرد
              </div>
              <div class="text-body-1 font-weight-medium">
                {{ formatDate(props.count.countDate) }}
              </div>
            </VCol>
            <VCol
              cols="12"
              sm="3"
            >
              <div class="text-body-2 text-medium-emphasis">
                نفّذه
              </div>
              <div class="text-body-1 font-weight-medium">
                مستخدم #{{ props.count.countedById ?? '—' }}
              </div>
            </VCol>
            <VCol
              cols="12"
              sm="3"
            >
              <div class="text-body-2 text-medium-emphasis">
                الحالة
              </div>
              <VChip
                :color="resolveStockCountStatusVariant(props.count.status)"
                size="small"
                label
              >
                {{ resolveStockCountStatusTitle(props.count.status) }}
              </VChip>
            </VCol>
            <VCol
              cols="12"
              sm="3"
            >
              <div class="text-body-2 text-medium-emphasis">
                تاريخ الاعتماد
              </div>
              <div class="text-body-1 font-weight-medium">
                {{ formatDateTime(props.count.finalizedAt) }}
              </div>
            </VCol>
          </VRow>

          <!-- Post-finalize summary -->
          <VAlert
            v-if="!isDraft"
            :type="mismatchedLines ? 'warning' : 'success'"
            variant="tonal"
            density="compact"
            class="mb-3"
          >
            <span class="text-body-2">
              <template v-if="mismatchedLines">
                {{ mismatchedLines }} من {{ lines.length }} سطرًا بها فروقات — صافي الفرق
                <strong dir="ltr">{{ netVariance > 0 ? `+${netVariance}` : netVariance }}</strong>.
              </template>
              <template v-else>
                جميع الأسطر مطابقة لكميات النظام.
              </template>
            </span>
          </VAlert>

          <!-- Draft notice -->
          <VAlert
            v-else
            type="info"
            variant="tonal"
            density="compact"
            class="mb-3"
            icon="tabler-eye-off"
          >
            <span class="text-body-2">
              الجرد ما زال مسودة — تظهر كمية النظام والفروقات بعد الاعتماد.
            </span>
          </VAlert>

          <VDivider class="my-3" />

          <VTable density="comfortable">
            <thead>
              <tr>
                <th class="text-left">
                  المنتج
                </th>
                <th class="text-left">
                  رمز الصنف (SKU)
                </th>
                <th class="text-end">
                  الكمية المعدودة
                </th>
                <th class="text-end">
                  كمية النظام
                </th>
                <th class="text-end">
                  الفرق
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(line, i) in lines"
                :key="line.productId ?? i"
              >
                <td>{{ line.productName ?? '—' }}</td>
                <td class="text-medium-emphasis">
                  {{ line.sku ?? '—' }}
                </td>
                <td class="text-end">
                  {{ line.countedQuantity ?? '—' }}
                </td>
                <td class="text-end text-medium-emphasis">
                  {{ line.recordedQuantity ?? '—' }}
                </td>
                <td class="text-end">
                  <VChip
                    v-if="line.variance !== null && line.variance !== undefined"
                    :color="resolveVarianceVariant(line.variance)"
                    size="small"
                    label
                  >
                    {{ resolveVarianceLabel(line.variance) }}
                  </VChip>
                  <span
                    v-else
                    class="text-medium-emphasis"
                  >—</span>
                </td>
              </tr>
              <tr v-if="!lines.length">
                <td
                  colspan="5"
                  class="text-center text-medium-emphasis py-6"
                >
                  لا توجد أسطر في عملية الجرد هذه.
                </td>
              </tr>
            </tbody>
          </VTable>
        </template>
      </VCardText>

      <VDivider />

      <VCardActions class="justify-end pa-4">
        <VBtn
          variant="tonal"
          color="secondary"
          @click="emit('update:isDialogOpen', false)"
        >
          إغلاق
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
