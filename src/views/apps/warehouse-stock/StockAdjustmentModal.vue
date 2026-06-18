<script setup>
/**
 * StockAdjustmentModal.vue
 *
 * A single reusable dialog that handles BOTH inventory actions, switched by
 * the `mode` prop:
 *   - mode="receive" → POST /inventory/warehouse-stock/{productId}/receive
 *                      (adds the entered quantity to existing on-hand stock)
 *   - mode="update"  → PUT  /inventory/warehouse-stock/{productId}
 *                      (overrides / corrects the absolute on-hand quantity)
 *
 * productName + sku are shown as read-only context. The component is "dumb":
 * it validates and emits `submit` with { productId, quantity, mode }; the parent
 * page calls the composable (receiveStock / correctStock) and closes on success.
 */

import { STOCK_MODES } from '@/composables/useWarehouseStock'

const props = defineProps({
  isDialogOpen: {
    type: Boolean,
    required: true,
  },
  /** 'receive' | 'update' */
  mode: {
    type: String,
    default: STOCK_MODES.RECEIVE,
    validator: v => Object.values(STOCK_MODES).includes(v),
  },
  /**
   * The stock record being adjusted.
   * { productId, productName, sku, quantity, ... }
   */
  stock: {
    type: Object,
    default: null,
  },
  isSubmitting: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:isDialogOpen', 'submit'])

const refForm = ref()
const quantity = ref(null)

// ── Mode-driven labels ────────────────────────────────────────────────────────
const isReceiveMode = computed(() => props.mode === STOCK_MODES.RECEIVE)

const dialogTitle = computed(() =>
  isReceiveMode.value ? 'Receive Stock' : 'Correct Stock')

const submitLabel = computed(() =>
  isReceiveMode.value ? 'Receive Shipment' : 'Update Stock')

const quantityLabel = computed(() =>
  isReceiveMode.value ? 'Quantity Received' : 'New Quantity')

const quantityHint = computed(() =>
  isReceiveMode.value
    ? 'This amount will be ADDED to the current on-hand quantity.'
    : 'This will OVERRIDE the current on-hand quantity (manual correction).')

// ── Reset quantity whenever the dialog (re)opens ──────────────────────────────
watch(
  () => props.isDialogOpen,
  isOpen => {
    if (isOpen) {
      // For "update" pre-fill with current quantity; for "receive" start blank.
      quantity.value = isReceiveMode.value ? null : (props.stock?.quantity ?? null)
      nextTick(() => refForm.value?.resetValidation())
    }
  },
)

// ── Validators ────────────────────────────────────────────────────────────────
const quantityRules = computed(() => {
  // Receiving must be a positive shipment; correcting allows 0 (stock-out).
  const min = isReceiveMode.value ? 1 : 0

  return [
    value => {
      if (value === null || value === undefined || value === '') return 'Quantity is required'
      if (!Number.isInteger(Number(value))) return 'Quantity must be a whole number'

      return Number(value) >= min || `Enter a value of ${min} or greater`
    },
  ]
})

// ── Close / submit ──────────────────────────────────────────────────────────
const closeDialog = () => {
  emit('update:isDialogOpen', false)
}

const onSubmit = () => {
  refForm.value?.validate().then(({ valid }) => {
    if (!valid) return

    emit('submit', {
      productId: props.stock?.productId,
      quantity: Number(quantity.value),
      mode: props.mode,
    })
  })
}
</script>

<template>
  <VDialog
    :model-value="props.isDialogOpen"
    max-width="480"
    persistent
    @update:model-value="emit('update:isDialogOpen', $event)"
  >
    <VCard>
      <!-- Header -->
      <VCardItem class="pb-2">
        <template #prepend>
          <VAvatar
            :color="isReceiveMode ? 'success' : 'primary'"
            variant="tonal"
            rounded
            size="40"
          >
            <VIcon
              :icon="isReceiveMode ? 'tabler-truck-delivery' : 'tabler-adjustments'"
              size="22"
            />
          </VAvatar>
        </template>
        <VCardTitle>{{ dialogTitle }}</VCardTitle>
      </VCardItem>

      <VDivider />

      <VCardText>
        <!-- Read-only product context -->
        <div class="d-flex flex-column gap-1 mb-4">
          <div class="d-flex align-center justify-space-between">
            <span class="text-body-2 text-medium-emphasis">Product</span>
            <span class="text-body-1 font-weight-medium text-high-emphasis">
              {{ props.stock?.productName || '—' }}
            </span>
          </div>
          <div class="d-flex align-center justify-space-between">
            <span class="text-body-2 text-medium-emphasis">SKU</span>
            <span class="text-body-2 font-weight-medium">{{ props.stock?.sku || '—' }}</span>
          </div>
          <div class="d-flex align-center justify-space-between">
            <span class="text-body-2 text-medium-emphasis">Current On-hand</span>
            <span class="text-body-2 font-weight-medium">{{ props.stock?.quantity ?? '—' }}</span>
          </div>
        </div>

        <VDivider class="mb-4" />

        <VForm
          ref="refForm"
          @submit.prevent="onSubmit"
        >
          <AppTextField
            v-model="quantity"
            :label="quantityLabel"
            :rules="quantityRules"
            :hint="quantityHint"
            persistent-hint
            type="number"
            min="0"
            step="1"
            placeholder="0"
            :disabled="props.isSubmitting"
            autofocus
          />
        </VForm>
      </VCardText>

      <VCardActions class="pa-4 pt-0 gap-2 justify-end">
        <VBtn
          variant="tonal"
          color="secondary"
          :disabled="props.isSubmitting"
          @click="closeDialog"
        >
          Cancel
        </VBtn>
        <VBtn
          :color="isReceiveMode ? 'success' : 'primary'"
          :loading="props.isSubmitting"
          :disabled="props.isSubmitting"
          @click="onSubmit"
        >
          <VIcon
            :icon="isReceiveMode ? 'tabler-truck-delivery' : 'tabler-device-floppy'"
            start
          />
          {{ submitLabel }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
