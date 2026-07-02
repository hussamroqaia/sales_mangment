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

import { LMap, LTileLayer, LMarker, LPopup, LPolyline } from '@vue-leaflet/vue-leaflet'
import 'leaflet/dist/leaflet.css'
import { useRoutes, resolveRouteStatusVariant, ROUTE_STATUSES } from '@/composables/useRoutes'
import { fetchCustomers } from '@/services/customer.service'
import RouteEditDrawer from '@/views/apps/logistics/routes/RouteEditDrawer.vue'

const props = defineProps({
  routeId: {
    type: [String, Number],
    required: false,
    default: 0,
  },
  isMyRoute: {
    type: Boolean,
    default: false,
  },
  routeDate: {
    type: String,
    default: '',
  },
})

const router = useRouter()

const {
  selectedRoute,
  isDetailLoading,
  detailError,
  isOptimizing,
  isSubmitting,
  snackbar,
  fetchRoute,
  loadMyRoute,
  optimizeSelectedRoute,
  updateSelectedRoute,
  updateStatus,
  assignCustomers,
} = useRoutes()

// ── Load route on mount ───────────────────────────────────────────────────────
const fetchCurrentRoute = () => {
  if (props.isMyRoute) {
    if (props.routeDate) loadMyRoute(props.routeDate)
  } else if (props.routeId) {
    fetchRoute(props.routeId)
  }
}

onMounted(() => {
  fetchCurrentRoute()
})

watch(() => props.routeId, () => {
  fetchCurrentRoute()
})

watch(() => props.routeDate, () => {
  fetchCurrentRoute()
})

// ── Computed: sorted stops ────────────────────────────────────────────────────
const sortedStops = computed(() => {
  if (!selectedRoute.value?.stops) return []

  return [...selectedRoute.value.stops].sort((a, b) => a.sequenceNumber - b.sequenceNumber)
})

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

// ── Computed: polyline coordinates ────────────────────────────────────────────
const polylineLatLngs = computed(() => {
  return sortedStops.value
    .filter(s => s.latitude && s.longitude)
    .map(s => [s.latitude, s.longitude])
})

// ── Optimize handler ──────────────────────────────────────────────────────────
const onOptimize = async () => {
  await optimizeSelectedRoute(props.routeId)
}

// ── Update Status handler ─────────────────────────────────────────────────────
const onUpdateStatus = async statusValue => {
  if (selectedRoute.value?.status === statusValue) return
  await updateStatus(props.routeId, statusValue)
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
  if (!territoryId) { customerItems.value = []; return }
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

const onCustomerScrollEnd = (isIntersecting) => {
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
        v-if="!isMyRoute"
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
              v-if="!isMyRoute"
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
              v-if="!isMyRoute"
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
            >
              <VTimeline
                density="compact"
                side="end"
                class="pa-4"
              >
                <VTimelineItem
                  v-for="stop in sortedStops"
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
                    <div class="d-flex align-center gap-2 mb-1">
                      <VChip
                        color="primary"
                        size="x-small"
                        label
                      >
                        Stop {{ stop.sequenceNumber }}
                      </VChip>
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
                  :use-global-leaflet="false"
                  style="block-size: 100%; inline-size: 100%; z-index: 0;"
                >
                  <LTileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
                    layer-type="base"
                    name="OpenStreetMap"
                  />

                  <!-- Markers for each stop -->
                  <LMarker
                    v-for="stop in sortedStops"
                    :key="`marker-${stop.assignmentId}`"
                    :lat-lng="[stop.latitude, stop.longitude]"
                  >
                    <LPopup>
                      <div>
                        <strong>Stop {{ stop.sequenceNumber }}: {{ stop.customerName }}</strong>
                        <br>
                        <span>{{ stop.customerAddress || 'No address' }}</span>
                      </div>
                    </LPopup>
                  </LMarker>

                  <!-- Polyline connecting stops in order -->
                  <LPolyline
                    v-if="polylineLatLngs.length > 1"
                    :lat-lngs="polylineLatLngs"
                    :color="'#7367F0'"
                    :weight="3"
                    :opacity="0.8"
                    dash-array="10, 6"
                  />
                </LMap>
              </div>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>

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
</style>
