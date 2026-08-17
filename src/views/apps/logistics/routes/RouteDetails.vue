<script setup>
/**
 * RouteDetails.vue
 *
 * Route detail view with split layout:
 *   - Left:  Stops timeline ordered by sequenceNumber
 *   - Right: OpenStreetMap with numbered markers via vue-leaflet
 *
 * Header shows route metadata + "Optimize Route" button.
 * When isOptimized is true, the button is disabled and shows a success badge.
 */

import { LMap, LTileLayer } from '@vue-leaflet/vue-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// `isMyRoute` / `routeDate` used to switch this view into the rep's own-route
// mode for the /my-route screen. That screen was a mobile workflow and has been
// removed, so the props went with it — this view is now purely the management
// route-detail surface reached from /routes/:id.
const props = defineProps({
  routeId: {
    type: [String, Number],
    required: false,
    default: 0,
  },
})


// Expose L globally so vue-leaflet uses the same instance (use-global-leaflet="true")
window.L = L
import { useRoutes, resolveRouteStatusVariant, ROUTE_STATUSES } from '@/composables/useRoutes'
import { fetchCustomers } from '@/services/customer.service'
import RouteEditDrawer from '@/views/apps/logistics/routes/RouteEditDrawer.vue'
import { useAuth } from '@/composables/useAuth'
import { confirmAction } from '@/utils/swal'

const { userData } = useAuth()
const ROUTE_MANAGER_ROLES = ['admin', 'sales_manager']

const canManageRoutes = computed(() =>
  ROUTE_MANAGER_ROLES.includes(userData.value?.role?.toLowerCase()))

const router = useRouter()

const {
  selectedRoute,
  isDetailLoading,
  detailError,
  isOptimizing,
  isSubmitting,
  snackbar,
  fetchRoute,
  optimizeSelectedRoute,
  updateSelectedRoute,
  updateStatus,
  assignCustomers,
  removeCustomer,
  reorderStops,
} = useRoutes()

// ── Load route on mount ───────────────────────────────────────────────────────
const fetchCurrentRoute = () => {
  if (props.routeId) fetchRoute(props.routeId)
}

onMounted(() => {
  fetchCurrentRoute()
})

watch(() => props.routeId, () => {
  fetchCurrentRoute()
})

// ── Computed: sorted stops ────────────────────────────────────────────────────
const sortedStops = computed(() => {
  if (!selectedRoute.value?.stops) return []

  return [...selectedRoute.value.stops].sort((a, b) => a.sequenceNumber - b.sequenceNumber)
})

// ── Local reorder state ───────────────────────────────────────────────────────
const localStops = ref([])
const isReordering = ref(false)

const startReorder = () => {
  localStops.value = sortedStops.value.map(s => ({ ...s }))
  isReordering.value = true
}

const cancelReorder = () => {
  isReordering.value = false
  localStops.value = []
}

const moveStop = (index, direction) => {
  const target = index + direction
  if (target < 0 || target >= localStops.value.length) return

  const arr = [...localStops.value]

  ;[arr[index], arr[target]] = [arr[target], arr[index]]

  // update sequenceNumbers to reflect new positions
  arr.forEach((s, i) => { s.sequenceNumber = i + 1 })
  localStops.value = arr
}

const saveOrder = async () => {
  const orderedCustomerIds = localStops.value.map(s => s.customerId)
  const result = await reorderStops(selectedRoute.value?.id, orderedCustomerIds)
  if (result.success) {
    isReordering.value = false
    localStops.value = []
  }
}

// The stops to render — local order when reordering, otherwise server order
const displayStops = computed(() => isReordering.value ? localStops.value : sortedStops.value)

// ── Computed: map center ──────────────────────────────────────────────────────
const defaultCenter = [33.5117, 36.3067]

const mapCenter = computed(() => {
  if (sortedStops.value.length > 0) {
    const first = sortedStops.value[0]
    if (first.latitude && first.longitude) {
      return [first.latitude, first.longitude]
    }
  }

  return defaultCenter
})

// ── Leaflet map ref + routing ─────────────────────────────────────────────────
let leafletMap = null          // raw L.Map instance
let routePolyline = null       // the drawn route polyline
let stopMarkers = []           // manually-added numbered markers

/**
 * Creates a numbered circle DivIcon for each stop marker.
 * Shows sequenceNumber inside a styled circle.
 */
const createNumberedIcon = number => {
  return L.divIcon({
    className: 'route-stop-numbered-icon',
    html: `<div style="
      background: #7367F0;
      color: #fff;
      border-radius: 50%;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 13px;
      border: 3px solid #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    ">${number}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -18],
  })
}

/**
 * Calls the OSRM demo API directly to get the real driving route geometry.
 * Returns an array of [lat, lng] pairs, or null on failure.
 */
const fetchOSRMRoute = async stops => {
  // OSRM expects coordinates as lng,lat pairs separated by semicolons
  const coords = stops.map(s => `${s.longitude},${s.latitude}`).join(';')
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`

  try {
    const response = await fetch(url)
    const data = await response.json()

    if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates?.length) {
      // GeoJSON coordinates are [lng, lat] — convert to Leaflet [lat, lng]
      return data.routes[0].geometry.coordinates.map(c => [c[1], c[0]])
    }

    console.warn('[RouteDetails] OSRM returned no usable route:', data.code)

    return null
  } catch (err) {
    console.warn('[RouteDetails] OSRM fetch failed:', err.message)

    return null
  }
}

/**
 * Builds / rebuilds the route polyline and numbered stop markers
 * on the raw Leaflet map whenever stops change.
 */
const buildRoute = async () => {
  if (!leafletMap) return

  // ── Clean up previous layers ──
  if (routePolyline) {
    leafletMap.removeLayer(routePolyline)
    routePolyline = null
  }
  stopMarkers.forEach(m => leafletMap.removeLayer(m))
  stopMarkers = []

  const stops = sortedStops.value.filter(s => s.latitude && s.longitude)
  if (stops.length === 0) return

  // ── Add numbered markers with popups ──
  stops.forEach(stop => {
    const marker = L.marker([stop.latitude, stop.longitude], {
      icon: createNumberedIcon(stop.sequenceNumber),
    })
      .addTo(leafletMap)
      .bindPopup(
        `<div>
          <strong>Stop ${stop.sequenceNumber}: ${stop.customerName}</strong><br>
          <span>${stop.customerAddress || 'No address'}</span>
        </div>`,
      )

    stopMarkers.push(marker)
  })

  // ── Draw the route (needs ≥ 2 points) ──
  if (stops.length >= 2) {
    // Try real street routing via OSRM
    const osrmLatLngs = await fetchOSRMRoute(stops)

    if (osrmLatLngs) {
      // Real street route from OSRM
      routePolyline = L.polyline(osrmLatLngs, {
        color: '#7367F0',
        weight: 5,
        opacity: 0.85,
      }).addTo(leafletMap)
    } else {
      // Fallback: straight dashed lines between stops
      const fallbackLatLngs = stops.map(s => [s.latitude, s.longitude])

      routePolyline = L.polyline(fallbackLatLngs, {
        color: '#7367F0',
        weight: 4,
        opacity: 0.8,
        dashArray: '10, 6',
      }).addTo(leafletMap)
    }

    // Fit the map to show the entire route
    leafletMap.fitBounds(routePolyline.getBounds(), { padding: [40, 40] })
  } else {
    // Single stop — just center on it
    leafletMap.setView([stops[0].latitude, stops[0].longitude], 15)
  }
}

/**
 * Called by LMap's @ready event. Receives the raw Leaflet map object.
 */
const onMapReady = map => {
  leafletMap = map
  buildRoute()
}

// Re-draw routing whenever sortedStops change (optimize, reorder, add/remove)
watch(sortedStops, () => {
  buildRoute()
}, { deep: true })

// ── Optimize handler ──────────────────────────────────────────────────────────
const onOptimize = async () => {
  await optimizeSelectedRoute(selectedRoute.value?.id)
}

// ── Update Status handler ─────────────────────────────────────────────────────
const onUpdateStatus = async statusValue => {
  if (selectedRoute.value?.status === statusValue) return
  await updateStatus(selectedRoute.value?.id, statusValue)
}

// ── Status helper ─────────────────────────────────────────────────────────────
const statusTitle = status =>
  ROUTE_STATUSES.find(s => s.value === status)?.title ?? status ?? '—'

// ── Back navigation ──────────────────────────────────────────────────────────
const goBack = () => {
  router.push({ path: '/routes' })
}

// ── Date formatter ──────────────────────────────────────────────────────────
const formatDate = value => {
  if (!value) return '—'
  const d = new Date(value)

  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: '2-digit',
  }).format(d)
}

// ── Add Customers — server-side search + scroll pagination ───────────────────
const selectedCustomerIds = ref([])
const customerSearch      = ref('')
const customerItems       = ref([])
const customerPage        = ref(0)
const customerTotalPages  = ref(1)
const isCustomerLoading   = ref(false)
const isAssigning         = ref(false)
let   _cSearchTimer       = null
let   _cBlockScroll       = false

/** IDs of customers already on the route — excludes them from the dropdown */
const existingCustomerIds = computed(() => {
  if (!selectedRoute.value?.stops) return new Set()
  
  return new Set(selectedRoute.value.stops.map(s => s.customerId))
})

const loadCustomerPage = async (reset = false) => {
  const territoryId = selectedRoute.value?.territoryId
  if (!territoryId) { customerItems.value = [] 

    return }
  if (isCustomerLoading.value) return
  if (!reset && customerPage.value >= customerTotalPages.value) return

  if (reset) {
    _cBlockScroll = true
    setTimeout(() => { _cBlockScroll = false }, 200)
  }

  isCustomerLoading.value = true
  try {
    const pageIndex = reset ? 0 : customerPage.value

    const data = await fetchCustomers({
      territoryId,
      status: 'ACTIVE',
      page: pageIndex,
      size: 20,
      search: customerSearch.value || undefined,
    })

    const content = data?.content ?? []

    const incoming = content
      .filter(c => !existingCustomerIds.value.has(c.id))
      .map(c => ({
        title: c.name || `Customer #${c.id}`,
        value: c.id,
        subtitle: c.address || '',
      }))

    if (reset) {
      customerItems.value = incoming
      customerPage.value  = 1
    } else {
      customerItems.value = [...customerItems.value, ...incoming]
      customerPage.value  = pageIndex + 1
    }
    customerTotalPages.value = data?.totalPages ?? 1
  } catch (e) {
    console.warn('[RouteDetails] Failed to load customers:', e)
  } finally {
    isCustomerLoading.value = false
  }
}

const onCustomerSearch = val => {
  customerSearch.value = val ?? ''
  clearTimeout(_cSearchTimer)
  _cSearchTimer = setTimeout(() => loadCustomerPage(true), 350)
}

const onCustomerScrollEnd = isIntersecting => {
  if (!isIntersecting || _cBlockScroll) return
  if (customerPage.value < customerTotalPages.value) {
    loadCustomerPage(false)
  }
}

const onCustomerMenuUpdate = isOpen => {
  if (isOpen && customerItems.value.length === 0) loadCustomerPage(true)
}

const onAssignCustomers = async () => {
  if (!selectedCustomerIds.value.length) return
  isAssigning.value = true

  const result = await assignCustomers(props.routeId, selectedCustomerIds.value)

  isAssigning.value = false
  if (result.success) {
    selectedCustomerIds.value = []
    customerItems.value = []
    customerPage.value = 0
    customerTotalPages.value = 1
    customerSearch.value = ''
  }
}

// ── Edit Drawer ───────────────────────────────────────────────────────────────
const isEditDrawerOpen = ref(false)

const openEdit = () => {
  isEditDrawerOpen.value = true
}

const onEditSubmit = async ({ id, payload }) => {
  const result = await updateSelectedRoute(id, payload)
  if (result.success) isEditDrawerOpen.value = false
}

// ── Remove Customer ───────────────────────────────────────────────────────────
const onRemoveCustomer = async customerId => {
  const confirmed = await confirmAction({
    title: 'Remove customer?',
    text: 'Are you sure you want to remove this stop from the route?',
    confirmText: 'Remove',
    icon: 'warning',
  })

  if (!confirmed) return

  await removeCustomer(selectedRoute.value?.id, customerId)
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
        <span class="ms-4 text-body-1 text-medium-emphasis">Loading route details…</span>
      </div>
    </VCard>

    <!-- Error State -->
    <VCard
      v-else-if="detailError"
      class="pa-6"
    >
      <VAlert
        type="error"
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
        Back to Routes
      </VBtn>
    </VCard>

    <!-- Route Detail -->
    <div v-else-if="selectedRoute">
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
            Route: {{ selectedRoute.name }}
          </VCardTitle>
          <template #append>
            <!-- Edit Button -->
            <VBtn
              variant="tonal"
              color="primary"
              class="me-3"
              prepend-icon="tabler-edit"
              :disabled="isSubmitting"
              @click="openEdit"
            >
              Edit Route
            </VBtn>

            <!-- Update Status Menu -->
            <VBtn
              variant="tonal"
              color="secondary"
              class="me-3"
              prepend-icon="tabler-refresh"
              :loading="isSubmitting"
              :disabled="isSubmitting"
            >
              Update Status
              <VMenu activator="parent">
                <VList>
                  <VListItem
                    v-for="status in ROUTE_STATUSES"
                    :key="status.value"
                    :value="status.value"
                    @click="onUpdateStatus(status.value)"
                  >
                    <VListItemTitle>{{ status.title }}</VListItemTitle>
                  </VListItem>
                </VList>
              </VMenu>
            </VBtn>

            <!-- Optimize Button -->
            <VChip
              v-if="selectedRoute.isOptimized"
              color="success"
              size="large"
              label
              class="me-3"
            >
              <VIcon
                icon="tabler-check"
                size="18"
                class="me-1"
              />
              Successfully Optimized
            </VChip>
            <VBtn
              v-if="!selectedRoute.isOptimized"
              color="primary"
              prepend-icon="tabler-route"
              :loading="isOptimizing"
              :disabled="isOptimizing"
              @click="onOptimize"
            >
              Optimize Route
            </VBtn>
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
                Representative
              </div>
              <div class="text-body-1 font-weight-medium">
                {{ selectedRoute.representativeName || `Rep #${selectedRoute.representativeId}` }}
              </div>
            </VCol>
            <VCol
              cols="12"
              sm="3"
            >
              <div class="text-caption text-disabled mb-1">
                Territory
              </div>
              <div class="text-body-1 font-weight-medium">
                {{ selectedRoute.territoryName || `Territory #${selectedRoute.territoryId}` }}
              </div>
            </VCol>
            <VCol
              cols="12"
              sm="3"
            >
              <div class="text-caption text-disabled mb-1">
                Date
              </div>
              <div class="text-body-1 font-weight-medium">
                {{ formatDate(selectedRoute.routeDate) }}
              </div>
            </VCol>
            <VCol
              cols="12"
              sm="3"
            >
              <div class="text-caption text-disabled mb-1">
                Status
              </div>
              <VChip
                :color="resolveRouteStatusVariant(selectedRoute.status)"
                size="small"
                label
              >
                {{ statusTitle(selectedRoute.status) }}
              </VChip>
            </VCol>
          </VRow>
        </VCardText>
      </VCard>

      <!-- Add Customers Card -->
      <VCard class="mb-6">
        <VCardItem>
          <VCardTitle>
            <VIcon
              icon="tabler-user-plus"
              size="20"
              class="me-2"
            />
            Add Customers
          </VCardTitle>
        </VCardItem>

        <VDivider />

        <VCardText>
          <VRow align="end">
            <VCol
              cols="12"
              md="8"
            >
              <VAutocomplete
                v-model="selectedCustomerIds"
                label="Customers"
                placeholder="Search customers in this territory…"
                :items="customerItems"
                item-title="title"
                item-value="value"
                :loading="isCustomerLoading"
                :disabled="isAssigning"
                multiple
                chips
                closable-chips
                clearable
                no-filter
                @update:search="onCustomerSearch"
                @update:menu="onCustomerMenuUpdate"
              >
                <!-- Append sentinel for infinite scroll -->
                <template #append-item>
                  <div
                    v-intersect="{
                      handler: onCustomerScrollEnd,
                      options: { threshold: 0.5 },
                    }"
                    class="pa-2 text-center"
                  >
                    <VProgressCircular
                      v-if="isCustomerLoading"
                      indeterminate
                      size="20"
                      width="2"
                      color="primary"
                    />
                    <span
                      v-else-if="customerPage >= customerTotalPages"
                      class="text-caption text-disabled"
                    >
                      All customers loaded
                    </span>
                  </div>
                </template>

                <template #no-data>
                  <VListItem>
                    <VListItemTitle class="text-medium-emphasis">
                      {{ isCustomerLoading ? 'Loading…' : 'No customers found in this territory' }}
                    </VListItemTitle>
                  </VListItem>
                </template>
              </VAutocomplete>
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <VBtn
                color="primary"
                prepend-icon="tabler-plus"
                :loading="isAssigning"
                :disabled="isAssigning || !selectedCustomerIds.length"
                block
                @click="onAssignCustomers"
              >
                Assign {{ selectedCustomerIds.length ? `(${selectedCustomerIds.length})` : '' }}
              </VBtn>
            </VCol>
          </VRow>
        </VCardText>
      </VCard>

      <!-- Split Layout: Stops Timeline + Map -->
      <VRow>
        <!-- Left: Stops List / Timeline -->
        <VCol
          cols="12"
          md="5"
        >
          <VCard>
            <VCardItem>
              <VCardTitle>
                <VIcon
                  icon="tabler-list-numbers"
                  size="20"
                  class="me-2"
                />
                Route Stops ({{ sortedStops.length }})
              </VCardTitle>
              <template #append>
                <template v-if="canManageRoutes && sortedStops.length > 1">
                  <VBtn
                    v-if="!isReordering"
                    variant="text"
                    color="primary"
                    size="small"
                    prepend-icon="tabler-arrows-sort"
                    @click="startReorder"
                  >
                    Reorder
                  </VBtn>
                  <template v-else>
                    <VBtn
                      variant="tonal"
                      color="success"
                      size="small"
                      prepend-icon="tabler-check"
                      :loading="isSubmitting"
                      class="me-2"
                      @click="saveOrder"
                    >
                      Save Order
                    </VBtn>
                    <VBtn
                      variant="text"
                      color="secondary"
                      size="small"
                      prepend-icon="tabler-x"
                      :disabled="isSubmitting"
                      @click="cancelReorder"
                    >
                      Cancel
                    </VBtn>
                  </template>
                </template>
              </template>
            </VCardItem>

            <VDivider />

            <VCardText v-if="sortedStops.length === 0">
              <div class="d-flex flex-column align-center justify-center py-8 gap-2">
                <VIcon
                  icon="tabler-map-pin-off"
                  size="40"
                  color="secondary"
                />
                <span class="text-body-2 text-medium-emphasis">No stops assigned to this route.</span>
              </div>
            </VCardText>

            <VCardText
              v-else
              class="pa-0"
              style="max-block-size: 600px; overflow-y: auto;"
            >
              <VTimeline
                density="compact"
                side="end"
                class="pa-4"
              >
                <VTimelineItem
                  v-for="(stop, idx) in displayStops"
                  :key="stop.assignmentId"
                  dot-color="primary"
                  size="small"
                >
                  <template #icon>
                    <span class="text-caption font-weight-bold text-white">
                      {{ stop.sequenceNumber }}
                    </span>
                  </template>

                  <VCard
                    variant="tonal"
                    class="pa-3"
                  >
                    <div class="d-flex align-center justify-space-between mb-1">
                      <div class="d-flex align-center gap-2">
                        <VChip
                          color="primary"
                          size="x-small"
                          label
                        >
                          Stop {{ stop.sequenceNumber }}
                        </VChip>
                      </div>
                      <div class="d-flex align-center gap-1">
                        <!-- Reorder arrows (only in reorder mode) -->
                        <template v-if="isReordering">
                          <IconBtn
                            size="small"
                            :disabled="idx === 0"
                            @click="moveStop(idx, -1)"
                          >
                            <VIcon
                              icon="tabler-arrow-up"
                              size="18"
                            />
                          </IconBtn>
                          <IconBtn
                            size="small"
                            :disabled="idx === displayStops.length - 1"
                            @click="moveStop(idx, 1)"
                          >
                            <VIcon
                              icon="tabler-arrow-down"
                              size="18"
                            />
                          </IconBtn>
                        </template>
                        <!-- Delete (only when NOT reordering) -->
                        <IconBtn
                          v-if="canManageRoutes && !isReordering"
                          color="error"
                          size="small"
                          :disabled="isSubmitting"
                          @click="onRemoveCustomer(stop.customerId)"
                        >
                          <VIcon
                            icon="tabler-trash"
                            size="18"
                          />
                        </IconBtn>
                      </div>
                    </div>
                    <div class="text-body-1 font-weight-medium">
                      {{ stop.customerName }}
                    </div>
                    <div class="text-body-2 text-medium-emphasis mt-1">
                      <VIcon
                        icon="tabler-map-pin"
                        size="14"
                        class="me-1"
                      />
                      {{ stop.customerAddress || 'No address' }}
                    </div>
                    <div
                      v-if="stop.latitude && stop.longitude"
                      class="text-caption text-disabled mt-1"
                    >
                      {{ stop.latitude.toFixed(4) }}, {{ stop.longitude.toFixed(4) }}
                    </div>
                  </VCard>
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
                Route Map
              </VCardTitle>
            </VCardItem>

            <VDivider />

            <VCardText class="pa-0">
              <div style="block-size: 600px; inline-size: 100%;">
                <LMap
                  :zoom="13"
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

    <!-- Edit Drawer -->
    <RouteEditDrawer
      v-model:is-drawer-open="isEditDrawerOpen"
      :route="selectedRoute"
      :is-submitting="isSubmitting"
      @submit="onEditSubmit"
    />

    <!-- Snackbar -->
    <VSnackbar
      v-model="snackbar.show"
      :color="snackbar.color"
      :timeout="3500"
      location="bottom end"
    >
      <VIcon
        :icon="snackbar.color === 'success' ? 'tabler-circle-check' : 'tabler-alert-circle'"
        class="me-2"
      />
      {{ snackbar.message }}
    </VSnackbar>
  </section>
</template>

<style scoped>
/* Ensure leaflet container renders properly */
:deep(.leaflet-container) {
  z-index: 0;
}

/* Hide the routing-machine itinerary / instructions panel */
:deep(.leaflet-routing-container) {
  display: none !important;
}

/* Remove default box-shadow/background on our custom DivIcon */
:deep(.route-stop-numbered-icon) {
  background: transparent !important;
  border: none !important;
}
</style>
