<script setup>
/**
 * ReturnSheetDetailsModal.vue
 *
 * Read-only modal showing a return sheet's header info and its nested `lines`
 * (Product Name, SKU, Quantity).
 */

import {
  RETURN_SHEET_STATUSES,
  resolveReturnStatusVariant,
} from '@/composables/useReturnSheets'

const props = defineProps({
  isDialogOpen: {
    type: Boolean,
    required: true,
  },
  sheet: {
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
  const match = RETURN_SHEET_STATUSES.find(s => s.value === props.sheet?.status)

  return match?.title ?? props.sheet?.status ?? '—'
})

const lines = computed(() => props.sheet?.lines ?? [])

const formatDate = value => {
  if (!value) return '—'
  const d = new Date(value)

  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: '2-digit',
  }).format(d)
}
</script>

<template>
  <VDialog
    :model-value="props.isDialogOpen"
    max-width="680"
    scrollable
    @update:model-value="emit('update:isDialogOpen', $event)"
  >
    <VCard>
      <VCardItem class="pb-2">
        <VCardTitle class="d-flex align-center gap-2">
          <VIcon
            icon="tabler-truck-return"
            size="22"
          />
          Return Sheet
          <span
            v-if="props.sheet?.id"
            class="text-medium-emphasis"
          >#{{ props.sheet.id }}</span>
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

        <template v-else-if="props.sheet">
          <VRow class="mb-2">
            <VCol
              cols="12"
              sm="4"
            >
              <div class="text-body-2 text-medium-emphasis">
                Representative
              </div>
              <div class="text-body-1 font-weight-medium">
                {{ props.sheet.representativeName || `Rep #${props.sheet.representativeId}` || '—' }}
              </div>
            </VCol>
            <VCol
              cols="12"
              sm="4"
            >
              <div class="text-body-2 text-medium-emphasis">
                Return Date
              </div>
              <div class="text-body-1 font-weight-medium">
                {{ formatDate(props.sheet.returnDate) }}
              </div>
            </VCol>
            <VCol
              cols="12"
              sm="4"
            >
              <div class="text-body-2 text-medium-emphasis">
                Status
              </div>
              <VChip
                :color="resolveReturnStatusVariant(props.sheet.status)"
                size="small"
                label
              >
                {{ statusLabel }}
              </VChip>
            </VCol>
          </VRow>

          <VDivider class="my-3" />

          <VTable density="comfortable">
            <thead>
              <tr>
                <th class="text-left">
                  Product
                </th>
                <th class="text-left">
                  SKU
                </th>
                <th class="text-end">
                  Quantity
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
                  {{ line.quantity ?? '—' }}
                </td>
              </tr>
              <tr v-if="!lines.length">
                <td
                  colspan="3"
                  class="text-center text-medium-emphasis py-6"
                >
                  No lines on this return sheet.
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
          Close
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
