<script setup>
import { normalizeNotification, useNotifications } from '@/composables/useNotifications'
import { fetchNotifications } from '@/services/notification.service'
import { resolveApiError } from '@/utils/apiErrors'
import { countAr } from '@/utils/locale'

definePage({
  meta: {
    action: 'read',
    subject: 'Auth',
  },
})

// The composable owns the shared navbar feed and the unread badge; this page
// owns its own paginated slice. Mutations go through the composable so both
// stay in step — the page never writes to the shared state directly.
const {
  fetchCount,
  markRead,
  markAllRead,
  handleNotificationClick,
} = useNotifications()

// ── Page-local state ──────────────────────────────────────────────────────
// Deliberately NOT the composable's `loading`/`error`: those drive the navbar
// dropdown, and a page-level load has no business putting the dropdown into a
// loading or error state.
const isLoading = ref(false)
const loadError = ref('')

const currentPage = ref(0)
const pageSize = ref(20)
const totalPages = ref(1)
const totalElements = ref(0)
const allNotifications = ref([])

const snackbar = ref({ show: false, message: '', color: 'success' })

const notify = (message, color = 'success') => {
  snackbar.value = { show: true, message, color }
}

const hasUnread = computed(() => allNotifications.value.some(n => !n.isSeen))

// ── Load page ─────────────────────────────────────────────────────────────
const loadPage = async (page = 0) => {
  isLoading.value = true
  loadError.value = ''

  try {
    const data = await fetchNotifications({ page, size: pageSize.value })

    // Handle both paginated and plain array responses
    if (Array.isArray(data)) {
      allNotifications.value = data.map(n => normalizeNotification(n, { absoluteTime: true }))
      totalElements.value = data.length
      totalPages.value = 1
    } else {
      const content = Array.isArray(data?.content) ? data.content : []

      allNotifications.value = content.map(n => normalizeNotification(n, { absoluteTime: true }))
      totalElements.value = data?.totalElements ?? content.length
      totalPages.value = data?.totalPages ?? 1
    }

    currentPage.value = page
  } catch (err) {
    console.warn('[Notifications Page] Failed to load:', err.message)
    loadError.value = resolveApiError(err, 'تعذّر تحميل الإشعارات. الرجاء المحاولة مرة أخرى.')
    allNotifications.value = []
  } finally {
    isLoading.value = false
  }
}

// ── Click: mark read on the server, then follow the record it points at ───
const onNotificationClick = async notification => {
  const wasUnread = !notification.isSeen

  await handleNotificationClick(notification)

  // The composable only owns the shared feed; mirror the result onto this row.
  if (wasUnread) {
    const item = allNotifications.value.find(n => n.id === notification.id)

    if (item) item.isSeen = true
  }
}

// ── Mark one as read without opening it ───────────────────────────────────
const markingId = ref(null)

const onMarkRead = async notification => {
  markingId.value = notification.id

  const ok = await markRead(notification.id)

  markingId.value = null

  if (ok) {
    const item = allNotifications.value.find(n => n.id === notification.id)

    if (item) item.isSeen = true
  } else {
    notify('تعذّر تعليم الإشعار كمقروء. الرجاء المحاولة مرة أخرى.', 'error')
  }
}

// ── Mark all ──────────────────────────────────────────────────────────────
const isMarkingAll = ref(false)

const onMarkAllRead = async () => {
  isMarkingAll.value = true

  const ok = await markAllRead()

  isMarkingAll.value = false

  if (!ok) {
    notify('تعذّر تعليم الإشعارات كمقروءة. الرجاء المحاولة مرة أخرى.', 'error')

    return
  }

  // read-all covers every page, not just the loaded one — reload the current
  // page from the backend rather than assuming what it now contains.
  await loadPage(currentPage.value)
  await fetchCount()
  notify('تم تعليم جميع الإشعارات كمقروءة.')
}

// ── Pagination ────────────────────────────────────────────────────────────
const onPageChange = page => {
  loadPage(page - 1)  // Vuetify pagination is 1-based, backend is 0-based
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
              الإشعارات
            </h4>
            <p
              v-if="totalElements"
              class="text-body-1 text-disabled mb-0"
            >
              {{ countAr(totalElements, { one: 'إشعار', two: 'إشعاران', few: 'إشعارات', many: 'إشعارًا', other: 'إشعار' }) }} إجمالًا
            </p>
          </div>

          <VBtn
            v-if="hasUnread"
            variant="tonal"
            color="primary"
            prepend-icon="tabler-mail-opened"
            :loading="isMarkingAll"
            :disabled="isMarkingAll || isLoading"
            @click="onMarkAllRead"
          >
            تعليم الكل كمقروء
          </VBtn>
        </div>
      </VCol>
    </VRow>

    <!-- Error state -->
    <VCard
      v-if="loadError && !isLoading"
      class="text-center pa-8 mb-4"
    >
      <VIcon
        icon="tabler-wifi-off"
        size="64"
        color="disabled"
        class="mb-4"
      />
      <h5 class="text-h5 text-disabled mb-2">
        تعذّر تحميل الإشعارات
      </h5>
      <p class="text-body-2 text-disabled mb-4">
        {{ loadError }}
      </p>
      <VBtn
        color="primary"
        @click="retry"
      >
        إعادة المحاولة
      </VBtn>
    </VCard>

    <!-- Loading skeleton -->
    <div v-else-if="isLoading && !allNotifications.length">
      <VCard
        v-for="i in 5"
        :key="i"
        class="mb-2"
      >
        <VSkeletonLoader type="list-item-avatar-two-line" />
      </VCard>
    </div>

    <!-- Empty state -->
    <VCard
      v-else-if="!allNotifications.length"
      class="text-center pa-8"
    >
      <VIcon
        icon="tabler-bell-off"
        size="64"
        color="disabled"
        class="mb-4"
      />
      <h5 class="text-h5 text-disabled mb-2">
        لا توجد إشعارات
      </h5>
      <p class="text-body-2 text-disabled">
        لا يوجد جديد حاليًا. ستظهر الإشعارات الجديدة هنا.
      </p>
    </VCard>

    <!-- Notification list -->
    <VCard
      v-else
      :loading="isLoading"
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
              <div class="d-flex align-center gap-3">
                <span class="text-xs text-disabled text-no-wrap">
                  {{ notification.time }}
                </span>

                <VProgressCircular
                  v-if="markingId === notification.id"
                  indeterminate
                  size="18"
                  width="2"
                  color="primary"
                />
                <IconBtn
                  v-else-if="!notification.isSeen"
                  size="small"
                  @click.stop="onMarkRead(notification)"
                >
                  <VIcon
                    icon="tabler-mail-opened"
                    size="20"
                  />
                  <VTooltip
                    activator="parent"
                    location="start"
                  >
                    تعليم كمقروء
                  </VTooltip>
                </IconBtn>

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
          :disabled="isLoading"
          @update:model-value="onPageChange"
        />
      </VCardText>
    </VCard>

    <!-- Feedback -->
    <VSnackbar
      v-model="snackbar.show"
      :color="snackbar.color"
      location="bottom end"
      :timeout="3500"
    >
      <div class="d-flex align-center gap-2">
        <VIcon
          :icon="snackbar.color === 'success' ? 'tabler-circle-check' : 'tabler-alert-circle'"
          size="20"
        />
        <span>{{ snackbar.message }}</span>
      </div>
    </VSnackbar>
  </div>
</template>

<style scoped>
.unread-bg {
  background-color: rgba(var(--v-theme-primary), 0.04);
}
</style>
