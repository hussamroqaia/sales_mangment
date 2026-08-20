<script setup>
/**
 * TrackingDashboard.vue
 *
 * The Tracking module's single view, organised as two stacked cards — the same
 * card-per-concern layout the other logistics views use:
 *
 *   1. Live Tracking  — GET /tracking/latest for the initial snapshot, then the
 *                       SSE stream /tracking/live keeps it updated.
 *   2. Trail History  — GET /tracking/reps/{repId}/trail?date=YYYY-MM-DD,
 *                       completely independent of live state.
 *
 * Stacked cards rather than tabs on purpose: a Leaflet map inside a hidden tab
 * panel renders at zero size and needs an invalidateSize() dance on every tab
 * switch. Both maps stay visible and correct here.
 *
 * All Axios/SSE access lives in the service layer; state/logic in useTracking.
 *
 * ⚠️ No GPS capture: this dashboard only reads positions. `POST /tracking/gps`
 *    and `navigator.geolocation` appear nowhere in this module.
 */

import LiveTrackingMap from '@/views/apps/logistics/tracking/LiveTrackingMap.vue'
import TrailMap from '@/views/apps/logistics/tracking/TrailMap.vue'
import RepresentativeSelect from '@/views/apps/logistics/RepresentativeSelect.vue'
import {
  useTracking,
  TRACKING_MANAGER_ROLES,
  formatTrackingDateTime,
  formatTrackingTime,
  formatRelativeTime,
} from '@/composables/useTracking'
import { useAuth } from '@/composables/useAuth'

const { userData } = useAuth()

// The route already gates this page through CASL; this is the in-view guard so
// a role that somehow reaches it never opens a stream it may not read.
// Backend authorisation remains authoritative.
const isTrackingManager = computed(() =>
  TRACKING_MANAGER_ROLES.includes(userData.value?.role?.toLowerCase()))

const {
  representatives,
  mappableRepresentatives,
  invalidCoordinateCount,
  outsideMapRangeCount,
  activeCount,
  isLatestLoading,
  latestError,
  isLatestEmpty,
  lastSyncedAt,

  liveStatus,
  liveError,
  liveErrorStatus,

  selectedRepresentativeId,
  selectedDate,
  trail,
  trailSummary,
  isTrailLoading,
  trailError,
  isTrailEmpty,
  canFetchTrail,

  now,

  initLiveTracking,
  fetchLatest,
  restartLive,
  fetchTrail,
  clearTrail,
  teardown,
} = useTracking()

// ── Live connection indicator ─────────────────────────────────────────────────
const LIVE_STATUS_META = {
  idle: { color: 'secondary', label: 'غير متصل', icon: 'tabler-plug-connected-x' },
  connecting: { color: 'info', label: 'جارٍ الاتصال…', icon: 'tabler-loader' },
  connected: { color: 'success', label: 'مباشر', icon: 'tabler-broadcast' },
  reconnecting: { color: 'warning', label: 'جارٍ إعادة الاتصال…', icon: 'tabler-refresh' },
  unavailable: { color: 'error', label: 'غير متاح', icon: 'tabler-plug-connected-x' },
  disconnected: { color: 'secondary', label: 'انقطع الاتصال', icon: 'tabler-plug-connected-x' },
}

const liveMeta = computed(() => LIVE_STATUS_META[liveStatus.value] ?? LIVE_STATUS_META.idle)

// A transient reconnect is shown inline on the chip only — never as a toast, and
// never by blanking the map. The banner is reserved for a terminal failure.
const showLiveBlocker = computed(() => liveStatus.value === 'unavailable')

const liveBlockerText = computed(() => {
  if (liveErrorStatus.value === 403) {
    return 'حسابك لا يملك صلاحية الوصول إلى بث التتبع المباشر. '
      + 'المواقع المعروضة أدناه هي آخر ما تم تسجيله ولن تُحدَّث لحظيًا.'
  }

  return liveError.value || 'بث التتبع المباشر غير متاح حاليًا.'
})

const lastSyncLabel = computed(() =>
  (lastSyncedAt.value ? formatRelativeTime(lastSyncedAt.value, now.value) : '—'))

// ── Representative overview table ─────────────────────────────────────────────
const representativeHeaders = [
  { title: 'المندوب', key: 'representativeName', sortable: false },
  { title: 'الحالة', key: 'isLive', sortable: false },
  { title: 'آخر تحديث', key: 'recordedAt', sortable: false },
  { title: 'الإحداثيات', key: 'coordinates', sortable: false },
]

// Always the values the API returned — never the clamped map position.
const coordinateLabel = rep =>
  (rep.hasValidCoordinates
    ? `${Number(rep.latitude).toFixed(5)}, ${Number(rep.longitude).toFixed(5)}`
    : 'إحداثيات غير صالحة')

// ── Trail ─────────────────────────────────────────────────────────────────────
const selectedRepresentativeName = ref('')

const onRepresentativeSelect = user => {
  selectedRepresentativeName.value = user?.name ?? ''
}

// Changing the selection invalidates the trail on screen so the metadata can
// never describe a different representative/date than the map shows.
watch([selectedRepresentativeId, selectedDate], () => {
  if (trail.value.length || trailError.value) clearTrail()
})

// ── Lifecycle ─────────────────────────────────────────────────────────────────
// Snapshot first, stream second — the stream may stay silent until somebody
// moves, so it can never provide the initial state.
onMounted(() => {
  if (isTrackingManager.value) initLiveTracking()
})

// Stream is closed on unmount / navigation — no orphan connection survives.
onBeforeUnmount(teardown)
</script>

<template>
  <section>
    <!-- Role guard (UX only — the backend is authoritative) -->
    <VAlert
      v-if="!isTrackingManager"
      type="warning"
      variant="tonal"
    >
      ليس لديك صلاحية لعرض تتبع المندوبين.
    </VAlert>

    <template v-else>
      <!-- ══ Live Tracking ══════════════════════════════════════════════════ -->
      <VCard class="mb-6">
        <VCardItem>
          <VCardTitle>التتبع المباشر</VCardTitle>
          <VCardSubtitle>الموقع الحالي لكل مندوب مبيعات</VCardSubtitle>

          <template #append>
            <div class="d-flex align-center gap-3 flex-wrap justify-end">
              <div class="text-caption text-disabled text-no-wrap">
                آخر مزامنة: {{ lastSyncLabel }}
              </div>

              <VChip
                :color="liveMeta.color"
                size="small"
                label
              >
                <VIcon
                  :icon="liveMeta.icon"
                  size="14"
                  start
                />
                {{ liveMeta.label }}
              </VChip>

              <VBtn
                icon
                variant="text"
                color="default"
                size="small"
                :loading="isLatestLoading"
                title="تحديث البيانات"
                @click="fetchLatest"
              >
                <VIcon icon="tabler-refresh" />
              </VBtn>
            </div>
          </template>
        </VCardItem>

        <VDivider />

        <!--
          Terminal stream failure (e.g. 403). Transient reconnects are only
          reflected on the chip above — the map is never blanked. 
        -->
        <VCardText
          v-if="showLiveBlocker"
          class="pb-0"
        >
          <VAlert
            type="error"
            variant="tonal"
            density="compact"
          >
            <div class="d-flex align-center justify-space-between flex-wrap gap-2">
              <span>{{ liveBlockerText }}</span>
              <VBtn
                size="small"
                variant="tonal"
                color="error"
                prepend-icon="tabler-refresh"
                @click="restartLive"
              >
                إعادة المحاولة
              </VBtn>
            </div>
          </VAlert>
        </VCardText>

        <!-- Snapshot error -->
        <VCardText
          v-if="latestError"
          class="pb-0"
        >
          <VAlert
            type="error"
            variant="tonal"
            density="compact"
          >
            {{ latestError }}
          </VAlert>
        </VCardText>

        <!-- Loading the initial snapshot -->
        <VCardText
          v-if="isLatestLoading && !representatives.length"
          class="d-flex flex-column align-center justify-center py-16 gap-3"
        >
          <VProgressCircular
            indeterminate
            size="44"
            color="primary"
          />
          <span class="text-body-2 text-medium-emphasis">جارٍ تحميل مواقع المندوبين…</span>
        </VCardText>

        <!-- Empty snapshot — a valid response, not an error -->
        <VCardText
          v-else-if="isLatestEmpty"
          class="d-flex flex-column align-center justify-center py-16 gap-2"
        >
          <VIcon
            icon="tabler-map-pin-off"
            size="40"
            color="secondary"
          />
          <span class="text-body-2 text-medium-emphasis">لا تتوفّر مواقع للمندوبين حتى الآن.</span>
        </VCardText>

        <!-- Map + overview -->
        <template v-else-if="representatives.length">
          <VCardText class="pa-0">
            <LiveTrackingMap :representatives="mappableRepresentatives" />
          </VCardText>

          <VAlert
            v-if="invalidCoordinateCount"
            type="warning"
            variant="tonal"
            density="compact"
            class="ma-4 mb-0"
          >
            {{ invalidCoordinateCount }} representative position(s) have coordinates outside the valid
            range and are listed below without being mapped.
          </VAlert>

          <!--
            Valid data the projection cannot draw: Web Mercator stops at ±85.05°
            while the API allows ±90. The pin is pulled to the nearest drawable
            point, so the map must not imply it is exact.
          -->
          <VAlert
            v-if="outsideMapRangeCount"
            type="info"
            variant="tonal"
            density="compact"
            class="ma-4 mb-0"
          >
            {{ outsideMapRangeCount }} من المواقع خارج حدود خطوط العرض ±85.05° للخريطة.
            تُرسم علاماتها عند أقرب نقطة ممكنة، ويعرض الجدول أدناه الإحداثيات الفعلية
            كما وردت من الخادم.
          </VAlert>

          <VCardItem class="pb-2">
            <VCardTitle class="text-h6">
              المندوبون
            </VCardTitle>
            <VCardSubtitle>
              {{ activeCount }} of {{ representatives.length }} active in the last 15 minutes
            </VCardSubtitle>
          </VCardItem>

          <VDataTable
            :headers="representativeHeaders"
            :items="representatives"
            item-value="representativeId"
            :items-per-page="10"
            class="text-no-wrap"
          >
            <template #item.representativeName="{ item }">
              <span class="font-weight-medium">
                {{ item.representativeName || `Rep #${item.representativeId}` }}
              </span>
            </template>

            <template #item.isLive="{ item }">
              <VChip
                :color="item.isLive ? 'success' : 'secondary'"
                size="small"
                label
              >
                {{ item.isLive ? 'نشط' : 'غير نشط' }}
              </VChip>
            </template>

            <template #item.recordedAt="{ item }">
              {{ formatTrackingDateTime(item.recordedAt) }}
            </template>

            <template #item.coordinates="{ item }">
              <span :class="item.hasValidCoordinates ? 'text-medium-emphasis' : 'text-error'">
                {{ coordinateLabel(item) }}
              </span>
              <VTooltip
                v-if="item.isOutsideMapRange"
                text="خارج حدود خطوط العرض ±85.05° للخريطة — تم رسم العلامة عند أقرب نقطة يسمح بها الإسقاط."
              >
                <template #activator="{ props: tooltipProps }">
                  <VIcon
                    v-bind="tooltipProps"
                    icon="tabler-alert-triangle"
                    size="16"
                    color="warning"
                    class="ms-2"
                  />
                </template>
              </VTooltip>
            </template>

            <template #bottom>
              <VDivider />
              <div class="d-flex justify-end pa-4 text-caption text-disabled">
                تُحتسب الحالة من وقت آخر تسجيل وفق قاعدة الـ15 دقيقة المعتمدة في الخادم.
              </div>
            </template>
          </VDataTable>
        </template>
      </VCard>

      <!-- ══ Trail History ══════════════════════════════════════════════════ -->
      <VCard>
        <VCardItem>
          <VCardTitle>سجلّ المسار</VCardTitle>
          <VCardSubtitle>حركة مندوب واحد خلال يوم محدّد</VCardSubtitle>
        </VCardItem>

        <VDivider />

        <VCardText>
          <VRow align="center">
            <VCol
              cols="12"
              md="4"
              sm="6"
            >
              <RepresentativeSelect
                v-model="selectedRepresentativeId"
                label="المندوب"
                placeholder="اختر المندوب"
                clearable
                @select="onRepresentativeSelect"
              />
            </VCol>

            <VCol
              cols="12"
              md="4"
              sm="6"
            >
              <!--
                Calendar date, never an instant: flatpickr emits `Y-m-d`
                verbatim, so no timezone conversion can shift the day. 
              -->
              <AppDateTimePicker
                v-model="selectedDate"
                label="التاريخ"
                placeholder="سنة-شهر-يوم"
                :config="{ dateFormat: 'Y-m-d' }"
              />
            </VCol>

            <VCol
              cols="12"
              md="4"
              class="d-flex gap-3"
            >
              <VBtn
                :disabled="!canFetchTrail"
                :loading="isTrailLoading"
                prepend-icon="tabler-route"
                @click="fetchTrail"
              >
                عرض المسار
              </VBtn>

              <VBtn
                v-if="trail.length || trailError"
                variant="tonal"
                color="secondary"
                @click="clearTrail"
              >
                مسح
              </VBtn>
            </VCol>
          </VRow>
        </VCardText>

        <VDivider />

        <!-- Trail error -->
        <VCardText v-if="trailError">
          <VAlert
            type="error"
            variant="tonal"
            density="compact"
          >
            {{ trailError }}
          </VAlert>
        </VCardText>

        <!-- Trail loading -->
        <VCardText
          v-else-if="isTrailLoading"
          class="d-flex flex-column align-center justify-center py-16 gap-3"
        >
          <VProgressCircular
            indeterminate
            size="44"
            color="primary"
          />
          <span class="text-body-2 text-medium-emphasis">جارٍ تحميل المسار…</span>
        </VCardText>

        <!-- Trail empty — a valid response, not an error -->
        <VCardText
          v-else-if="isTrailEmpty"
          class="d-flex flex-column align-center justify-center py-16 gap-2"
        >
          <VIcon
            icon="tabler-route-off"
            size="40"
            color="secondary"
          />
          <span class="text-body-2 text-medium-emphasis">
            لا توجد بيانات تتبع مسجّلة لهذا المندوب في التاريخ المحدد.
          </span>
        </VCardText>

        <!-- Trail loaded -->
        <template v-else-if="trail.length">
          <VCardText class="pb-0">
            <VRow>
              <VCol
                cols="6"
                md="3"
              >
                <div class="text-caption text-disabled mb-1">
                  المندوب
                </div>
                <div class="text-body-1 font-weight-medium">
                  {{ selectedRepresentativeName || `Rep #${selectedRepresentativeId}` }}
                </div>
              </VCol>

              <VCol
                cols="6"
                md="3"
              >
                <div class="text-caption text-disabled mb-1">
                  النقاط المسجّلة
                </div>
                <div class="text-body-1 font-weight-medium">
                  {{ trailSummary.pointCount }}
                </div>
              </VCol>

              <VCol
                cols="6"
                md="3"
              >
                <div class="text-caption text-disabled mb-1">
                  أول تسجيل
                </div>
                <div class="text-body-1 font-weight-medium">
                  {{ formatTrackingTime(trailSummary.firstRecordedAt) }}
                </div>
              </VCol>

              <VCol
                cols="6"
                md="3"
              >
                <div class="text-caption text-disabled mb-1">
                  آخر تسجيل
                </div>
                <div class="text-body-1 font-weight-medium">
                  {{ formatTrackingTime(trailSummary.lastRecordedAt) }}
                </div>
              </VCol>
            </VRow>
          </VCardText>

          <VCardText class="pa-0 mt-4">
            <TrailMap :points="trail" />
          </VCardText>
        </template>

        <!-- Idle -->
        <VCardText
          v-else
          class="d-flex flex-column align-center justify-center py-16 gap-2"
        >
          <VIcon
            icon="tabler-map-search"
            size="40"
            color="secondary"
          />
          <span class="text-body-2 text-medium-emphasis">
            اختر المندوب والتاريخ، ثم اضغط «عرض المسار».
          </span>
        </VCardText>
      </VCard>
    </template>
  </section>
</template>
