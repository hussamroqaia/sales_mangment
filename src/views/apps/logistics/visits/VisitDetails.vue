<script setup>
/**
 * VisitDetails.vue
 *
 * Read-only detail view for a single visit (GET /visits/{id}).
 *
 * Layout mirrors RouteDetails: a metadata header card, a check-in/check-out
 * timeline, and an OpenStreetMap panel rendered with the vue-leaflet setup that
 * already ships with this app — no new mapping dependency and no API key.
 *
 * The backend returns 403 when a SALES_REP opens somebody else's visit; that is
 * surfaced as a normal error state, never as a crash.
 */

import { LMap, LTileLayer } from '@vue-leaflet/vue-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Expose L globally so vue-leaflet uses the same instance (use-global-leaflet="true")
window.L = L

import {
  useVisits,
  resolveVisitStatusVariant,
  visitStatusTitle,
  formatVisitDateTime,
  formatVisitDuration,
  parseVisitLocation,
} from '@/composables/useVisits'
import { useAuth } from '@/composables/useAuth'

const props = defineProps({
  visitId: {
    type: [String, Number],
    required: true,
  },
})

const router = useRouter()
const { userData } = useAuth()

// Only the roles that can reach the Routes module get a link out to it.
const ROUTE_MANAGER_ROLES = ['admin', 'sales_manager']

const canOpenRoute = computed(() =>
  ROUTE_MANAGER_ROLES.includes(userData.value?.role?.toLowerCase()))

const {
  selectedVisit,
  isDetailLoading,
  detailError,
  detailStatus,
  fetchVisit,
} = useVisits()

onMounted(() => fetchVisit(props.visitId))

watch(() => props.visitId, id => {
  if (id) fetchVisit(id)
})

// ── Derived values ────────────────────────────────────────────────────────────
const checkInLocation = computed(() =>
  parseVisitLocation(selectedVisit.value?.checkInLocation))

const checkOutLocation = computed(() =>
  parseVisitLocation(selectedVisit.value?.checkOutLocation))

const duration = computed(() => formatVisitDuration(
  selectedVisit.value?.checkInTime,
  selectedVisit.value?.checkOutTime,
))

const mapPoints = computed(() => {
  const points = []

  if (checkInLocation.value) points.push({ ...checkInLocation.value, label: 'تسجيل الوصول', color: '#28C76F' })
  if (checkOutLocation.value) points.push({ ...checkOutLocation.value, label: 'تسجيل المغادرة', color: '#EA5455' })

  return points
})

const defaultCenter = [33.5117, 36.3067]

const mapCenter = computed(() => {
  const first = mapPoints.value[0]

  return first ? [first.lat, first.lng] : defaultCenter
})

const formatCoordinates = location =>
  location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : '—'

// ── Leaflet markers ───────────────────────────────────────────────────────────
let leafletMap = null
let markers = []

const createPinIcon = color => L.divIcon({
  className: 'visit-location-icon',
  html: `<div style="
    background: ${color};
    inline-size: 18px;
    block-size: 18px;
    border-radius: 50%;
    border: 3px solid #fff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 30%);
  "></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -10],
})

const drawMarkers = () => {
  if (!leafletMap) return

  markers.forEach(m => leafletMap.removeLayer(m))
  markers = []

  if (!mapPoints.value.length) return

  mapPoints.value.forEach(point => {
    const marker = L.marker([point.lat, point.lng], { icon: createPinIcon(point.color) })
      .addTo(leafletMap)
      .bindPopup(`<strong>${point.label}</strong>`)

    markers.push(marker)
  })

  if (markers.length > 1) {
    const bounds = L.latLngBounds(mapPoints.value.map(p => [p.lat, p.lng]))

    leafletMap.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 })
  } else {
    leafletMap.setView([mapPoints.value[0].lat, mapPoints.value[0].lng], 15)
  }
}

const onMapReady = map => {
  leafletMap = map
  drawMarkers()
}

watch(mapPoints, drawMarkers)

const goBack = () => {
  router.push({ path: '/visits' })
}

const openRoute = () => {
  router.push({ path: `/routes/${selectedVisit.value?.routeId}` })
}
</script>

<template>
  <section>
    <!-- Loading State -->
    <VCard
      v-if="isDetailLoading"
      class="pa-6"
    >
      <div class="d-flex align-center justify-center py-16">
        <VProgressCircular
          indeterminate
          size="48"
          color="primary"
        />
        <span class="ms-4 text-body-1 text-medium-emphasis">جارٍ تحميل تفاصيل الزيارة…</span>
      </div>
    </VCard>

    <!-- Error State (403 / 404 / network) -->
    <VCard
      v-else-if="detailError"
      class="pa-6"
    >
      <VAlert
        :type="detailStatus === 403 ? 'warning' : 'error'"
        variant="tonal"
        class="mb-4"
      >
        {{ detailError }}
      </VAlert>
      <VBtn
        variant="tonal"
        color="secondary"
        prepend-icon="tabler-arrow-left"
        @click="goBack"
      >
        العودة إلى الزيارات
      </VBtn>
    </VCard>

    <!-- Visit Detail -->
    <div v-else-if="selectedVisit">
      <!-- Header Card -->
      <VCard class="mb-6">
        <VCardItem>
          <template #prepend>
            <VBtn
              icon
              variant="text"
              color="default"
              size="small"
              @click="goBack"
            >
              <VIcon icon="tabler-arrow-left" />
            </VBtn>
          </template>

          <VCardTitle class="text-h5">
            Visit #{{ selectedVisit.id }}
          </VCardTitle>
          <VCardSubtitle>
            {{ selectedVisit.customerName || `Customer #${selectedVisit.customerId}` }}
          </VCardSubtitle>

          <template #append>
            <VChip
              :color="resolveVisitStatusVariant(selectedVisit.status)"
              size="large"
              label
            >
              {{ visitStatusTitle(selectedVisit.status) }}
            </VChip>
          </template>
        </VCardItem>

        <VDivider />

        <VCardText>
          <VRow>
            <VCol
              cols="12"
              sm="3"
            >
              <div class="text-caption text-disabled mb-1">
                العميل
              </div>
              <div class="text-body-1 font-weight-medium">
                {{ selectedVisit.customerName || `Customer #${selectedVisit.customerId}` }}
              </div>
            </VCol>

            <VCol
              cols="12"
              sm="3"
            >
              <div class="text-caption text-disabled mb-1">
                المندوب
              </div>
              <div class="text-body-1 font-weight-medium">
                {{ selectedVisit.representativeName || `Rep #${selectedVisit.representativeId}` }}
              </div>
            </VCol>

            <VCol
              cols="12"
              sm="3"
            >
              <div class="text-caption text-disabled mb-1">
                المسار
              </div>
              <VBtn
                v-if="canOpenRoute && selectedVisit.routeId"
                variant="text"
                size="small"
                class="px-0"
                append-icon="tabler-external-link"
                @click="openRoute"
              >
                {{ selectedVisit.routeName || `Route #${selectedVisit.routeId}` }}
              </VBtn>
              <div
                v-else
                class="text-body-1 font-weight-medium"
              >
                {{ selectedVisit.routeName || (selectedVisit.routeId ? `Route #${selectedVisit.routeId}` : '—') }}
              </div>
            </VCol>

            <VCol
              cols="12"
              sm="3"
            >
              <div class="text-caption text-disabled mb-1">
                المدة
              </div>
              <div class="text-body-1 font-weight-medium">
                {{ duration }}
              </div>
            </VCol>
          </VRow>

          <VDivider class="my-4" />

          <VRow>
            <VCol
              cols="12"
              sm="6"
            >
              <div class="text-caption text-disabled mb-1">
                تاريخ الإنشاء
              </div>
              <div class="text-body-2">
                {{ formatVisitDateTime(selectedVisit.createdAt) }}
              </div>
            </VCol>
            <VCol
              cols="12"
              sm="6"
            >
              <div class="text-caption text-disabled mb-1">
                تاريخ التحديث
              </div>
              <div class="text-body-2">
                {{ formatVisitDateTime(selectedVisit.updatedAt) }}
              </div>
            </VCol>
          </VRow>
        </VCardText>
      </VCard>

      <VRow>
        <!-- Left: Check-in / Check-out timeline -->
        <VCol
          cols="12"
          md="5"
        >
          <VCard>
            <VCardItem>
              <VCardTitle>
                <VIcon
                  icon="tabler-clock-hour-4"
                  size="20"
                  class="me-2"
                />
                المخطط الزمني للزيارة
              </VCardTitle>
            </VCardItem>

            <VDivider />

            <VCardText>
              <VTimeline
                density="compact"
                side="end"
                truncate-line="both"
              >
                <VTimelineItem
                  dot-color="success"
                  size="x-small"
                >
                  <div class="text-body-1 font-weight-medium">
                    تسجيل الوصول
                  </div>
                  <div class="text-body-2 text-medium-emphasis">
                    {{ formatVisitDateTime(selectedVisit.checkInTime) }}
                  </div>
                  <div class="text-caption text-disabled mt-1">
                    <VIcon
                      icon="tabler-map-pin"
                      size="14"
                      class="me-1"
                    />
                    {{ formatCoordinates(checkInLocation) }}
                  </div>
                </VTimelineItem>

                <VTimelineItem
                  :dot-color="selectedVisit.checkOutTime ? 'error' : 'secondary'"
                  size="x-small"
                >
                  <div class="text-body-1 font-weight-medium">
                    تسجيل المغادرة
                  </div>
                  <div class="text-body-2 text-medium-emphasis">
                    {{ formatVisitDateTime(selectedVisit.checkOutTime) }}
                  </div>
                  <div class="text-caption text-disabled mt-1">
                    <VIcon
                      icon="tabler-map-pin"
                      size="14"
                      class="me-1"
                    />
                    {{ formatCoordinates(checkOutLocation) }}
                  </div>
                </VTimelineItem>
              </VTimeline>
            </VCardText>
          </VCard>
        </VCol>

        <!-- Right: Map -->
        <VCol
          cols="12"
          md="7"
        >
          <VCard>
            <VCardItem>
              <VCardTitle>
                <VIcon
                  icon="tabler-map"
                  size="20"
                  class="me-2"
                />
                موقع الزيارة
              </VCardTitle>
            </VCardItem>

            <VDivider />

            <VCardText
              v-if="!mapPoints.length"
              class="d-flex flex-column align-center justify-center py-16 gap-2"
            >
              <VIcon
                icon="tabler-map-pin-off"
                size="40"
                color="secondary"
              />
              <span class="text-body-2 text-medium-emphasis">لم يُسجَّل موقع لهذه الزيارة.</span>
            </VCardText>

            <VCardText
              v-else
              class="pa-0"
            >
              <div style="block-size: 420px; inline-size: 100%;">
                <LMap
                  :zoom="15"
                  :center="mapCenter"
                  :use-global-leaflet="true"
                  style="block-size: 100%; inline-size: 100%; z-index: 0;"
                  @ready="onMapReady"
                >
                  <LTileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
                    layer-type="base"
                    name="OpenStreetMap"
                  />
                </LMap>
              </div>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>
    </div>
  </section>
</template>

<style scoped>
/* Ensure leaflet container renders properly */
:deep(.leaflet-container) {
  z-index: 0;
}

/* Remove default box-shadow/background on our custom DivIcon */
:deep(.visit-location-icon) {
  border: none !important;
  background: transparent !important;
}
</style>
