<script setup>
/**
 * ReturnSheetFormDrawer.vue
 *
 * Create-draft drawer for a Return Sheet (Van → Warehouse). Dynamic form:
 *   1. Pick a representative.
 *   2. Add / remove line rows — each line picks a Product + quantity.
 *
 * Emits `submit` with the payload shape `{ representativeId, lines: [{ productId, quantity }] }`.
 */

import { PerfectScrollbar } from 'vue3-perfect-scrollbar'
import RepresentativeSelect from '@/views/apps/logistics/RepresentativeSelect.vue'
import WarehouseStockAutocomplete from '@/views/apps/logistics/WarehouseStockAutocomplete.vue'

const props = defineProps({
  isDrawerOpen: {
    type: Boolean,
    required: true,
  },
  isSubmitting: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:isDrawerOpen', 'submit'])

const refForm      = ref()
const refScrollbar = ref()

const newLine = () => ({ productId: null, productName: '', quantity: 1 })

const blankForm = () => ({
  representativeId: null,
  lines: [newLine()],
})

const form = ref(blankForm())

const addLine = () => form.value.lines.push(newLine())

const removeLine = index => {
  form.value.lines.splice(index, 1)
  if (form.value.lines.length === 0) form.value.lines.push(newLine())
}

const onProductSelect = (line, product) => {
  line.productName = product?.name ?? ''
}

const resetForm = () => {
  form.value = blankForm()
  nextTick(() => refForm.value?.resetValidation())
}

const closeDrawer = () => {
  emit('update:isDrawerOpen', false)
  nextTick(resetForm)
}

watch(
  () => props.isDrawerOpen,
  isOpen => {
    if (isOpen) {
      resetForm()
      nextTick(() => {
        if (refScrollbar.value?.$el) refScrollbar.value.$el.scrollTop = 0
      })
    }
  },
)

const qtyRules = [
  v => {
    if (v === null || v === undefined || v === '') return 'مطلوب'
    if (!Number.isInteger(Number(v))) return 'رقم صحيح'

    return Number(v) >= 1 || 'الحد الأدنى 1'
  },
]

const hasValidLines = computed(() =>
  form.value.lines.length > 0 && form.value.lines.every(l => l.productId))

const onSubmit = () => {
  refForm.value?.validate().then(({ valid }) => {
    if (!valid || !hasValidLines.value) return

    emit('submit', {
      representativeId: form.value.representativeId,
      lines: form.value.lines.map(l => ({
        productId: l.productId,
        quantity:  Number(l.quantity),
      })),
    })
  })
}
</script>

<template>
  <VNavigationDrawer
    data-allow-mismatch
    temporary
    :width="520"
    location="end"
    class="scrollable-content"
    :model-value="props.isDrawerOpen"
    @update:model-value="emit('update:isDrawerOpen', $event)"
  >
    <AppDrawerHeaderSection
      title="كشف مرتجعات جديد"
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
              <VCol cols="12">
                <RepresentativeSelect
                  v-model="form.representativeId"
                  :rules="[requiredValidator]"
                  :disabled="props.isSubmitting"
                />
              </VCol>

              <VCol cols="12">
                <div class="d-flex align-center justify-space-between mb-1">
                  <span class="text-body-1 font-weight-medium">أسطر المرتجعات</span>
                  <VBtn
                    size="small"
                    variant="tonal"
                    prepend-icon="tabler-plus"
                    :disabled="props.isSubmitting"
                    @click="addLine"
                  >
                    إضافة سطر
                  </VBtn>
                </div>
                <VDivider class="mb-3" />
              </VCol>

              <VCol
                v-for="(line, index) in form.lines"
                :key="index"
                cols="12"
              >
                <div class="d-flex align-start gap-2">
                  <div class="flex-grow-1">
                    <WarehouseStockAutocomplete
                      v-model="line.productId"
                      :rules="[requiredValidator]"
                      :disabled="props.isSubmitting"
                      label="المنتج"
                      @select="p => onProductSelect(line, p)"
                    />
                  </div>
                  <div style="inline-size: 7.5rem;">
                    <AppTextField
                      v-model="line.quantity"
                      :rules="qtyRules"
                      label="الكمية"
                      type="number"
                      min="1"
                      step="1"
                      :disabled="props.isSubmitting"
                    />
                  </div>
                  <IconBtn
                    class="mt-7"
                    color="error"
                    :disabled="props.isSubmitting"
                    @click="removeLine(index)"
                  >
                    <VIcon icon="tabler-trash" />
                  </IconBtn>
                </div>
              </VCol>

              <VCol
                v-if="!hasValidLines"
                cols="12"
              >
                <span class="text-caption text-disabled">
                  يجب اختيار منتج في كل سطر.
                </span>
              </VCol>

              <VCol cols="12">
                <VBtn
                  type="submit"
                  class="me-3"
                  :loading="props.isSubmitting"
                  :disabled="props.isSubmitting || !hasValidLines"
                >
                  إنشاء مسودة
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
