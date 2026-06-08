<script setup>
import { VForm } from 'vuetify/components/VForm'
import { useGenerateImageVariant } from '@core/composable/useGenerateImageVariant'
import authV2LoginIllustrationBorderedDark from '@images/pages/auth-v2-login-illustration-bordered-dark.png'
import authV2LoginIllustrationBorderedLight from '@images/pages/auth-v2-login-illustration-bordered-light.png'
import authV2LoginIllustrationDark from '@images/pages/auth-v2-login-illustration-dark.png'
import authV2LoginIllustrationLight from '@images/pages/auth-v2-login-illustration-light.png'
import authV2MaskDark from '@images/pages/misc-mask-dark.png'
import authV2MaskLight from '@images/pages/misc-mask-light.png'
import { VNodeRenderer } from '@layouts/components/VNodeRenderer'
import { themeConfig } from '@themeConfig'

const authThemeImg = useGenerateImageVariant(
  authV2LoginIllustrationLight,
  authV2LoginIllustrationDark,
  authV2LoginIllustrationBorderedLight,
  authV2LoginIllustrationBorderedDark,
  true,
)
const authThemeMask = useGenerateImageVariant(authV2MaskLight, authV2MaskDark)

// This page is only accessible to authenticated first-time users.
// The router guard redirects here when userData.isFirstLogin === true.
// It is NOT marked as unauthenticatedOnly — it requires a valid session.
definePage({
  meta: {
    layout: 'blank',
    // No unauthenticatedOnly: true — requires a logged-in session
  },
})

// ── Composable ────────────────────────────────────────────────────────────────
const { changePassword, isLoading, userData } = useAuth()

// ── Form State ────────────────────────────────────────────────────────────────
const refVForm = ref()
const isNewPasswordVisible = ref(false)
const isConfirmPasswordVisible = ref(false)
const submitError = ref('')
const submitSuccess = ref(false)

const form = ref({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

// ── Password Strength Indicator ───────────────────────────────────────────────
const passwordStrength = computed(() => {
  const pwd = form.value.newPassword
  if (!pwd) return { score: 0, label: '', color: '' }

  let score = 0
  if (pwd.length >= 8) score++
  if (pwd.length >= 12) score++
  if (/[A-Z]/.test(pwd)) score++
  if (/[0-9]/.test(pwd)) score++
  if (/[^A-Za-z0-9]/.test(pwd)) score++

  const levels = [
    { score: 0, label: '', color: '' },
    { score: 1, label: 'Very Weak', color: 'error' },
    { score: 2, label: 'Weak', color: 'warning' },
    { score: 3, label: 'Fair', color: 'info' },
    { score: 4, label: 'Strong', color: 'success' },
    { score: 5, label: 'Very Strong', color: 'success' },
  ]

  return levels[Math.min(score, 5)]
})

const passwordStrengthPercent = computed(() => {
  return (passwordStrength.value.score / 5) * 100
})

// ── Validators ────────────────────────────────────────────────────────────────
const minLengthValidator = value => {
  return value?.length >= 8 || 'Password must be at least 8 characters'
}

const passwordMatchValidator = value => {
  return value === form.value.newPassword || 'Passwords do not match'
}

// ── Submit ────────────────────────────────────────────────────────────────────
const onSubmit = async () => {
  const { valid } = await refVForm.value.validate()
  if (!valid) return

  submitError.value = ''
  submitSuccess.value = false

  const result = await changePassword(form.value.currentPassword, form.value.newPassword)

  if (result.success) {
    submitSuccess.value = true
    // useAuth.changePassword() handles the redirect to '/' after success
  } else {
    submitError.value = result.error || 'Failed to update password.'
  }
}
</script>

<template>
  <RouterLink to="/">
    <div class="auth-logo d-flex align-center gap-x-3">
      <VNodeRenderer :nodes="themeConfig.app.logo" />
      <h1 class="auth-title">
        {{ themeConfig.app.title }}
      </h1>
    </div>
  </RouterLink>

  <VRow
    no-gutters
    class="auth-wrapper bg-surface"
  >
    <!-- Left illustration panel -->
    <VCol
      md="8"
      class="d-none d-md-flex"
    >
      <div class="position-relative bg-background w-100 me-0">
        <div
          class="d-flex align-center justify-center w-100 h-100"
          style="padding-inline: 6.25rem;"
        >
          <VImg
            max-width="613"
            :src="authThemeImg"
            class="auth-illustration mt-16 mb-2"
          />
        </div>

        <img
          class="auth-footer-mask"
          :src="authThemeMask"
          alt="auth-footer-mask"
          height="280"
          width="100"
        >
      </div>
    </VCol>

    <!-- Right form panel -->
    <VCol
      cols="12"
      md="4"
      class="auth-card-v2 d-flex align-center justify-center"
    >
      <VCard
        flat
        :max-width="500"
        class="mt-12 mt-sm-0 pa-4"
      >
        <VCardText>
          <h4 class="text-h4 mb-1">
            Set Your New Password 🔐
          </h4>
          <p class="mb-0 text-medium-emphasis">
            Welcome,
            <strong class="text-high-emphasis">{{ userData?.name || 'there' }}</strong>!
            For your security, please set a new password before continuing.
          </p>
        </VCardText>

        <VCardText>
          <!-- Info alert about mandatory reset -->
          <VAlert
            type="info"
            variant="tonal"
            class="mb-6"
            icon="tabler-shield-lock"
          >
            This is your first login. You must change your temporary password to proceed.
          </VAlert>

          <!-- Success message -->
          <VAlert
            v-if="submitSuccess"
            type="success"
            variant="tonal"
            class="mb-4"
            icon="tabler-circle-check"
          >
            Password updated successfully! Redirecting to dashboard...
          </VAlert>

          <!-- Error message -->
          <VAlert
            v-if="submitError"
            type="error"
            variant="tonal"
            class="mb-4"
            closable
            @click:close="submitError = ''"
          >
            {{ submitError }}
          </VAlert>

          <VForm
            ref="refVForm"
            @submit.prevent="onSubmit"
          >
            <VRow>
              <!-- Current (temporary) Password -->
              <VCol cols="12">
                <AppTextField
                  id="reset-current-password"
                  v-model="form.currentPassword"
                  label="Current (Temporary) Password"
                  placeholder="············"
                  :rules="[requiredValidator]"
                  type="password"
                  autocomplete="current-password"
                  :disabled="isLoading || submitSuccess"
                />
              </VCol>

              <!-- New Password -->
              <VCol cols="12">
                <AppTextField
                  id="reset-new-password"
                  v-model="form.newPassword"
                  label="New Password"
                  placeholder="············"
                  :rules="[requiredValidator, minLengthValidator]"
                  :type="isNewPasswordVisible ? 'text' : 'password'"
                  autocomplete="new-password"
                  :append-inner-icon="isNewPasswordVisible ? 'tabler-eye-off' : 'tabler-eye'"
                  :disabled="isLoading || submitSuccess"
                  @click:append-inner="isNewPasswordVisible = !isNewPasswordVisible"
                />

                <!-- Password Strength Bar -->
                <div
                  v-if="form.newPassword"
                  class="mt-2"
                >
                  <div class="d-flex align-center justify-space-between mb-1">
                    <span class="text-xs text-medium-emphasis">Password strength</span>
                    <span
                      class="text-xs font-weight-medium"
                      :class="`text-${passwordStrength.color}`"
                    >
                      {{ passwordStrength.label }}
                    </span>
                  </div>
                  <VProgressLinear
                    :model-value="passwordStrengthPercent"
                    :color="passwordStrength.color || 'error'"
                    height="4"
                    rounded
                    bg-color="rgba(var(--v-theme-on-surface), 0.08)"
                  />
                  <ul class="text-xs text-medium-emphasis mt-2 ps-4">
                    <li :class="form.newPassword.length >= 8 ? 'text-success' : ''">
                      At least 8 characters
                    </li>
                    <li :class="/[A-Z]/.test(form.newPassword) ? 'text-success' : ''">
                      At least one uppercase letter
                    </li>
                    <li :class="/[0-9]/.test(form.newPassword) ? 'text-success' : ''">
                      At least one number
                    </li>
                    <li :class="/[^A-Za-z0-9]/.test(form.newPassword) ? 'text-success' : ''">
                      At least one special character
                    </li>
                  </ul>
                </div>
              </VCol>

              <!-- Confirm New Password -->
              <VCol cols="12">
                <AppTextField
                  id="reset-confirm-password"
                  v-model="form.confirmPassword"
                  label="Confirm New Password"
                  placeholder="············"
                  :rules="[requiredValidator, passwordMatchValidator]"
                  :type="isConfirmPasswordVisible ? 'text' : 'password'"
                  autocomplete="new-password"
                  :append-inner-icon="isConfirmPasswordVisible ? 'tabler-eye-off' : 'tabler-eye'"
                  :disabled="isLoading || submitSuccess"
                  @click:append-inner="isConfirmPasswordVisible = !isConfirmPasswordVisible"
                />
              </VCol>

              <!-- Submit Button -->
              <VCol cols="12">
                <VBtn
                  id="reset-password-submit-btn"
                  block
                  type="submit"
                  :loading="isLoading"
                  :disabled="isLoading || submitSuccess"
                >
                  <template #loader>
                    <VProgressCircular
                      indeterminate
                      size="20"
                      width="2"
                      class="me-2"
                    />
                    Updating password...
                  </template>
                  Set New Password
                </VBtn>
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>

<style lang="scss">
@use "@core/scss/template/pages/page-auth";
</style>
