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

// `phoneNumber` holds ONLY the 9-digit local part — the field renders +963 as
// a fixed prefix and `toFullPhone` reassembles the wire format on submit.
const blankForm = () => ({
  name: '',
  phoneNumber: '',
  password: '',
  confirmPassword: '',
  role: null,
})

const form = ref(blankForm())

// Reduce anything typed or pasted (+963…, 00963…, 0…) to the local 9 digits,
// so the prefix can never end up duplicated in the value. See login.vue for why
// this is a write-back watcher and not a `@update:model-value` handler.
watch(() => form.value.phoneNumber, value => {
  const cleaned = toLocalPhone(value)

  if (cleaned !== value) form.value.phoneNumber = cleaned
})

// ── Close ─────────────────────────────────────────────────────────────────────
const closeDrawer = () => {
  emit('update:isDrawerOpen', false)
}

// ── Reset on close ────────────────────────────────────────────────────────────
// Keyed on the open flag rather than on the cancel button, because the drawer
// is closed from three places: cancel, the header's close icon, and the parent
// after a successful create. Resetting only in `closeDrawer()` left the last
// typed values — including the password fields — sitting in the form the next
// time it opened.
watch(() => props.isDrawerOpen, isOpen => {
  if (isOpen) return

  form.value = blankForm()
  isPasswordVisible.value = false
  isConfirmPasswordVisible.value = false
  nextTick(() => refForm.value?.resetValidation())
})

// ── Submit ─────────────────────────────────────────────────────────────────────
const onSubmit = () => {
  refForm.value?.validate().then(({ valid }) => {
    if (!valid) return

    emit('submit', {
      name: form.value.name,
      phoneNumber: toFullPhone(form.value.phoneNumber),
      password: form.value.password,
      role: form.value.role,
    })
  })
}

// ℹ️ The drawer deliberately does NOT close itself when `isSubmitting` falls
// back to false: that happens on a rejected create too (duplicate phone number, weak
// password), and closing there threw away everything the user had typed while
// the error snackbar was still on screen. Only the parent closes it, and only
// when the create actually succeeded.
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

              <!-- Phone number -->
              <VCol cols="12">
                <AppTextField
                  v-model="form.phoneNumber"
                  class="phone-field"
                  :rules="[localPhoneValidator]"
                  label="رقم الهاتف"
                  type="tel"
                  inputmode="numeric"
                  autocomplete="tel-national"
                  :prefix="SYRIA_DIAL_CODE"
                  placeholder="981491713"
                  dir="ltr"
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
