<script setup>
/**
 * DemandOrderDetailsModal.vue
 *
 * Read-only modal showing a demand order's header info and its nested `lines`
 * (Product Name, SKU, Requested Qty, Fulfilled Qty) in a simple table.
 */

import { INTL_LOCALE } from '@/utils/locale'
import {
  DEMAND_ORDER_STATUSES,
  resolveDemandStatusVariant,
} from '@/composables/useDemandOrders'

const props = defineProps({
  isDialogOpen: {
    type: Boolean,
    required: true,
  },
  order: {
    type: Object,
    default: null,
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:isDialogOpen'])

const statusLabel = computed(() => {
  const match = DEMAND_ORDER_STATUSES.find(s => s.value === props.order?.status)

  return match?.title ?? props.order?.status ?? '—'
})

const lines = computed(() => props.order?.lines ?? [])

const formatDate = value => {
  if (!value) return '—'
  const d = new Date(value)

  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat(INTL_LOCALE, {
    year: 'numeric', month: 'short', day: '2-digit',
  }).format(d)
}
</script>

<template>
  <VDialog
    :model-value="props.isDialogOpen"
    max-width="720"
    scrollable
    @update:model-value="emit('update:isDialogOpen', $event)"
  >
    <VCard>
      <VCardItem class="pb-2">
        <VCardTitle class="d-flex align-center gap-2">
          <VIcon
            icon="tabler-truck-delivery"
            size="22"
          />
          طلب التزويد
          <span
            v-if="props.order?.id"
            class="text-medium-emphasis"
          >#{{ props.order.id }}</span>
        </VCardTitle>
        <template #append>
          <IconBtn @click="emit('update:isDialogOpen', false)">
            <VIcon icon="tabler-x" />
          </IconBtn>
        </template>
      </VCardItem>

      <VDivider />

      <VCardText style="max-block-size: 70vh;">
        <!-- Loading -->
        <div
          v-if="props.isLoading"
          class="d-flex justify-center py-10"
        >
          <VProgressCircular
            indeterminate
            color="primary"
          />
        </div>

        <template v-else-if="props.order">
          <!-- Header summary -->
          <VRow class="mb-2">
            <VCol
              cols="12"
              sm="4"
            >
              <div class="text-body-2 text-medium-emphasis">
                المندوب
              </div>
              <div class="text-body-1 font-weight-medium">
                {{ props.order.representativeName || `Rep #${props.order.representativeId}` || '—' }}
              </div>
            </VCol>
            <VCol
              cols="12"
              sm="4"
            >
              <div class="text-body-2 text-medium-emphasis">
                تاريخ الطلب
              </div>
              <div class="text-body-1 font-weight-medium">
                {{ formatDate(props.order.orderDate) }}
              </div>
            </VCol>
            <VCol
              cols="12"
              sm="4"
            >
              <div class="text-body-2 text-medium-emphasis">
                الحالة
              </div>
              <VChip
                :color="resolveDemandStatusVariant(props.order.status)"
                size="small"
                label
              >
                {{ statusLabel }}
              </VChip>
            </VCol>
          </VRow>

          <VDivider class="my-3" />

          <!-- Lines table -->
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
                  الكمية المطلوبة
                </th>
                <th class="text-end">
                  الكمية المُلبّاة
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(line, i) in lines"
                :key="line.id ?? i"
              >
                <td>{{ line.productName ?? '—' }}</td>
                <td class="text-medium-emphasis">
                  {{ line.sku ?? '—' }}
                </td>
                <td class="text-end">
                  {{ line.requestedQty ?? '—' }}
                </td>
                <td class="text-end">
                  {{ line.fulfilledQty ?? '—' }}
                </td>
              </tr>
              <tr v-if="!lines.length">
                <td
                  colspan="4"
                  class="text-center text-medium-emphasis py-6"
                >
                  لا توجد أسطر في هذا الطلب.
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
