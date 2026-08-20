<script setup>
import { PerfectScrollbar } from 'vue3-perfect-scrollbar'

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
   * Pass a territory object when editing, null/undefined for create mode.
   * { id, name, description }
   */
  territory: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['update:isDrawerOpen', 'submit'])

const refForm      = ref()
const refScrollbar = ref()   // PerfectScrollbar — used to reset scroll on open

// Determine mode
const isEditMode = computed(() => !!props.territory?.id)
const drawerTitle = computed(() => (isEditMode.value ? 'تعديل المنطقة' : 'إضافة منطقة'))

// Form state
const form = ref({ name: '', description: '' })

// ── Validation ────────────────────────────────────────────────────────────────
// Mirrors CreateTerritoryRequest / UpdateTerritoryRequest:
//   name        @NotBlank @Size(min = 2, max = 100)
//   description @Size(max = 500)   ← optional; only `name` is in `required`
// The description field used to carry requiredValidator, which made the form
// stricter than the API and blocked a legitimate territory with no description.
const nameRules = [
  requiredValidator,
  v => minLengthValidator(v, 2),
  v => maxLengthValidator(v, 100),
]

const descriptionRules = [v => maxLengthValidator(v, 500)]

// Populate form when territory prop changes (edit mode)
watch(
  () => props.territory,
  val => {
    if (val) {
      form.value.name        = val.name        ?? ''
      form.value.description = val.description ?? ''
    } else {
      form.value = { name: '', description: '' }
    }
  },
  { immediate: true },
)

// ── Reset & close ─────────────────────────────────────────────────────────────

/** Shared reset logic — used by closeDrawer() and the isDrawerOpen watcher */
const resetForm = () => {
  form.value = { name: '', description: '' }
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
 * When the drawer opens in CREATE mode (no territory prop), always reset —
 * even when territory was already null so the territory-prop watcher didn't fire.
 * Also scroll back to top on every open (create or edit).
 */
watch(
  () => props.isDrawerOpen,
  isOpen => {
    if (isOpen && !props.territory) resetForm()
    if (isOpen) {
      nextTick(() => {
        if (refScrollbar.value?.$el) {
          refScrollbar.value.$el.scrollTop = 0
        }
      })
    }
  },
)

// ── Submit ────────────────────────────────────────────────────────────────────
const onSubmit = () => {
  refForm.value?.validate().then(({ valid }) => {
    if (!valid) return

    emit('submit', {
      id:          props.territory?.id ?? null,
      name:        form.value.name.trim(),
      description: form.value.description.trim(),
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
              <!-- Territory Name -->
              <VCol cols="12">
                <AppTextField
                  v-model="form.name"
                  :rules="nameRules"
                  label="اسم المنطقة"
                  counter="100"
                  placeholder="مثال: المنطقة الشمالية"
                  :disabled="props.isSubmitting"
                />
              </VCol>

              <!-- Description -->
              <VCol cols="12">
                <AppTextarea
                  v-model="form.description"
                  :rules="descriptionRules"
                  label="الوصف (اختياري)"
                  placeholder="صف نطاق تغطية هذه المنطقة…"
                  rows="4"
                  counter="500"
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
                  {{ isEditMode ? 'حفظ التغييرات' : 'إنشاء المنطقة' }}
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
