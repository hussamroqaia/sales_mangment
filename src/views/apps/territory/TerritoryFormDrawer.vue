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

const refForm = ref()

// Determine mode
const isEditMode = computed(() => !!props.territory?.id)
const drawerTitle = computed(() => (isEditMode.value ? 'Edit Territory' : 'Add Territory'))

// Form state
const form = ref({ name: '', description: '' })

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
const closeDrawer = () => {
  emit('update:isDrawerOpen', false)
  nextTick(() => {
    refForm.value?.reset()
    refForm.value?.resetValidation()
    form.value = { name: '', description: '' }
  })
}

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

    <PerfectScrollbar :options="{ wheelPropagation: false }">
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
                  :rules="[requiredValidator]"
                  label="Territory Name"
                  placeholder="e.g. North Region"
                  :disabled="props.isSubmitting"
                />
              </VCol>

              <!-- Description -->
              <VCol cols="12">
                <AppTextarea
                  v-model="form.description"
                  :rules="[requiredValidator]"
                  label="Description"
                  placeholder="Describe the territory's coverage area…"
                  rows="4"
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
                  {{ isEditMode ? 'Save Changes' : 'Create Territory' }}
                </VBtn>
                <VBtn
                  type="button"
                  variant="tonal"
                  color="error"
                  :disabled="props.isSubmitting"
                  @click="closeDrawer"
                >
                  Cancel
                </VBtn>
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
      </VCard>
    </PerfectScrollbar>
  </VNavigationDrawer>
</template>
