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
const drawerTitle   = computed(() => (isEditMode.value ? 'تعديل العميل' : 'إضافة عميل'))

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
// Default center: Damascus, Syria
const DEFAULT_CENTER = [33.5138, 36.2765]
const DEFAULT_ZOOM   = 12

const mapCenter    = ref([...DEFAULT_CENTER])
const mapZoom      = ref(DEFAULT_ZOOM)
const markerLatLng = ref(null)   // null = no pin yet

/**
 * mapKey is bumped every time the customer prop changes so that <LMap> is
 * fully destroyed and re-created with the correct center/zoom/marker.
 * Without this the map uses its initial center and ignores reactive updates.
 */
const mapKey = ref(0)

// Leaflet fix: icons break with Vite's asset pipeline — patch the default icon.
// Run immediately (not just in onMounted) so the icon is ready before any
// re-mount triggered by mapKey changes.
const _patchLeafletIcons = async () => {
  const L = (await import('leaflet')).default
  delete L.Icon.Default.prototype._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
    iconUrl:       new URL('leaflet/dist/images/marker-icon.png',    import.meta.url).href,
    shadowUrl:     new URL('leaflet/dist/images/marker-shadow.png',  import.meta.url).href,
  })
}
onMounted(_patchLeafletIcons)

// ── Map search (Nominatim geocoding) ───────────────────────────────────────────
const mapSearchQuery   = ref('')
const mapSearchResults = ref([])
const isMapSearching   = ref(false)
let   _mapSearchTimer  = null

const searchLocation = async () => {
  const q = mapSearchQuery.value.trim()
  if (!q) { mapSearchResults.value = []; return }
  isMapSearching.value = true
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`,
      { headers: { 'Accept-Language': 'ar' } },
    )
    mapSearchResults.value = await res.json()
  } catch {
    mapSearchResults.value = []
  } finally {
    isMapSearching.value = false
  }
}

const onMapSearchInput = () => {
  clearTimeout(_mapSearchTimer)
  _mapSearchTimer = setTimeout(searchLocation, 500)
}

const selectSearchResult = result => {
  const lat = parseFloat(result.lat)
  const lng = parseFloat(result.lon)
  form.value.latitude  = parseFloat(lat.toFixed(6))
  form.value.longitude = parseFloat(lng.toFixed(6))
  markerLatLng.value   = [lat, lng]
  mapCenter.value      = [lat, lng]
  mapZoom.value        = 15
  mapKey.value++
  mapSearchQuery.value   = result.display_name
  mapSearchResults.value = []
}

// ── Layer toggle ────────────────────────────────────────────────────────────
const mapLayer = ref('street')   // 'satellite' | 'street'

const tileUrl = computed(() =>
  mapLayer.value === 'satellite'
    ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
)

const toggleMapLayer = () => {
  mapLayer.value = mapLayer.value === 'satellite' ? 'street' : 'satellite'
}

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

      // Ensure the autocomplete shows the territory name instead of just the ID
      if (val.territoryId && val.territoryName) {
        const exists = territoryItems.value.some(t => t.value === val.territoryId)
        if (!exists) {
          territoryItems.value.push({
            value: val.territoryId,
            title: val.territoryName,
          })
        }
      }

      // If customer already has coordinates, show pin and center map there
      if (val.latitude && val.longitude) {
        markerLatLng.value = [val.latitude, val.longitude]
        mapCenter.value    = [val.latitude, val.longitude]
        mapZoom.value      = 14
      } else {
        markerLatLng.value = null
        mapCenter.value    = [24.7136, 46.6753]
        mapZoom.value      = 10
      }
    } else {
      form.value         = defaultForm()
      markerLatLng.value = null
      mapCenter.value    = [...DEFAULT_CENTER]
      mapZoom.value      = DEFAULT_ZOOM
    }
    // Force LMap to remount so it picks up the updated center/zoom/marker
    mapKey.value++
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
  mapCenter.value    = [...DEFAULT_CENTER]
  mapZoom.value      = DEFAULT_ZOOM
  mapSearchQuery.value   = ''
  mapSearchResults.value = []
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
                  label="اسم العميل"
                  placeholder="مثال: صيدلية الفرحان"
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
                  label="المنطقة"
                  placeholder="ابحث عن منطقة…"
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
                        تم تحميل كل المناطق
                      </span>
                    </div>
                  </template>

                  <!-- Empty state -->
                  <template #no-data>
                    <VListItem>
                      <VListItemTitle class="text-medium-emphasis">
                        {{ isTerritoryLoading ? 'Loading…' : 'لا توجد مناطق' }}
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
                  label="الفئة"
                  placeholder="اختر الفئة"
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
                  :rules="[
                    requiredValidator,
                    v => /^\+963\d{9}$/.test((v ?? '').trim()) || 'يجب أن يبدأ رقم الهاتف بـ +963 يليه 9 أرقام (مثال: +963912345678)',
                  ]"
                  label="رقم الهاتف"
                  placeholder="+963 9xx xxx xxx"
                  :disabled="props.isSubmitting"
                />
              </VCol>

              <!-- ── Address ───────────────────────────────────────────── -->
              <VCol cols="12">
                <AppTextarea
                  v-model="form.address"
                  :rules="[requiredValidator]"
                  label="العنوان"
                  placeholder="الشارع، المبنى، المدينة…"
                  rows="2"
                  :disabled="props.isSubmitting"
                />
              </VCol>

              <!-- ── Map ───────────────────────────────────────────────── -->
              <VCol cols="12">
                <div class="text-body-2 font-weight-medium mb-1">
                  الموقع
                  <span class="text-caption text-medium-emphasis ms-1">
                    (ابحث أو انقر على الخريطة لتحديد الإحداثيات)
                  </span>
                </div>

                <!-- Map search box -->
                <div class="mb-2" style="position: relative;">
                  <AppTextField
                    v-model="mapSearchQuery"
                    placeholder="ابحث عن موقع…"
                    prepend-inner-icon="tabler-search"
                    :loading="isMapSearching"
                    clearable
                    hide-details
                    @input="onMapSearchInput"
                    @click:clear="mapSearchQuery = ''; mapSearchResults = []"
                  />
                  <!-- Results dropdown -->
                  <VList
                    v-if="mapSearchResults.length"
                    elevation="4"
                    style="position: absolute; z-index: 9999; inline-size: 100%; max-block-size: 200px; overflow-y: auto;"
                  >
                    <VListItem
                      v-for="r in mapSearchResults"
                      :key="r.place_id"
                      :title="r.display_name"
                      @click="selectSearchResult(r)"
                    />
                  </VList>
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
                    مسح
                  </VBtn>
                </div>

                <!-- ESRI satellite / OSM map via vue-leaflet -->
                <div
                  style="position: relative; block-size: 260px; border-radius: 8px; overflow: hidden; border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));"
                >
                  <!-- Layer toggle button (top-right corner) -->
                  <button
                    type="button"
                    style="
                      position: absolute;
                      top: 8px;
                      right: 8px;
                      z-index: 1000;
                      display: flex;
                      align-items: center;
                      gap: 4px;
                      padding: 5px 10px;
                      border-radius: 6px;
                      border: 1px solid rgba(255,255,255,0.4);
                      background: rgba(30,30,30,0.72);
                      backdrop-filter: blur(6px);
                      color: #fff;
                      font-size: 12px;
                      font-weight: 500;
                      cursor: pointer;
                      letter-spacing: 0.3px;
                    "
                    @click.stop="toggleMapLayer"
                  >
                    <span style="font-size:14px;">{{ mapLayer === 'satellite' ? '🗺️' : '🛰️' }}</span>
                    {{ mapLayer === 'satellite' ? 'خريطة' : 'قمر صناعي' }}
                  </button>

                  <LMap
                    :key="mapKey"
                    :zoom="mapZoom"
                    :center="mapCenter"
                    :use-global-leaflet="false"
                    style="block-size: 100%; inline-size: 100%;"
                    @click="onMapClick"
                  >
                    <LTileLayer
                      :key="mapLayer"
                      :url="tileUrl"
                      attribution=""
                      :options="{ attribution: '' }"
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
                  {{ isEditMode ? 'حفظ التغييرات' : 'إنشاء العميل' }}
                </VBtn>
                <VBtn
                  type="button"
                  variant="tonal"
                  color="error"
                  :disabled="props.isSubmitting"
                  @click="closeDrawer"
                >
                  إلغاء
                </VBtn>
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
      </VCard>
    </PerfectScrollbar>
  </VNavigationDrawer>
</template>
