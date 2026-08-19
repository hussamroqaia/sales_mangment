<script setup>
import { USER_STATUSES, resolveStatusVariant, resolveRoleVariant, resolveRoleTitle } from '@/composables/useUsers'
import { INTL_LOCALE } from '@/utils/locale'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  user: {
    type: Object,
    default: null,
  },
  isSubmitting: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue', 'changeStatus', 'resetPassword'])

// ── Internal state ────────────────────────────────────────────────────────────
const activeTab = ref('details')
const selectedStatus = ref(null)
const newPassword = ref('')
const confirmPassword = ref('')
const isNewPasswordVisible = ref(false)
const isConfirmPasswordVisible = ref(false)
const refPasswordForm = ref()

// Sync selectedStatus when user prop changes
watch(() => props.user, user => {
  selectedStatus.value = user?.status ?? null
  newPassword.value = ''
  confirmPassword.value = ''
  activeTab.value = 'details'
}, { immediate: true })

// ── Computed ──────────────────────────────────────────────────────────────────
const statusChanged = computed(() =>
  props.user && selectedStatus.value !== props.user.status,
)

const formattedDate = computed(() => {
  if (!props.user?.createdAt) return '—'

  return new Date(props.user.createdAt).toLocaleDateString(INTL_LOCALE, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
})

// ── Validators ────────────────────────────────────────────────────────────────
const passwordMatchValidator = value =>
  value === newPassword.value || 'كلمتا المرور غير متطابقتين'

// ── Actions ───────────────────────────────────────────────────────────────────
const onChangeStatus = () => {
  if (statusChanged.value) {
    emit('changeStatus', props.user.id, selectedStatus.value)
  }
}

const onResetPassword = async () => {
  const { valid } = await refPasswordForm.value.validate()
  if (!valid) return

  emit('resetPassword', props.user.id, newPassword.value)
}

const close = () => {
  emit('update:modelValue', false)
}
</script>

<template>
  <VDialog
    :model-value="props.modelValue"
    max-width="600"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <VCard v-if="props.user">
      <!-- Header -->
      <VCardTitle class="d-flex align-center justify-space-between pa-4 pb-2">
        <div class="d-flex align-center gap-3">
          <VAvatar
            size="42"
            :color="resolveRoleVariant(props.user.role).color"
            variant="tonal"
          >
            <VIcon :icon="resolveRoleVariant(props.user.role).icon" />
          </VAvatar>
          <div>
            <h6 class="text-h6">
              {{ props.user.name }}
            </h6>
            <div class="text-sm text-medium-emphasis">
              {{ props.user.email }}
            </div>
          </div>
        </div>
        <IconBtn @click="close">
          <VIcon icon="tabler-x" />
        </IconBtn>
      </VCardTitle>

      <VDivider />

      <!-- Tabs -->
      <VTabs
        v-model="activeTab"
        class="v-tabs-pill px-4 pt-3"
      >
        <VTab value="details">
          <VIcon
            size="16"
            icon="tabler-user"
            class="me-1"
          />
          التفاصيل
        </VTab>
        <VTab value="status">
          <VIcon
            size="16"
            icon="tabler-toggle-left"
            class="me-1"
          />
          الحالة
        </VTab>
        <VTab value="password">
          <VIcon
            size="16"
            icon="tabler-lock-password"
            class="me-1"
          />
          إعادة تعيين كلمة المرور
        </VTab>
      </VTabs>

      <VDivider />

      <VCardText class="pa-4">
        <VWindow v-model="activeTab">
          <!-- ── Tab: Details ─────────────────────────────────────────────── -->
          <VWindowItem value="details">
            <VList lines="two">
              <VListItem>
                <template #prepend>
                  <VIcon
                    icon="tabler-id"
                    class="me-2"
                  />
                </template>
                <VListItemTitle class="text-sm text-medium-emphasis">
                  معرّف المستخدم
                </VListItemTitle>
                <VListItemSubtitle class="font-weight-medium">
                  #{{ props.user.id }}
                </VListItemSubtitle>
              </VListItem>

              <VDivider inset />

              <VListItem>
                <template #prepend>
                  <VIcon
                    icon="tabler-mail"
                    class="me-2"
                  />
                </template>
                <VListItemTitle class="text-sm text-medium-emphasis">
                  البريد الإلكتروني
                </VListItemTitle>
                <VListItemSubtitle class="font-weight-medium">
                  {{ props.user.email }}
                </VListItemSubtitle>
              </VListItem>

              <VDivider inset />

              <VListItem>
                <template #prepend>
                  <VIcon
                    icon="tabler-crown"
                    class="me-2"
                  />
                </template>
                <VListItemTitle class="text-sm text-medium-emphasis">
                  الدور
                </VListItemTitle>
                <VListItemSubtitle>
                  <VChip
                    :color="resolveRoleVariant(props.user.role).color"
                    size="small"
                    label
                    class="text-capitalize"
                  >
                    <VIcon
                      :icon="resolveRoleVariant(props.user.role).icon"
                      size="12"
                      class="me-1"
                    />
                    {{ resolveRoleTitle(props.user.role) }}
                  </VChip>
                </VListItemSubtitle>
              </VListItem>

              <VDivider inset />

              <VListItem>
                <template #prepend>
                  <VIcon
                    icon="tabler-circle-dot"
                    class="me-2"
                  />
                </template>
                <VListItemTitle class="text-sm text-medium-emphasis">
                  الحالة
                </VListItemTitle>
                <VListItemSubtitle>
                  <VChip
                    :color="resolveStatusVariant(props.user.status)"
                    size="small"
                    label
                    class="text-capitalize"
                  >
                    {{ props.user.status }}
                  </VChip>
                </VListItemSubtitle>
              </VListItem>

              <VDivider inset />

              <VListItem>
                <template #prepend>
                  <VIcon
                    icon="tabler-calendar"
                    class="me-2"
                  />
                </template>
                <VListItemTitle class="text-sm text-medium-emphasis">
                  تاريخ الإنشاء
                </VListItemTitle>
                <VListItemSubtitle class="font-weight-medium">
                  {{ formattedDate }}
                </VListItemSubtitle>
              </VListItem>
            </VList>
          </VWindowItem>

          <!-- ── Tab: Status ─────────────────────────────────────────────── -->
          <VWindowItem value="status">
            <div class="pa-2">
              <p class="text-body-2 text-medium-emphasis mb-4">
                تغيير حالة حساب
                <strong class="text-high-emphasis">{{ props.user.name }}</strong>.
                يؤثر هذا على قدرته على الوصول إلى النظام.
              </p>

              <AppSelect
                v-model="selectedStatus"
                label="حالة الحساب"
                :items="USER_STATUSES"
                item-title="title"
                item-value="value"
                :disabled="props.isSubmitting"
              />

              <div class="mt-4">
                <VChip
                  v-for="s in USER_STATUSES"
                  :key="s.value"
                  :color="resolveStatusVariant(s.value)"
                  size="small"
                  label
                  class="me-2"
                >
                  {{ s.title }}
                </VChip>
              </div>

              <VBtn
                class="mt-6"
                :loading="props.isSubmitting"
                :disabled="!statusChanged || props.isSubmitting"
                @click="onChangeStatus"
              >
                <VIcon
                  icon="tabler-check"
                  class="me-1"
                />
                تطبيق تغيير الحالة
              </VBtn>
            </div>
          </VWindowItem>

          <!-- ── Tab: Reset Password ─────────────────────────────────────── -->
          <VWindowItem value="password">
            <div class="pa-2">
              <p class="text-body-2 text-medium-emphasis mb-4">
                تعيين كلمة مرور جديدة لـ
                <strong class="text-high-emphasis">{{ props.user.name }}</strong>.
                سيستخدم هذه الكلمة عند تسجيل الدخول التالي.
              </p>

              <VForm
                ref="refPasswordForm"
                @submit.prevent="onResetPassword"
              >
                <VRow>
                  <VCol cols="12">
                    <AppTextField
                      v-model="newPassword"
                      :rules="[requiredValidator]"
                      label="كلمة المرور الجديدة"
                      placeholder="············"
                      :type="isNewPasswordVisible ? 'text' : 'password'"
                      :append-inner-icon="isNewPasswordVisible ? 'tabler-eye-off' : 'tabler-eye'"
                      autocomplete="new-password"
                      :disabled="props.isSubmitting"
                      @click:append-inner="isNewPasswordVisible = !isNewPasswordVisible"
                    />
                  </VCol>

                  <VCol cols="12">
                    <AppTextField
                      v-model="confirmPassword"
                      :rules="[requiredValidator, passwordMatchValidator]"
                      label="تأكيد كلمة المرور الجديدة"
                      placeholder="············"
                      :type="isConfirmPasswordVisible ? 'text' : 'password'"
                      :append-inner-icon="isConfirmPasswordVisible ? 'tabler-eye-off' : 'tabler-eye'"
                      autocomplete="new-password"
                      :disabled="props.isSubmitting"
                      @click:append-inner="isConfirmPasswordVisible = !isConfirmPasswordVisible"
                    />
                  </VCol>

                  <VCol cols="12">
                    <VBtn
                      type="submit"
                      :loading="props.isSubmitting"
                      :disabled="props.isSubmitting"
                    >
                      <VIcon
                        icon="tabler-lock-password"
                        class="me-1"
                      />
                      إعادة تعيين كلمة المرور
                    </VBtn>
                  </VCol>
                </VRow>
              </VForm>
            </div>
          </VWindowItem>
        </VWindow>
      </VCardText>
    </VCard>
  </VDialog>
</template>
