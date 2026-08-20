<script setup>
import { PerfectScrollbar } from 'vue3-perfect-scrollbar'

// Use the centralized auth composable so logout fires the real API.
import { resolveRoleTitle } from '@/composables/useUsers'

const { logout, userData: authUserData, isLoading } = useAuth()

// Keep the cookie ref as well for the template (same source of truth).
const userData = authUserData

// Menu entries below the identity block. The Vuexy demo list (a hardcoded
// "Profile" link to user id 21, Settings, Billing Plan, Pricing and FAQ) pointed
// at template pages that do not exist in this application, so only the divider
// above the Logout button remains. Add real entries here as those screens land.
const userProfileList = [
  { type: 'divider' },
]

// The session cookie stores the backend role verbatim (`SALES_MANAGER`); the
// menu shows its Arabic label; resolveRoleTitle falls back to the raw value
// for a role the options list does not cover.
const roleLabel = computed(() => {
  const role = userData.value?.role

  if (!role) return ''

  return resolveRoleTitle(role)
})
</script>

<template>
  <VBadge
    v-if="userData"
    dot
    bordered
    location="bottom right"
    offset-x="1"
    offset-y="2"
    color="success"
  >
    <VAvatar
      size="38"
      class="cursor-pointer"
      :color="!(userData && userData.avatar) ? 'primary' : undefined"
      :variant="!(userData && userData.avatar) ? 'tonal' : undefined"
    >
      <VImg
        v-if="userData && userData.avatar"
        :src="userData.avatar"
      />
      <VIcon
        v-else
        icon="tabler-user"
      />

      <!-- SECTION Menu -->
      <VMenu
        activator="parent"
        width="240"
        location="bottom end"
        offset="12px"
      >
        <VList>
          <VListItem>
            <div class="d-flex gap-2 align-center">
              <VListItemAction>
                <VBadge
                  dot
                  location="bottom right"
                  offset-x="3"
                  offset-y="3"
                  color="success"
                  bordered
                >
                  <VAvatar
                    :color="!(userData && userData.avatar) ? 'primary' : undefined"
                    :variant="!(userData && userData.avatar) ? 'tonal' : undefined"
                  >
                    <VImg
                      v-if="userData && userData.avatar"
                      :src="userData.avatar"
                    />
                    <VIcon
                      v-else
                      icon="tabler-user"
                    />
                  </VAvatar>
                </VBadge>
              </VListItemAction>

              <div>
                <h6 class="text-h6 font-weight-medium">
                  <!-- API returns `name`; fall back to the phone number if missing -->
                  {{ userData?.name || userData?.fullName || formatPhoneNumber(userData?.phoneNumber) }}
                </h6>
                <VListItemSubtitle class="text-disabled">
                  {{ roleLabel }}
                </VListItemSubtitle>
              </div>
            </div>
          </VListItem>

          <PerfectScrollbar :options="{ wheelPropagation: false }">
            <template
              v-for="item in userProfileList"
              :key="item.title"
            >
              <VListItem
                v-if="item.type === 'navItem'"
                :to="item.to"
              >
                <template #prepend>
                  <VIcon
                    :icon="item.icon"
                    size="22"
                  />
                </template>

                <VListItemTitle>{{ item.title }}</VListItemTitle>

                <template
                  v-if="item.badgeProps"
                  #append
                >
                  <VBadge
                    rounded="sm"
                    class="me-3"
                    v-bind="item.badgeProps"
                  />
                </template>
              </VListItem>

              <VDivider
                v-else
                class="my-2"
              />
            </template>

            <div class="px-4 py-2">
              <VBtn
                block
                size="small"
                color="error"
                append-icon="tabler-logout"
                :loading="isLoading"
                :disabled="isLoading"
                @click="logout"
              >
                تسجيل الخروج
              </VBtn>
            </div>
          </PerfectScrollbar>
        </VList>
      </VMenu>
      <!-- !SECTION -->
    </VAvatar>
  </VBadge>
</template>
