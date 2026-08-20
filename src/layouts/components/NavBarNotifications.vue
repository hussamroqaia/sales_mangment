<script setup>
import { useNotifications } from '@/composables/useNotifications'
import { PerfectScrollbar } from 'vue3-perfect-scrollbar'

// The template has two roots (the teleported snackbar and the bell button), so
// Vue cannot place an inherited `class` on its own. The layout passes one, and
// it belongs on the bell — bound explicitly below.
defineOptions({ inheritAttrs: false })

const {
  notifications,
  unreadCount,
  loading,
  error,
  fetchFeed,
  fetchCount,
  markRead,
  markAllRead,
  handleNotificationClick: composableClickHandler,
} = useNotifications()

// ── Toast / Snackbar ──────────────────────────────────────────────────────
// Serves both the incoming-FCM toast and failure feedback for the mark-read
// actions, so the navbar never fails silently.
const toastVisible = ref(false)
const toastTitle = ref('')
const toastBody = ref('')
const toastColor = ref('primary')

const showToast = (title, body = '', color = 'primary') => {
  toastTitle.value = title
  toastBody.value = body
  toastColor.value = color
  toastVisible.value = true
}

const handleToastEvent = event => {
  showToast(event.detail?.title ?? 'إشعار جديد', event.detail?.body ?? '', 'primary')
}

onMounted(() => {
  window.addEventListener('app:notification-toast', handleToastEvent)
})

onUnmounted(() => {
  window.removeEventListener('app:notification-toast', handleToastEvent)
})

// ── Notification click (mark read on the server + navigate) ───────────────
const handleNotificationClick = notification => {
  composableClickHandler(notification)
}

// ── Mark one as read without following its link ───────────────────────────
// Replaces the old X, which removed the row from the local array only: the
// backend exposes no delete endpoint, so the item came straight back on the
// next poll. Marking read is the action the backend actually supports.
const markingId = ref(null)

const handleMarkRead = async notificationId => {
  markingId.value = notificationId

  const ok = await markRead(notificationId)

  markingId.value = null
  if (!ok) showToast('تعذّر تعليم الإشعار كمقروء', 'الرجاء المحاولة مرة أخرى.', 'error')
}

// ── Mark every notification as read ───────────────────────────────────────
const isMarkingAll = ref(false)

const handleMarkAllRead = async () => {
  isMarkingAll.value = true

  const ok = await markAllRead()

  isMarkingAll.value = false
  if (!ok) showToast('تعذّر تعليم الإشعارات كمقروءة', 'الرجاء المحاولة مرة أخرى.', 'error')
}

// ── Retry on error ────────────────────────────────────────────────────────
const retry = () => {
  fetchFeed()
  fetchCount()
}
</script>

<template>
  <!-- Foreground notification toast / action feedback -->
  <VSnackbar
    v-model="toastVisible"
    location="top right"
    :color="toastColor"
    :timeout="5000"
    max-width="350"
  >
    <div class="d-flex align-center gap-3">
      <VIcon
        :icon="toastColor === 'error' ? 'tabler-alert-circle' : 'tabler-bell'"
        size="20"
      />
      <div>
        <div class="text-subtitle-2 font-weight-semibold">
          {{ toastTitle }}
        </div>
        <div
          v-if="toastBody"
          class="text-body-2"
        >
          {{ toastBody }}
        </div>
      </div>
    </div>

    <template #actions>
      <VBtn
        variant="text"
        size="small"
        @click="toastVisible = false"
      >
        إغلاق
      </VBtn>
    </template>
  </VSnackbar>

  <!-- Notification Bell + Dropdown -->
  <IconBtn
    id="notification-btn"
    v-bind="$attrs"
  >
    <VBadge
      :model-value="unreadCount > 0"
      color="error"
      dot
      offset-x="2"
      offset-y="3"
    >
      <VIcon icon="tabler-bell" />
    </VBadge>

    <VMenu
      activator="parent"
      width="380px"
      location="bottom end"
      offset="12px"
      :close-on-content-click="false"
    >
      <VCard class="d-flex flex-column">
        <!-- Header -->
        <VCardItem class="notification-section">
          <VCardTitle class="text-h6">
            الإشعارات
          </VCardTitle>

          <template #append>
            <VChip
              v-show="unreadCount > 0"
              size="small"
              color="primary"
              class="me-2"
            >
              {{ unreadCount > 99 ? '99+' : unreadCount }} جديد
            </VChip>

            <!-- Mark every notification as read -->
            <IconBtn
              v-show="unreadCount > 0"
              size="small"
              :loading="isMarkingAll"
              @click="handleMarkAllRead"
            >
              <VIcon
                icon="tabler-mail-opened"
                size="20"
              />
              <VTooltip
                activator="parent"
                location="bottom"
              >
                تعليم الكل كمقروء
              </VTooltip>
            </IconBtn>

            <!-- Loading indicator -->
            <VProgressCircular
              v-if="loading"
              indeterminate
              size="20"
              width="2"
              color="primary"
              class="ms-2"
            />
          </template>
        </VCardItem>

        <VDivider />

        <!-- Error state -->
        <VCardText
          v-if="error && !loading"
          class="text-center pa-4"
        >
          <VIcon
            icon="tabler-wifi-off"
            size="32"
            color="disabled"
            class="mb-2"
          />
          <p class="text-body-2 text-disabled mb-2">
            {{ error }}
          </p>
          <VBtn
            size="small"
            variant="tonal"
            color="primary"
            @click="retry"
          >
            إعادة المحاولة
          </VBtn>
        </VCardText>

        <!-- Loading skeleton -->
        <div
          v-else-if="loading && !notifications.length"
          class="pa-2"
        >
          <VSkeletonLoader
            v-for="i in 3"
            :key="i"
            type="list-item-avatar-two-line"
          />
        </div>

        <!-- Notification list -->
        <PerfectScrollbar
          v-else
          :options="{ wheelPropagation: false }"
          style="max-block-size: 23.75rem;"
        >
          <VList class="notification-list rounded-0 py-0">
            <template
              v-for="(notification, index) in notifications"
              :key="notification.id"
            >
              <VDivider v-if="index > 0" />
              <VListItem
                link
                lines="one"
                min-height="66px"
                class="list-item-hover-class"
                :class="{ 'unread-notification': !notification.isSeen }"
                @click="handleNotificationClick(notification)"
              >
                <div class="d-flex align-start gap-3">
                  <VAvatar
                    :color="notification.color"
                    variant="tonal"
                    size="38"
                  >
                    <VIcon
                      :icon="notification.icon"
                      size="20"
                    />
                  </VAvatar>

                  <div class="flex-grow-1 overflow-hidden">
                    <p class="text-sm font-weight-medium mb-1 text-truncate">
                      {{ notification.title }}
                    </p>
                    <p
                      class="text-body-2 mb-1 text-truncate"
                      style="letter-spacing: 0.4px !important; line-height: 18px;"
                    >
                      {{ notification.subtitle }}
                    </p>
                    <p
                      class="text-sm text-disabled mb-0"
                      style="letter-spacing: 0.4px !important; line-height: 18px;"
                    >
                      {{ notification.time }}
                    </p>
                  </div>

                  <VSpacer />

                  <div class="d-flex flex-column align-end flex-shrink-0">
                    <!-- Unread dot indicator -->
                    <VIcon
                      size="10"
                      icon="tabler-circle-filled"
                      :color="!notification.isSeen ? 'primary' : '#a8aaae'"
                      class="mb-2"
                    />

                    <!-- Mark read without opening the linked record -->
                    <VProgressCircular
                      v-if="markingId === notification.id"
                      indeterminate
                      size="16"
                      width="2"
                      color="primary"
                    />
                    <VIcon
                      v-else-if="!notification.isSeen"
                      size="20"
                      icon="tabler-mail-opened"
                      class="visible-in-hover"
                      @click.stop="handleMarkRead(notification.id)"
                    >
                      <VTooltip
                        activator="parent"
                        location="start"
                      >
                        تعليم كمقروء
                      </VTooltip>
                    </VIcon>
                  </div>
                </div>
              </VListItem>
            </template>

            <!-- Empty state -->
            <VListItem
              v-show="!notifications.length && !loading && !error"
              class="text-center text-medium-emphasis"
              style="block-size: 80px;"
            >
              <div class="d-flex flex-column align-center">
                <VIcon
                  icon="tabler-bell-off"
                  size="32"
                  class="mb-2 text-disabled"
                />
                <VListItemTitle class="text-disabled">
                  لا توجد إشعارات
                </VListItemTitle>
              </div>
            </VListItem>
          </VList>
        </PerfectScrollbar>

        <VDivider />

        <!-- Footer -->
        <VCardText class="pa-4">
          <VBtn
            block
            size="small"
            :to="{ name: 'notifications' }"
          >
            عرض كل الإشعارات
          </VBtn>
        </VCardText>
      </VCard>
    </VMenu>
  </IconBtn>
</template>

<style lang="scss">
.notification-section {
  padding-block: 0.75rem;
  padding-inline: 1rem;
}

.list-item-hover-class {
  .visible-in-hover {
    display: none;
  }

  &:hover {
    .visible-in-hover {
      display: block;
    }
  }
}

.notification-list.v-list {
  .v-list-item {
    border-radius: 0 !important;
    margin: 0 !important;
    padding-block: 0.75rem !important;
  }
}

.unread-notification {
  background-color: rgba(var(--v-theme-primary), 0.04);
}
</style>
