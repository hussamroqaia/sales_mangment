<script setup>
import { useNotifications } from '@/composables/useNotifications'
import { fetchNotifications } from '@/services/notification.service'

definePage({
  meta: {
    action: 'read',
    subject: 'Auth',
  },
})

const {
  notifications,
  unreadCount,
  loading,
  error,
  fetchFeed,
  fetchCount,
  markRead,
  markAllRead,
  handleNotificationClick,
} = useNotifications()

// ── Pagination state ──────────────────────────────────────────────────────
const currentPage = ref(0)
const pageSize = ref(20)
const totalPages = ref(1)
const totalElements = ref(0)
const allNotifications = ref([])

// ── Load page ─────────────────────────────────────────────────────────────

const loadPage = async (page = 0) => {
  loading.value = true
  error.value = null

  try {
    const data = await fetchNotifications({ page, size: pageSize.value })

    // Handle both paginated and plain array responses
    if (Array.isArray(data)) {
      allNotifications.value = data.map(normalizeNotification)
      totalElements.value = data.length
      totalPages.value = 1
    } else {
      const content = Array.isArray(data?.content) ? data.content : []
      allNotifications.value = content.map(normalizeNotification)
      totalElements.value = data?.totalElements ?? content.length
      totalPages.value = data?.totalPages ?? 1
    }

    currentPage.value = page
  } catch (err) {
    console.warn('[Notifications Page] Failed to load:', err.message)
    error.value = 'Failed to load notifications. Please try again.'
  } finally {
    loading.value = false
  }
}

// ── Notification shape normalizer (same logic as composable) ──────────────
const normalizeNotification = raw => {
  const isRead = raw.read ?? raw.isRead ?? raw.isSeen ?? false
  const body = raw.message ?? raw.body ?? raw.subtitle ?? ''
  const title = raw.title ?? 'Notification'

  let time = ''
  if (raw.createdAt) {
    try {
      const diffMs = Date.now() - new Date(raw.createdAt)
      if (diffMs > 24 * 60 * 60 * 1000) {
        time = new Intl.DateTimeFormat('en', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(raw.createdAt))
      } else if (diffMs > 60 * 60 * 1000) {
        time = `${Math.floor(diffMs / (60 * 60 * 1000))}h ago`
      } else if (diffMs > 60 * 1000) {
        time = `${Math.floor(diffMs / (60 * 1000))}m ago`
      } else {
        time = 'Just now'
      }
    } catch {
      time = raw.createdAt
    }
  }

  return {
    id: raw.id,
    title,
    subtitle: body,
    time,
    isSeen: isRead,
    icon: raw.icon ?? 'tabler-bell',
    color: raw.color ?? 'primary',
    _raw: raw,
  }
}

// ── Click handler ─────────────────────────────────────────────────────────
const onNotificationClick = async notification => {
  await handleNotificationClick(notification)
  // Refresh page item read state
  const item = allNotifications.value.find(n => n.id === notification.id)
  if (item) item.isSeen = true
}

// ── Pagination ────────────────────────────────────────────────────────────
const onPageChange = page => {
  loadPage(page - 1)  // Vuetify pagination is 1-based, backend is 0-based
}

// ── Mark all ─────────────────────────────────────────────────────────────
const onMarkAllRead = async () => {
  await markAllRead()
  allNotifications.value.forEach(n => { n.isSeen = true })
}

// ── Retry ─────────────────────────────────────────────────────────────────
const retry = () => loadPage(currentPage.value)

// ── Initial load ──────────────────────────────────────────────────────────
onMounted(() => {
  loadPage(0)
  fetchCount()
})
</script>

<template>
  <div>
    <VRow>
      <VCol cols="12">
        <!-- Header -->
        <div class="d-flex align-center justify-space-between mb-6">
          <div>
            <h4 class="text-h4 font-weight-semibold">
              Notifications
            </h4>
            <p
              v-if="totalElements"
              class="text-body-1 text-disabled mb-0"
            >
              {{ totalElements }} total notification{{ totalElements !== 1 ? 's' : '' }}
            </p>
          </div>

          <VBtn
            v-if="allNotifications.some(n => !n.isSeen)"
            variant="tonal"
            color="primary"
            prepend-icon="tabler-mail-opened"
            :loading="loading"
            @click="onMarkAllRead"
          >
            Mark all as read
          </VBtn>
        </div>
      </VCol>
    </VRow>

    <!-- Error state -->
    <VCard
      v-if="error && !loading"
      class="text-center pa-8 mb-4"
    >
      <VIcon
        icon="tabler-wifi-off"
        size="64"
        color="disabled"
        class="mb-4"
      />
      <h5 class="text-h5 text-disabled mb-2">
        Failed to load notifications
      </h5>
      <p class="text-body-2 text-disabled mb-4">
        {{ error }}
      </p>
      <VBtn
        color="primary"
        @click="retry"
      >
        Try Again
      </VBtn>
    </VCard>

    <!-- Loading skeleton -->
    <div v-else-if="loading && !allNotifications.length">
      <VCard
        v-for="i in 5"
        :key="i"
        class="mb-2"
      >
        <VCardText class="d-flex align-center gap-4 py-4">
          <VSkeleton
            type="avatar"
            class="flex-shrink-0"
          />
          <div class="flex-grow-1">
            <VSkeleton
              type="text"
              class="mb-2"
              width="60%"
            />
            <VSkeleton
              type="text"
              width="80%"
            />
          </div>
          <VSkeleton
            type="text"
            width="60px"
            class="flex-shrink-0"
          />
        </VCardText>
      </VCard>
    </div>

    <!-- Empty state -->
    <VCard
      v-else-if="!allNotifications.length && !loading"
      class="text-center pa-8"
    >
      <VIcon
        icon="tabler-bell-off"
        size="64"
        color="disabled"
        class="mb-4"
      />
      <h5 class="text-h5 text-disabled mb-2">
        No notifications
      </h5>
      <p class="text-body-2 text-disabled">
        You're all caught up! New notifications will appear here.
      </p>
    </VCard>

    <!-- Notification list -->
    <VCard
      v-else
      :loading="loading"
    >
      <VList class="py-0">
        <template
          v-for="(notification, index) in allNotifications"
          :key="notification.id"
        >
          <VDivider v-if="index > 0" />
          <VListItem
            link
            :class="{ 'unread-bg': !notification.isSeen }"
            @click="onNotificationClick(notification)"
          >
            <template #prepend>
              <VAvatar
                :color="notification.color"
                variant="tonal"
                size="42"
                class="me-1"
              >
                <VIcon
                  :icon="notification.icon"
                  size="22"
                />
              </VAvatar>
            </template>

            <VListItemTitle class="text-sm font-weight-semibold mb-1">
              {{ notification.title }}
            </VListItemTitle>
            <VListItemSubtitle class="text-body-2 mb-0">
              {{ notification.subtitle }}
            </VListItemSubtitle>

            <template #append>
              <div class="d-flex flex-column align-end gap-2">
                <span class="text-xs text-disabled text-no-wrap">
                  {{ notification.time }}
                </span>
                <VIcon
                  size="8"
                  icon="tabler-circle-filled"
                  :color="!notification.isSeen ? 'primary' : 'disabled'"
                />
              </div>
            </template>
          </VListItem>
        </template>
      </VList>

      <!-- Pagination -->
      <VDivider v-if="totalPages > 1" />
      <VCardText
        v-if="totalPages > 1"
        class="d-flex justify-center pa-4"
      >
        <VPagination
          :model-value="currentPage + 1"
          :length="totalPages"
          :total-visible="5"
          @update:model-value="onPageChange"
        />
      </VCardText>
    </VCard>
  </div>
</template>

<style scoped>
.unread-bg {
  background-color: rgba(var(--v-theme-primary), 0.04);
}
</style>
