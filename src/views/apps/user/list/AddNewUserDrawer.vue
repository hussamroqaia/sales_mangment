<script setup>
import { PerfectScrollbar } from 'vue3-perfect-scrollbar'
import { USER_ROLES } from '@/composables/useUsers'

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

const refForm = ref()
const isPasswordVisible = ref(false)
const isConfirmPasswordVisible = ref(false)

const form = ref({
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  role: null,
})

// ── Reset & close ──────────────────────────────────────────────────────────────
const closeDrawer = () => {
  emit('update:isDrawerOpen', false)
  nextTick(() => {
    refForm.value?.reset()
    refForm.value?.resetValidation()
    isPasswordVisible.value = false
    isConfirmPasswordVisible.value = false
  })
}

// ── Submit ─────────────────────────────────────────────────────────────────────
const onSubmit = () => {
  refForm.value?.validate().then(({ valid }) => {
    if (!valid) return

    emit('submit', {
      name: form.value.name,
      email: form.value.email,
      password: form.value.password,
      role: form.value.role,
    })
  })
}

// Auto-close drawer after successful submission (parent clears isSubmitting)
watch(() => props.isSubmitting, (newVal, oldVal) => {
  if (oldVal === true && newVal === false) {
    closeDrawer()
  }
})
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
    <!-- Header -->
    <AppDrawerHeaderSection
      title="إضافة مستخدم جديد"
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
              <!-- Full Name -->
              <VCol cols="12">
                <AppTextField
                  v-model="form.name"
                  :rules="[requiredValidator]"
                  label="الاسم الكامل"
                  placeholder="مثال: أحمد محمد"
                  :disabled="props.isSubmitting"
                />
              </VCol>

              <!-- Email -->
              <VCol cols="12">
                <AppTextField
                  v-model="form.email"
                  :rules="[requiredValidator, emailValidator]"
                  label="البريد الإلكتروني"
                  type="email"
                  placeholder="name@example.com"
                  :disabled="props.isSubmitting"
                />
              </VCol>

              <!-- Password -->
              <VCol cols="12">
                <AppTextField
                  v-model="form.password"
                  :rules="[requiredValidator, v => (v || '').length >= 8 || 'يجب ألّا تقلّ كلمة المرور عن 8 أحرف']"
                  label="كلمة المرور"
                  placeholder="············"
                  :type="isPasswordVisible ? 'text' : 'password'"
                  autocomplete="new-password"
                  :append-inner-icon="isPasswordVisible ? 'tabler-eye-off' : 'tabler-eye'"
                  :disabled="props.isSubmitting"
                  @click:append-inner="isPasswordVisible = !isPasswordVisible"
                />
              </VCol>

              <!-- Confirm Password -->
              <VCol cols="12">
                <AppTextField
                  v-model="form.confirmPassword"
                  :rules="[requiredValidator, v => v === form.password || 'كلمتا المرور غير متطابقتين']"
                  label="تأكيد كلمة المرور"
                  placeholder="············"
                  :type="isConfirmPasswordVisible ? 'text' : 'password'"
                  autocomplete="new-password"
                  :append-inner-icon="isConfirmPasswordVisible ? 'tabler-eye-off' : 'tabler-eye'"
                  :disabled="props.isSubmitting"
                  @click:append-inner="isConfirmPasswordVisible = !isConfirmPasswordVisible"
                />
              </VCol>

              <!-- Role -->
              <VCol cols="12">
                <AppSelect
                  v-model="form.role"
                  label="الدور"
                  placeholder="اختر الدور"
                  :rules="[requiredValidator]"
                  :items="USER_ROLES"
                  item-title="title"
                  item-value="value"
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
                  إنشاء المستخدم
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
