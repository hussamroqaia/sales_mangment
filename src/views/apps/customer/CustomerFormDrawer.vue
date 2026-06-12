<script setup>
import { PerfectScrollbar } from 'vue3-perfect-scrollbar'
import { LMap, LTileLayer, LMarker } from '@vue-leaflet/vue-leaflet'
import 'leaflet/dist/leaflet.css'
import { CUSTOMER_CATEGORIES } from '@/composables/useCustomers'
import { fetchTerritories } from '@/services/territory.service'

const props = defineProps({
  isDrawerOpen: {
    type: Boolean,
    required: true,
  },
  isSubmitting: {
    type: Boolean,
    default: false,
  },
  /**
   * Pass a customer object for edit mode, null/undefined for create mode.
   */
  customer: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['update:isDrawerOpen', 'submit'])

const refForm      = ref()
const refScrollbar = ref()   // PerfectScrollbar container — used to reset scroll position

// ── Mode detection ─────────────────────────────────────────────────────────────
const isEditMode    = computed(() => !!props.customer?.id)
const drawerTitle   = computed(() => (isEditMode.value ? 'Edit Customer' : 'Add Customer'))

// ── Form state ─────────────────────────────────────────────────────────────────
const defaultForm = () => ({
  territoryId:  null,
  name:         '',
  address:      '',
  phone:        '',
  latitude:     null,
  longitude:    null,
  category:     null,
})

const form = ref(defaultForm())

// ── Map state ──────────────────────────────────────────────────────────────────
// Default center: somewhere central (Riyadh, SA) — adjust if needed
const mapCenter   = ref([24.7136, 46.6753])
const mapZoom     = ref(10)
const markerLatLng = ref(null)   // null = no pin yet

// Leaflet fix: icons break with Vite's asset pipeline — patch the default icon
onMounted(async () => {
  // Dynamically import L to avoid SSR issues and fix the missing-icon problem
  const L = (await import('leaflet')).default

  delete L.Icon.Default.prototype._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
    iconUrl:       new URL('leaflet/dist/images/marker-icon.png',    import.meta.url).href,
    shadowUrl:     new URL('leaflet/dist/images/marker-shadow.png',  import.meta.url).href,
  })
})

// ── Populate form when prop changes (edit mode) ────────────────────────────────
watch(
  () => props.customer,
  val => {
    if (val) {
      form.value = {
        territoryId: val.territoryId ?? null,
        name:        val.name        ?? '',
        address:     val.address     ?? '',
        phone:       val.phone       ?? '',
        latitude:    val.latitude    ?? null,
        longitude:   val.longitude   ?? null,
        category:    val.category    ?? null,
      }
      // If customer already has coordinates, show pin and center map there
      if (val.latitude && val.longitude) {
        markerLatLng.value = [val.latitude, val.longitude]
        mapCenter.value    = [val.latitude, val.longitude]
        mapZoom.value      = 14
      } else {
        markerLatLng.value = null
      }
    } else {
      form.value         = defaultForm()
      markerLatLng.value = null
      mapCenter.value    = [24.7136, 46.6753]
      mapZoom.value      = 10
    }
  },
  { immediate: true },
)

// ── Map click → capture lat/lng ────────────────────────────────────────────────
const onMapClick = event => {
  const { lat, lng } = event.latlng
  form.value.latitude  = parseFloat(lat.toFixed(6))
  form.value.longitude = parseFloat(lng.toFixed(6))
  markerLatLng.value   = [lat, lng]
}

// ── Reset & close ──────────────────────────────────────────────────────────────

/** Shared form-reset logic used by closeDrawer() and the isDrawerOpen watcher */
const resetForm = () => {
  form.value         = defaultForm()
  markerLatLng.value = null
  mapCenter.value    = [24.7136, 46.6753]
  mapZoom.value      = 10
  nextTick(() => {
    refForm.value?.resetValidation()
  })
}

const closeDrawer = () => {
  emit('update:isDrawerOpen', false)
  nextTick(() => {
    refForm.value?.reset()
    resetForm()
  })
}

/**
 * When the drawer opens in CREATE mode (no customer prop), always reset the
 * form — even if editingCustomer was already null so the customer-prop watcher
 * didn't fire (e.g. right after a successful create).
 */
watch(
  () => props.isDrawerOpen,
  isOpen => {
    if (isOpen && !props.customer) {
      resetForm()
      // Also clear the territory search so the dropdown shows all territories
      territorySearch.value = ''
    }
    // Always scroll back to top when the drawer opens (create or edit)
    if (isOpen) {
      nextTick(() => {
        if (refScrollbar.value?.$el) {
          refScrollbar.value.$el.scrollTop = 0
        }
      })
    }
  },
)

// ── Submit ─────────────────────────────────────────────────────────────────────
const onSubmit = () => {
  refForm.value?.validate().then(({ valid }) => {
    if (!valid) return

    emit('submit', {
      id:          props.customer?.id ?? null,
      territoryId: form.value.territoryId,
      name:        form.value.name.trim(),
      address:     form.value.address.trim(),
      phone:       form.value.phone.trim(),
      latitude:    form.value.latitude,
      longitude:   form.value.longitude,
      category:    form.value.category,
    })
  })
}

// ── Territory autocomplete — server-side search + scroll pagination ───────────
const territorySearch     = ref('')          // bound to the autocomplete search box
const territoryItems      = ref([])          // currently loaded options
const territoryPage       = ref(0)           // 0-based API page
const territoryTotalPages = ref(1)           // from API response
const isTerritoryLoading  = ref(false)
let   _tSearchTimer       = null
let   _tBlockScroll       = false   // blocks the sentinel after a reset so page 2 isn't auto-loaded

/** Load one page of territories (appends to territoryItems) */
const loadTerritoryPage = async (reset = false) => {
  if (isTerritoryLoading.value) return
  if (!reset && territoryPage.value >= territoryTotalPages.value) return

  // On every reset, suppress the sentinel's automatic first fire (it becomes
  // visible immediately when items render, but the user hasn't scrolled yet)
  if (reset) {
    _tBlockScroll = true
    setTimeout(() => { _tBlockScroll = false }, 200)
  }

  isTerritoryLoading.value = true
  try {
    const pageIndex = reset ? 0 : territoryPage.value
    const data = await fetchTerritories({
      page:   pageIndex,
      size:   20,
      search: territorySearch.value || undefined,
    })

    const incoming = (data?.content ?? []).map(t => ({ title: t.name, value: t.id }))

    if (reset) {
      territoryItems.value = incoming
      territoryPage.value  = 1
    } else {
      territoryItems.value = [...territoryItems.value, ...incoming]
      territoryPage.value  = pageIndex + 1
    }
    territoryTotalPages.value = data?.totalPages ?? 1
  } catch (e) {
    console.warn('[CustomerFormDrawer] Territory load failed:', e)
  } finally {
    isTerritoryLoading.value = false
  }
}

/** Debounced search — resets list and fetches from page 0 */
const onTerritorySearch = val => {
  territorySearch.value = val ?? ''
  clearTimeout(_tSearchTimer)
  _tSearchTimer = setTimeout(() => loadTerritoryPage(true), 350)
}

/**
 * Load next page when sentinel scrolls into view.
 * `isIntersecting` is the first arg Vuetify passes to v-intersect handlers.
 * We also skip while _tBlockScroll is active to avoid an immediate page-2 load
 * right after page-1 items render.
 */
const onTerritoryScrollEnd = (isIntersecting) => {
  if (!isIntersecting || _tBlockScroll) return
  if (territoryPage.value < territoryTotalPages.value) {
    loadTerritoryPage(false)
  }
}

/** Fetch first page the first time the dropdown is opened by the user */
const onTerritoryMenuUpdate = isOpen => {
  if (isOpen && territoryItems.value.length === 0) loadTerritoryPage(true)
}
</script>

<template>
  <VNavigationDrawer
    data-allow-mismatch
    temporary
    :width="480"
    location="end"
    class="scrollable-content"
    :model-value="props.isDrawerOpen"
    @update:model-value="emit('update:isDrawerOpen', $event)"
  >
    <!-- Header -->
    <AppDrawerHeaderSection
      :title="drawerTitle"
      @cancel="closeDrawer"
    />

    <VDivider />

    <PerfectScrollbar
      ref="refScrollbar"
      :options="{ wheelPropagation: false }"
    >
      <VCard flat>
        <VCardText>
          <VForm
            ref="refForm"
            @submit.prevent="onSubmit"
          >
            <VRow>
              <!-- ── Name ──────────────────────────────────────────────── -->
              <VCol cols="12">
                <AppTextField
                  v-model="form.name"
                  :rules="[requiredValidator]"
                  label="Customer Name"
                  placeholder="e.g. Al Farhan Pharmacy"
                  :disabled="props.isSubmitting"
                />
              </VCol>

              <!-- ── Territory ──────────────────────────────────────────── -->
              <VCol cols="12">
                <!--
                  VAutocomplete with server-side search + scroll-to-load-more.
                  - :items is the incrementally loaded page list
                  - @update:search fires on every keystroke (debounced internally)
                  - The invisible sentinel div at the bottom of the dropdown list
                    triggers loading the next page via IntersectionObserver.
                -->
                <VAutocomplete
                  v-model="form.territoryId"
                  :rules="[requiredValidator]"
                  label="Territory"
                  placeholder="Search territories…"
                  :items="territoryItems"
                  item-title="title"
                  item-value="value"
                  :loading="isTerritoryLoading"
                  :disabled="props.isSubmitting"
                  no-filter
                  clearable
                  @update:search="onTerritorySearch"
                  @update:menu="onTerritoryMenuUpdate"
                >
                  <!-- Append sentinel for infinite scroll -->
                  <template #append-item>
                    <div
                      v-intersect="{
                        handler: onTerritoryScrollEnd,
                        options: { threshold: 0.5 },
                      }"
                      class="pa-2 text-center"
                    >
                      <VProgressCircular
                        v-if="isTerritoryLoading"
                        indeterminate
                        size="20"
                        width="2"
                        color="primary"
                      />
                      <span
                        v-else-if="territoryPage >= territoryTotalPages"
                        class="text-caption text-disabled"
                      >
                        All territories loaded
                      </span>
                    </div>
                  </template>

                  <!-- Empty state -->
                  <template #no-data>
                    <VListItem>
                      <VListItemTitle class="text-medium-emphasis">
                        {{ isTerritoryLoading ? 'Loading…' : 'No territories found' }}
                      </VListItemTitle>
                    </VListItem>
                  </template>
                </VAutocomplete>
              </VCol>

              <!-- ── Category ──────────────────────────────────────────── -->
              <VCol cols="12">
                <AppSelect
                  v-model="form.category"
                  :rules="[requiredValidator]"
                  label="Category"
                  placeholder="Select Category"
                  :items="CUSTOMER_CATEGORIES"
                  item-title="title"
                  item-value="value"
                  :disabled="props.isSubmitting"
                />
              </VCol>

              <!-- ── Phone ─────────────────────────────────────────────── -->
              <VCol cols="12">
                <AppTextField
                  v-model="form.phone"
                  :rules="[requiredValidator]"
                  label="Phone"
                  placeholder="+966 5x xxx xxxx"
                  :disabled="props.isSubmitting"
                />
              </VCol>

              <!-- ── Address ───────────────────────────────────────────── -->
              <VCol cols="12">
                <AppTextarea
                  v-model="form.address"
                  :rules="[requiredValidator]"
                  label="Address"
                  placeholder="Street, Building, City…"
                  rows="2"
                  :disabled="props.isSubmitting"
                />
              </VCol>

              <!-- ── Map ───────────────────────────────────────────────── -->
              <VCol cols="12">
                <div class="text-body-2 font-weight-medium mb-1">
                  Location
                  <span class="text-caption text-medium-emphasis ms-1">
                    (Click the map to pin coordinates)
                  </span>
                </div>

                <!-- Lat / Lng display -->
                <div
                  v-if="form.latitude && form.longitude"
                  class="d-flex gap-2 mb-2"
                >
                  <VChip
                    size="small"
                    color="primary"
                    variant="tonal"
                  >
                    <VIcon
                      start
                      icon="tabler-location"
                      size="14"
                    />
                    {{ form.latitude }}, {{ form.longitude }}
                  </VChip>
                  <VBtn
                    size="x-small"
                    variant="text"
                    color="error"
                    @click="markerLatLng = null; form.latitude = null; form.longitude = null"
                  >
                    Clear
                  </VBtn>
                </div>

                <!-- OpenStreetMap via vue-leaflet -->
                <div
                  style="block-size: 260px; border-radius: 8px; overflow: hidden; border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));"
                >
                  <LMap
                    :zoom="mapZoom"
                    :center="mapCenter"
                    :use-global-leaflet="false"
                    style="block-size: 100%; inline-size: 100%;"
                    @click="onMapClick"
                  >
                    <LTileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
                    />
                    <LMarker
                      v-if="markerLatLng"
                      :lat-lng="markerLatLng"
                    />
                  </LMap>
                </div>
              </VCol>

              <!-- ── Actions ───────────────────────────────────────────── -->
              <VCol cols="12">
                <VBtn
                  type="submit"
                  class="me-3"
                  :loading="props.isSubmitting"
                  :disabled="props.isSubmitting"
                >
                  {{ isEditMode ? 'Save Changes' : 'Create Customer' }}
                </VBtn>
                <VBtn
                  type="button"
                  variant="tonal"
                  color="error"
                  :disabled="props.isSubmitting"
                  @click="closeDrawer"
                >
                  Cancel
                </VBtn>
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
      </VCard>
    </PerfectScrollbar>
  </VNavigationDrawer>
</template>
