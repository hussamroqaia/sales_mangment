<script setup>
import { PerfectScrollbar } from 'vue3-perfect-scrollbar'

const props = defineProps({
  isDrawerOpen: {
    type: Boolean,
    required: true,
  },
  route: {
    type: Object,
    default: null,
  },
  isSubmitting: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:isDrawerOpen', 'submit'])

const refForm = ref()

const form = ref({
  name: '',
  routeDate: '',
})

// Initialize form when drawer opens or route changes
watch(
  () => [props.isDrawerOpen, props.route],
  ([isOpen, route]) => {
    if (isOpen && route) {
      form.value = {
        name: route.name || '',
        routeDate: route.routeDate || '',
      }
      nextTick(() => refForm.value?.resetValidation())
    }
  },
  { immediate: true }
)

const closeDrawer = () => {
  emit('update:isDrawerOpen', false)
}

const onSubmit = () => {
  refForm.value?.validate().then(({ valid }) => {
    if (!valid) return

    emit('submit', {
      id: props.route?.id,
      payload: {
        name: form.value.name,
        routeDate: form.value.routeDate,
      },
    })
  })
}
</script>

<template>
  <VNavigationDrawer
    data-allow-mismatch
    temporary
    :width="400"
    location="end"
    class="scrollable-content"
    :model-value="props.isDrawerOpen"
    @update:model-value="emit('update:isDrawerOpen', $event)"
  >
    <AppDrawerHeaderSection
      title="تعديل المسار"
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
              <VCol cols="12">
                <AppTextField
                  v-model="form.name"
                  label="اسم المسار"
                  placeholder="مثال: المسار 29"
                  :rules="[requiredValidator]"
                  :disabled="props.isSubmitting"
                />
              </VCol>

              <VCol cols="12">
                <AppDateTimePicker
                  v-model="form.routeDate"
                  label="تاريخ المسار"
                  placeholder="اختر التاريخ"
                  :rules="[requiredValidator]"
                  :disabled="props.isSubmitting"
                  :config="{ dateFormat: 'Y-m-d' }"
                />
              </VCol>

              <VCol cols="12">
                <VBtn
                  type="submit"
                  class="me-3"
                  :loading="props.isSubmitting"
                  :disabled="props.isSubmitting"
                >
                  حفظ التغييرات
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
