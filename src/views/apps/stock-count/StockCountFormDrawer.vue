<script setup>
/**
 * StockCountFormDrawer.vue
 *
 * Dual-purpose drawer for a warehouse stock count:
 *   - CREATE mode (`count` is null): pick a count date, then add line rows.
 *   - EDIT mode  (`count` is a DRAFT): the date is fixed and read-only; only the
 *     lines can be changed. PUT /stock-counts/{id}/lines REPLACES the whole line
 *     set, so the form is seeded with the existing lines and submits all of them.
 *
 * ℹ️ The system's recorded quantity is deliberately NOT shown while counting.
 * The backend withholds `recordedQuantity` until the count is finalized, which
 * makes this a blind count — showing the expected figure here would invite the
 * counter to just type it back and defeat the whole exercise.
 *
 * Emits `submit` with `{ countDate, lines: [{ productId, countedQuantity }] }`
 * in create mode, and `{ lines: [...] }` in edit mode.
 */

import { PerfectScrollbar } from 'vue3-perfect-scrollbar'
import WarehouseStockAutocomplete from '@/views/apps/logistics/WarehouseStockAutocomplete.vue'
import { todayIsoDate, toIsoDate } from '@/composables/useStockCounts'

const props = defineProps({
  isDrawerOpen: {
    type: Boolean,
    required: true,
  },
  count: {
    type: Object,
    default: null,
  },
  isSubmitting: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:isDrawerOpen', 'submit'])

const refForm      = ref()
const refScrollbar = ref()

const isEditMode = computed(() => !!props.count?.id)

const newLine = () => ({ productId: null, productName: '', countedQuantity: 0 })

const blankForm = () => ({
  countDate: todayIsoDate(),
  lines: [newLine()],
})

const form = ref(blankForm())

/** Seed the form from an existing draft, or reset it for a new count. */
const resetForm = () => {
  if (isEditMode.value) {
    const existing = (props.count.lines ?? []).map(l => ({
      productId:       l.productId,
      productName:     l.productName ?? '',
      countedQuantity: l.countedQuantity ?? 0,
    }))

    form.value = {
      countDate: props.count.countDate ?? todayIsoDate(),
      lines:     existing.length ? existing : [newLine()],
    }
  } else {
    form.value = blankForm()
  }

  nextTick(() => refForm.value?.resetValidation())
}

const addLine = () => form.value.lines.push(newLine())

const removeLine = index => {
  form.value.lines.splice(index, 1)
  if (form.value.lines.length === 0) form.value.lines.push(newLine())
}

const onProductSelect = (line, product) => {
  line.productName = product?.name ?? ''
}

const closeDrawer = () => {
  emit('update:isDrawerOpen', false)
  nextTick(resetForm)
}

watch(
  () => props.isDrawerOpen,
  isOpen => {
    if (!isOpen) return

    resetForm()
    nextTick(() => {
      if (refScrollbar.value?.$el) refScrollbar.value.$el.scrollTop = 0
    })
  },
)

// A counted quantity of 0 is meaningful here — it records "the shelf is empty",
// which is exactly the kind of discrepancy a stock-take exists to surface. So
// the floor is 0, not 1 as in the return-sheet form.
const qtyRules = [
  v => {
    if (v === null || v === undefined || v === '') return 'مطلوب'
    if (!Number.isInteger(Number(v))) return 'رقم صحيح'

    return Number(v) >= 0 || 'لا يقل عن 0'
  },
]

// The backend keys lines by product, so the same product twice would silently
// collapse into one line. Catch it here instead.
const duplicateProductIds = computed(() => {
  const seen = new Set()
  const dupes = new Set()

  for (const line of form.value.lines) {
    if (!line.productId) continue
    if (seen.has(line.productId)) dupes.add(line.productId)
    seen.add(line.productId)
  }

  return dupes
})

const hasDuplicates = computed(() => duplicateProductIds.value.size > 0)

const hasValidLines = computed(() =>
  form.value.lines.length > 0 && form.value.lines.every(l => l.productId))

const canSubmit = computed(() =>
  hasValidLines.value && !hasDuplicates.value && !props.isSubmitting)

const onSubmit = () => {
  refForm.value?.validate().then(({ valid }) => {
    if (!valid || !canSubmit.value) return

    const lines = form.value.lines.map(l => ({
      productId:       l.productId,
      countedQuantity: Number(l.countedQuantity),
    }))

    emit('submit', isEditMode.value
      ? { lines }
      : { countDate: toIsoDate(form.value.countDate) ?? todayIsoDate(), lines })
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
      :title="isEditMode ? `تعديل أسطر الجرد رقم ${props.count.id}` : 'عملية جرد جديدة'"
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
              <!-- Count date — fixed once the draft exists -->
              <VCol cols="12">
                <AppDateTimePicker
                  v-if="!isEditMode"
                  v-model="form.countDate"
                  label="تاريخ الجرد"
                  placeholder="اختر التاريخ"
                  :config="{ dateFormat: 'Y-m-d' }"
                  :rules="[requiredValidator]"
                  :disabled="props.isSubmitting"
                />
                <AppTextField
                  v-else
                  :model-value="form.countDate"
                  label="تاريخ الجرد"
                  readonly
                  disabled
                />
              </VCol>

              <!-- Blind-count notice -->
              <VCol cols="12">
                <VAlert
                  type="info"
                  variant="tonal"
                  density="compact"
                  icon="tabler-eye-off"
                >
                  <span class="text-body-2">
                    أدخل الكمية كما عددتها على الرف. تظهر كمية النظام والفروقات بعد اعتماد الجرد.
                  </span>
                </VAlert>
              </VCol>

              <VCol cols="12">
                <div class="d-flex align-center justify-space-between mb-1">
                  <span class="text-body-1 font-weight-medium">أسطر الجرد</span>
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
                      :error-messages="line.productId && duplicateProductIds.has(line.productId)
                        ? 'هذا المنتج مكرر في سطر آخر'
                        : []"
                      label="المنتج"
                      @select="p => onProductSelect(line, p)"
                    />
                  </div>
                  <div style="inline-size: 7.5rem;">
                    <AppTextField
                      v-model="line.countedQuantity"
                      :rules="qtyRules"
                      label="الكمية المعدودة"
                      type="text"
                      inputmode="numeric"
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

              <VCol
                v-else-if="hasDuplicates"
                cols="12"
              >
                <span class="text-caption text-error">
                  لا يمكن تكرار المنتج نفسه في أكثر من سطر.
                </span>
              </VCol>

              <!-- Replace-not-merge warning, edit mode only -->
              <VCol
                v-if="isEditMode"
                cols="12"
              >
                <span class="text-caption text-disabled">
                  سيحل هذا الحفظ محل جميع أسطر الجرد الحالية.
                </span>
              </VCol>

              <VCol cols="12">
                <VBtn
                  type="submit"
                  class="me-3"
                  :loading="props.isSubmitting"
                  :disabled="!canSubmit"
                >
                  {{ isEditMode ? 'حفظ الأسطر' : 'إنشاء مسودة' }}
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
