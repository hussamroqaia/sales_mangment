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

const credentials = ref({
  email: '',
  password: '',
  remember: false,
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
watch(() => [credentials.value.email, credentials.value.password], () => {
  if (loginError.value) loginError.value = ''
})

// ── Submit ────────────────────────────────────────────────────────────────────
const onSubmit = () => {
  refVForm.value?.validate().then(({ valid: isValid }) => {
    if (!isValid) return

    const redirectTo = route.query.to ? String(route.query.to) : '/'

    login(credentials.value.email, credentials.value.password, redirectTo)
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
            Welcome to <span class="text-capitalize">{{ themeConfig.app.title }}</span>! 👋🏻
          </h4>
          <p class="mb-0">
            Please sign-in to your account and start the adventure
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
            Your session expired or was ended on another device. Please sign in again.
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
                Time remaining: <strong>{{ lockoutRemainingFormatted }}</strong>
              </p>
            </template>
            <template v-else>
              <p class="mb-1 font-weight-medium">
                Account temporarily locked
              </p>
              <p class="mb-0 text-sm">
                Too many failed attempts. Try again in
                <strong>{{ lockoutRemainingFormatted }}</strong>.
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
              <!-- Email -->
              <VCol cols="12">
                <AppTextField
                  id="login-email"
                  v-model="credentials.email"
                  autofocus
                  label="Email"
                  type="email"
                  placeholder="johndoe@email.com"
                  :rules="[requiredValidator, emailValidator]"
                  :disabled="isLockedOut || isLoading"
                />
              </VCol>

              <!-- Password -->
              <VCol cols="12">
                <AppTextField
                  id="login-password"
                  v-model="credentials.password"
                  label="Password"
                  placeholder="············"
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
                    label="Remember me"
                    :disabled="isLockedOut || isLoading"
                  />
                  <RouterLink
                    class="text-primary"
                    :to="{ name: 'forgot-password' }"
                  >
                    Forgot Password?
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
                  Login
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
