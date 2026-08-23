<script setup>
import { VForm } from 'vuetify/components/VForm'
import authV1BottomShape from '@images/svg/auth-v1-bottom-shape.svg?raw'
import authV1TopShape from '@images/svg/auth-v1-top-shape.svg?raw'
import { VNodeRenderer } from '@layouts/components/VNodeRenderer'
import { themeConfig } from '@themeConfig'

definePage({
  meta: {
    layout: 'blank',
    unauthenticatedOnly: true,
  },
})

// ── Composables ───────────────────────────────────────────────────────────────
const route = useRoute()
const { login, isLoading, loginError, isLockedOut, lockoutRemainingFormatted, syncLockout } = useAuth()

// ── Form State ────────────────────────────────────────────────────────────────
const refVForm = ref()
const isPasswordVisible = ref(false)

// `phoneNumber` holds ONLY the 9-digit local part; the field renders the
// leading `0` as a fixed prefix and `toFullPhone` reassembles the wire format
// (`0` + 9 digits — the only shape the backend matches) on submit.
const credentials = ref({
  phoneNumber: '',
  password: '',
  remember: false,
})

// Keep whatever is typed or pasted (0…, +963…, 00963…) reduced to the local
// 9 digits, so the prefix can never end up duplicated in the value. Writing the
// cleaned value back through the same binding is what makes Vue patch the DOM
// input, so an over-long paste or a stray letter cannot linger on screen — which
// is also why the field carries no `maxlength`: that would clip a pasted
// "+963981491713" to nine characters before this ever saw it.
watch(() => credentials.value.phoneNumber, value => {
  const cleaned = toLocalPhone(value)

  if (cleaned !== value) credentials.value.phoneNumber = cleaned
})

// ── Session Expired Banner ────────────────────────────────────────────────────
const sessionExpired = computed(() => route.query.session === 'expired')

// ── Lockout Countdown ─────────────────────────────────────────────────────────
// Keeps the displayed countdown ticking every second while locked out
let lockoutInterval = null

const startLockoutCountdown = () => {
  if (lockoutInterval) return
  lockoutInterval = setInterval(() => {
    syncLockout()
    if (!isLockedOut.value) {
      clearInterval(lockoutInterval)
      lockoutInterval = null
    }
  }, 1000)
}

watch(isLockedOut, locked => {
  if (locked) {
    startLockoutCountdown()
  } else {
    if (lockoutInterval) {
      clearInterval(lockoutInterval)
      lockoutInterval = null
    }
  }
}, { immediate: true })

onUnmounted(() => {
  if (lockoutInterval) clearInterval(lockoutInterval)
})

// ── Clear error on input change ───────────────────────────────────────────────
watch(() => [credentials.value.phoneNumber, credentials.value.password], () => {
  if (loginError.value) loginError.value = ''
})

// ── Submit ────────────────────────────────────────────────────────────────────
const onSubmit = () => {
  refVForm.value?.validate().then(({ valid: isValid }) => {
    if (!isValid) return

    const redirectTo = route.query.to ? String(route.query.to) : '/'

    login(toFullPhone(credentials.value.phoneNumber), credentials.value.password, redirectTo)
  })
}
</script>

<template>
  <div class="auth-wrapper d-flex align-center justify-center pa-4">
    <div class="position-relative my-sm-16">
      <!-- Top decorative shape -->
      <VNodeRenderer
        :nodes="h('div', { innerHTML: authV1TopShape })"
        class="text-primary auth-v1-top-shape d-none d-sm-block"
      />

      <!-- Bottom decorative shape -->
      <VNodeRenderer
        :nodes="h('div', { innerHTML: authV1BottomShape })"
        class="text-primary auth-v1-bottom-shape d-none d-sm-block"
      />

      <!-- Auth Card -->
      <VCard
        class="auth-card"
        max-width="460"
        :class="$vuetify.display.smAndUp ? 'pa-6' : 'pa-0'"
      >
        <!-- Logo -->
        <VCardItem class="justify-center">
          <VCardTitle>
            <RouterLink to="/">
              <div class="app-logo">
                <VNodeRenderer :nodes="themeConfig.app.logo" />
                <h1 class="app-logo-title">
                  {{ themeConfig.app.title }}
                </h1>
              </div>
            </RouterLink>
          </VCardTitle>
        </VCardItem>

        <!-- Heading -->
        <VCardText>
          <h4 class="text-h4 mb-1">
            مرحبًا بك في <span>{{ themeConfig.app.title }}</span> 👋🏻
          </h4>
          <p class="mb-0">
            سجّل الدخول إلى حسابك للمتابعة
          </p>
        </VCardText>

        <VCardText>
          <!-- Session expired alert -->
          <VAlert
            v-if="sessionExpired"
            type="warning"
            variant="tonal"
            class="mb-4"
            closable
            icon="tabler-alert-triangle"
          >
            انتهت جلستك أو تم إنهاؤها من جهاز آخر. الرجاء تسجيل الدخول من جديد.
          </VAlert>

          <!-- Lockout alert with live countdown -->
          <VAlert
            v-if="isLockedOut"
            type="error"
            variant="tonal"
            class="mb-4"
            icon="tabler-lock"
          >
            <template v-if="loginError">
              <p class="mb-1 font-weight-medium">
                {{ loginError }}
              </p>
              <p class="mb-0 text-sm">
                الوقت المتبقّي: <strong dir="ltr">{{ lockoutRemainingFormatted }}</strong>
              </p>
            </template>
            <template v-else>
              <p class="mb-1 font-weight-medium">
                تم قفل الحساب مؤقتًا
              </p>
              <p class="mb-0 text-sm">
                تم تجاوز عدد المحاولات المسموح بها. الرجاء المحاولة بعد
                <strong dir="ltr">{{ lockoutRemainingFormatted }}</strong>.
              </p>
            </template>
          </VAlert>

          <!-- Login error alert -->
          <VAlert
            v-else-if="loginError"
            type="error"
            variant="tonal"
            class="mb-4"
            closable
            icon="tabler-alert-circle"
            @click:close="loginError = ''"
          >
            {{ loginError }}
          </VAlert>

          <!-- Login Form -->
          <VForm
            ref="refVForm"
            @submit.prevent="onSubmit"
          >
            <VRow>
              <!-- Phone number -->
              <VCol cols="12">
                <AppTextField
                  id="login-phone"
                  v-model="credentials.phoneNumber"
                  class="phone-field"
                  autofocus
                  label="رقم الهاتف"
                  type="tel"
                  inputmode="numeric"
                  autocomplete="tel-national"
                  :prefix="PHONE_TRUNK_PREFIX"
                  placeholder="981491713"
                  dir="ltr"
                  :rules="[localPhoneValidator]"
                  :disabled="isLockedOut || isLoading"
                />
              </VCol>

              <!-- Password -->
              <VCol cols="12">
                <AppTextField
                  id="login-password"
                  v-model="credentials.password"
                  label="كلمة المرور"
                  placeholder="············"
                  dir="ltr"
                  :rules="[requiredValidator]"
                  :type="isPasswordVisible ? 'text' : 'password'"
                  autocomplete="current-password"
                  :append-inner-icon="isPasswordVisible ? 'tabler-eye-off' : 'tabler-eye'"
                  :disabled="isLockedOut || isLoading"
                  @click:append-inner="isPasswordVisible = !isPasswordVisible"
                />

                <!-- Remember me + Forgot password -->
                <div class="d-flex align-center justify-space-between flex-wrap my-6">
                  <VCheckbox
                    v-model="credentials.remember"
                    label="تذكّرني"
                    :disabled="isLockedOut || isLoading"
                  />
                  <RouterLink
                    class="text-primary"
                    :to="{ name: 'forgot-password' }"
                  >
                    نسيت كلمة المرور؟
                  </RouterLink>
                </div>

                <!-- Submit button -->
                <VBtn
                  id="login-submit-btn"
                  block
                  type="submit"
                  :loading="isLoading"
                  :disabled="isLockedOut || isLoading"
                >
                  تسجيل الدخول
                </VBtn>
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
      </VCard>
    </div>
  </div>
</template>

<style lang="scss">
@use "@core/scss/template/pages/page-auth";
</style>
