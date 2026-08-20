<script setup>
/**
 * ProductFormDrawer.vue
 *
 * A single reusable offcanvas drawer that handles BOTH creating a new product
 * and updating an existing one. Mode is derived from the `product` prop:
 *   - product == null            → CREATE mode
 *   - product == { id, ... }     → EDIT mode
 *
 * Emits 'submit' with the trimmed/normalized payload; the parent page calls
 * the composable (create/update) and closes the drawer on success.
 */

import { PerfectScrollbar } from 'vue3-perfect-scrollbar'
import { PRODUCT_UNITS } from '@/composables/useProducts'

const props = defineProps({
  isDrawerOpen: {
    type: Boolean,
    required: true,
  },
  isSubmitting: {
    type: Boolean,
    default: false,
  },
  /**
   * Pass a product object when editing, null/undefined for create mode.
   * { id, name, sku, barcode, price, unitOfMeasure, minStockLevel }
   */
  product: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['update:isDrawerOpen', 'submit'])

const refForm      = ref()
const refScrollbar = ref()

// ── Mode ────────────────────────────────────────────────────────────────────
const isEditMode  = computed(() => !!props.product?.id)
const drawerTitle = computed(() => (isEditMode.value ? 'تعديل المنتج' : 'إضافة منتج'))

// ── Form state ──────────────────────────────────────────────────────────────
const blankForm = () => ({
  name:          '',
  sku:           '',
  barcode:       '',
  price:         null,
  unitOfMeasure: null,
  minStockLevel: null,
})

const form = ref(blankForm())

// Populate form when the product prop changes (edit mode)
watch(
  () => props.product,
  val => {
    if (val) {
      form.value = {
        name:          val.name          ?? '',
        sku:           val.sku           ?? '',
        barcode:       val.barcode       ?? '',
        price:         val.price         ?? null,
        unitOfMeasure: val.unitOfMeasure ?? null,
        minStockLevel: val.minStockLevel ?? null,
      }
    } else {
      form.value = blankForm()
    }
  },
  { immediate: true },
)

// ── Reset & close ───────────────────────────────────────────────────────────
const resetForm = () => {
  form.value = blankForm()
  nextTick(() => {
    refForm.value?.resetValidation()
  })
}

const closeDrawer = () => {
  emit('update:isDrawerOpen', false)
  nextTick(() => {
    refForm.value?.reset()
    resetForm()
  })
}

/**
 * When the drawer opens in CREATE mode (no product prop), always reset —
 * even when product was already null so the product-prop watcher didn't fire.
 * Also scroll back to top on every open.
 */
watch(
  () => props.isDrawerOpen,
  isOpen => {
    if (isOpen && !props.product) resetForm()
    if (isOpen) {
      nextTick(() => {
        if (refScrollbar.value?.$el) refScrollbar.value.$el.scrollTop = 0
      })
    }
  },
)

// ── Validators ──────────────────────────────────────────────────────────────
// Mirrors CreateProductRequest / UpdateProductRequest:
//   name          @NotBlank @Size(min = 2, max = 150)
//   sku           @NotBlank @Size(max = 50)
//   unitOfMeasure @NotBlank @Size(max = 30)
//   price         @NotNull  @DecimalMin("0")
//   barcode       @Size(max = 50)   ← optional
//   minStockLevel @Min(0)           ← optional
//
// `barcode` and `minStockLevel` are absent from the contract's `required` list;
// both were validated as required here, which made the form stricter than the
// API and refused products the backend accepts.
const positiveNumberValidator = value => {
  if (value === null || value === undefined || value === '') return 'هذا الحقل مطلوب'

  return Number(value) >= 0 || 'أدخل قيمة أكبر من أو تساوي 0'
}

/** Non-negative, but blank passes — for the optional numeric fields. */
const optionalNonNegativeValidator = value => {
  if (value === null || value === undefined || value === '') return true

  return Number(value) >= 0 || 'أدخل قيمة أكبر من أو تساوي 0'
}

const nameRules = [
  requiredValidator,
  v => minLengthValidator(v, 2),
  v => maxLengthValidator(v, 150),
]

const skuRules = [requiredValidator, v => maxLengthValidator(v, 50)]

const barcodeRules = [v => maxLengthValidator(v, 50)]

// ── Submit ──────────────────────────────────────────────────────────────────
const onSubmit = () => {
  refForm.value?.validate().then(({ valid }) => {
    if (!valid) return

    emit('submit', {
      id:            props.product?.id ?? null,
      name:          form.value.name.trim(),
      sku:           form.value.sku.trim(),
      // Both are optional in the contract. `Number('')` and `Number(null)` are
      // 0, so an untouched minimum-stock field used to be persisted as a real
      // 0 — which reads as "alert me the moment this runs out", not "unset".
      barcode:       form.value.barcode.trim() || null,
      price:         Number(form.value.price),
      unitOfMeasure: form.value.unitOfMeasure,
      minStockLevel: form.value.minStockLevel === null || form.value.minStockLevel === ''
        ? null
        : Number(form.value.minStockLevel),
    })
  })
}
</script>

<template>
  <VNavigationDrawer
    data-allow-mismatch
    temporary
    :width="420"
    location="end"
    class="scrollable-content"
    :model-value="props.isDrawerOpen"
    @update:model-value="emit('update:isDrawerOpen', $event)"
  >
    <!-- Header -->
    <AppDrawerHeaderSection
      :title="drawerTitle"
      @cancel="closeDrawer"
    />

    <VDivider />

    <PerfectScrollbar
      ref="refScrollbar"
      :options="{ wheelPropagation: false }"
    >
      <VCard flat>
        <VCardText>
          <VForm
            ref="refForm"
            @submit.prevent="onSubmit"
          >
            <VRow>
              <!-- Name -->
              <VCol cols="12">
                <AppTextField
                  v-model="form.name"
                  :rules="nameRules"
                  counter="150"
                  label="اسم المنتج"
                  placeholder="مثال: مياه معدنية 500 مل"
                  :disabled="props.isSubmitting"
                />
              </VCol>

              <!-- SKU -->
              <VCol cols="12">
                <AppTextField
                  v-model="form.sku"
                  :rules="skuRules"
                  counter="50"
                  label="رمز الصنف (SKU)"
                  placeholder="مثال: WTR-500-001"
                  :disabled="props.isSubmitting"
                />
              </VCol>

              <!-- Barcode -->
              <VCol cols="12">
                <AppTextField
                  v-model="form.barcode"
                  :rules="barcodeRules"
                  counter="50"
                  label="الباركود (اختياري)"
                  placeholder="مثال: 6291234567890"
                  :disabled="props.isSubmitting"
                />
              </VCol>

              <!-- Price -->
              <VCol
                cols="12"
                sm="6"
              >
                <AppTextField
                  v-model="form.price"
                  :rules="[positiveNumberValidator]"
                  label="السعر"
                  type="text"
                  inputmode="decimal"
                  placeholder="0.00"
                  :disabled="props.isSubmitting"
                />
              </VCol>

              <!-- Min Stock Level -->
              <VCol
                cols="12"
                sm="6"
              >
                <AppTextField
                  v-model="form.minStockLevel"
                  :rules="[optionalNonNegativeValidator, integerValidator]"
                  label="الحد الأدنى للمخزون (اختياري)"
                  type="text"
                  inputmode="numeric"
                  placeholder="0"
                  :disabled="props.isSubmitting"
                />
              </VCol>

              <!-- Unit of Measure -->
              <VCol cols="12">
                <AppSelect
                  v-model="form.unitOfMeasure"
                  :rules="[requiredValidator]"
                  :items="PRODUCT_UNITS"
                  item-title="title"
                  item-value="value"
                  label="وحدة القياس"
                  placeholder="اختر وحدة القياس"
                  :disabled="props.isSubmitting"
                />
              </VCol>

              <!-- Actions -->
              <VCol cols="12">
                <VBtn
                  type="submit"
                  class="me-3"
                  :loading="props.isSubmitting"
                  :disabled="props.isSubmitting"
                >
                  {{ isEditMode ? 'حفظ التغييرات' : 'إنشاء المنتج' }}
                </VBtn>
                <VBtn
                  type="button"
                  variant="tonal"
                  color="error"
                  :disabled="props.isSubmitting"
                  @click="closeDrawer"
                >
                  إلغاء
                </VBtn>
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
      </VCard>
    </PerfectScrollbar>
  </VNavigationDrawer>
</template>
