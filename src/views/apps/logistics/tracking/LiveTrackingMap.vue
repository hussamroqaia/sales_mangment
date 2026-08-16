<script setup>
/**
 * LiveTrackingMap.vue
 *
 * OpenStreetMap panel showing the current position of every representative,
 * rendered with the vue-leaflet setup that already ships with this app
 * (same pattern as RouteDetails.vue / VisitDetails.vue) — no new mapping
 * dependency, no API key.
 *
 * Presentation only: it receives ready-made marker data and owns nothing but
 * Leaflet layers. All fetching/streaming lives in useTracking.
 *
 * Markers are keyed by `representativeId` and updated IN PLACE (setLatLng), so
 * a live update moves the existing pin instead of adding a second one, and an
 * open popup survives the update.
 */

import { LMap, LTileLayer } from '@vue-leaflet/vue-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const props = defineProps({
  /** [{ representativeId, representativeName, latitude, longitude, recordedAt, active, isLive }] */
  representatives: {
    type: Array,
    default: () => [],
  },
  height: {
    type: String,
    default: '520px',
  },
})

// Expose L globally so vue-leaflet uses the same instance (use-global-leaflet="true")
window.L = L

import { formatTrackingDateTime } from '@/composables/useTracking'

// Damascus — the same fallback centre RouteDetails/VisitDetails use.
const DEFAULT_CENTER = [33.5117, 36.3067]
const DEFAULT_ZOOM = 6

let leafletMap = null

const markersById = new Map()

// The map must not yank itself back to the markers while the user is panning
// around, so it auto-fits ONCE on the first snapshot and never again — live
// updates only move pins. Re-centring afterwards is an explicit user action.
let hasAutoFitted = false

const createPinIcon = (isLive, initial) => L.divIcon({
  className: 'tracking-rep-icon',
  html: `<div style="
    display: flex;
    align-items: center;
    justify-content: center;
    inline-size: 30px;
    block-size: 30px;
    border-radius: 50%;
    border: 3px solid #fff;
    background: ${isLive ? '#28C76F' : '#A8AAAE'};
    box-shadow: 0 2px 8px rgba(0, 0, 0, 30%);
    color: #fff;
    font: 600 12px/1 sans-serif;
  ">${initial}</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -16],
})

// Escapes user-supplied names before they reach Leaflet's HTML popup.
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;',
}[ch]))

const popupHtml = rep => {
  const name = escapeHtml(rep.representativeName || `Rep #${rep.representativeId}`)
  const status = rep.isLive ? 'Active' : 'Inactive'
  const statusColor = rep.isLive ? '#28C76F' : '#A8AAAE'

  return `
    <div style="min-inline-size: 190px;">
      <div style="font-weight: 600; margin-block-end: 4px;">${name}</div>
      <div style="margin-block-end: 4px;">
        <span style="
          display: inline-block;
          inline-size: 8px;
          block-size: 8px;
          border-radius: 50%;
          background: ${statusColor};
          margin-inline-end: 6px;
        "></span>${status}
      </div>
      <div style="color: #6c6f75;">Last update: ${escapeHtml(formatTrackingDateTime(rep.recordedAt))}</div>
      <div style="color: #6c6f75;">${rep.latitude.toFixed(5)}, ${rep.longitude.toFixed(5)}</div>
    </div>`
}

const initialOf = rep =>
  escapeHtml((rep.representativeName?.trim()?.[0] ?? '#').toUpperCase())

/** Reconcile Leaflet layers with the incoming list — no full teardown. */
const syncMarkers = () => {
  if (!leafletMap) return

  const seen = new Set()

  props.representatives.forEach(rep => {
    const id = rep.representativeId

    seen.add(id)

    const latLng = [rep.latitude, rep.longitude]
    const existing = markersById.get(id)

    if (existing) {
      existing.marker.setLatLng(latLng)

      // Only touch the icon when the status actually flipped — replacing it on
      // every tick would make the pin visibly blink.
      if (existing.isLive !== rep.isLive) {
        existing.marker.setIcon(createPinIcon(rep.isLive, initialOf(rep)))
        existing.isLive = rep.isLive
      }
      existing.marker.setPopupContent(popupHtml(rep))
    } else {
      const marker = L.marker(latLng, { icon: createPinIcon(rep.isLive, initialOf(rep)) })
        .addTo(leafletMap)
        .bindPopup(popupHtml(rep))

      markersById.set(id, { marker, isLive: rep.isLive })
    }
  })

  // Drop representatives that disappeared from the snapshot.
  markersById.forEach((entry, id) => {
    if (!seen.has(id)) {
      leafletMap.removeLayer(entry.marker)
      markersById.delete(id)
    }
  })

  if (!hasAutoFitted && props.representatives.length) {
    fitToMarkers()
    hasAutoFitted = true
  }
}

/**
 * Fit the viewport to the markers.
 *  - 0 markers → left at the default view (never zoom into nothing)
 *  - 1 marker  → a sane street-level zoom instead of maximum zoom
 */
function fitToMarkers() {
  if (!leafletMap || !props.representatives.length) return

  if (props.representatives.length === 1) {
    const only = props.representatives[0]

    leafletMap.setView([only.latitude, only.longitude], 14)
  } else {
    const bounds = L.latLngBounds(props.representatives.map(r => [r.latitude, r.longitude]))

    leafletMap.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 })
  }
}

const onMapReady = map => {
  leafletMap = map
  syncMarkers()
}

watch(() => props.representatives, syncMarkers, { deep: true })

onBeforeUnmount(() => {
  markersById.clear()
  leafletMap = null
})

defineExpose({ fitToMarkers })
</script>

<template>
  <div class="position-relative">
    <div :style="{ blockSize: props.height, inlineSize: '100%' }">
      <LMap
        :zoom="DEFAULT_ZOOM"
        :center="DEFAULT_CENTER"
        use-global-leaflet
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

    <!-- Re-centre control: the map never re-fits itself on live updates -->
    <VBtn
      v-if="props.representatives.length"
      size="small"
      variant="elevated"
      color="surface"
      class="tracking-fit-btn"
      prepend-icon="tabler-focus-centered"
      @click="fitToMarkers"
    >
      Fit to representatives
    </VBtn>
  </div>
</template>

<style scoped>
.tracking-fit-btn {
  position: absolute;
  z-index: 1;
  inset-block-start: 12px;
  inset-inline-end: 12px;
}

:deep(.leaflet-container) {
  z-index: 0;
}

/* Remove the default box-shadow/background on our custom DivIcon */
:deep(.tracking-rep-icon) {
  border: none !important;
  background: transparent !important;
}
</style>
