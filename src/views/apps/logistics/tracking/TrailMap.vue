<script setup>
/**
 * TrailMap.vue
 *
 * Historical movement of one representative for one calendar day: the recorded
 * GPS points in chronological order, joined by a polyline, with a distinct
 * start and end marker.
 *
 * Same vue-leaflet / OpenStreetMap setup as LiveTrackingMap and RouteDetails.
 * Presentation only — the points arrive already validated and sorted from
 * useTracking. Trail layers are kept entirely separate from live marker state.
 *
 * No distance/analytics is computed: GPS trails contain noise and that would be
 * a product decision, not a rendering one.
 */

import { LMap, LTileLayer } from '@vue-leaflet/vue-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const props = defineProps({
  /** [{ latitude, longitude, recordedAt }] — chronological, already validated */
  points: {
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

import { formatTrackingTime } from '@/composables/useTracking'
import { constrainMapToSingleWorld } from '@/utils/leafletWorldView'

const DEFAULT_CENTER = [33.5117, 36.3067]
const DEFAULT_ZOOM = 6

let leafletMap = null
let layerGroup = null

// Detaches the world-constraint resize listener (see onBeforeUnmount).
let releaseWorldView = null

const createDot = () => L.divIcon({
  className: 'tracking-trail-icon',
  html: `<div style="
    inline-size: 10px;
    block-size: 10px;
    border-radius: 50%;
    border: 2px solid #fff;
    background: #7367F0;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 25%);
  "></div>`,
  iconSize: [10, 10],
  iconAnchor: [5, 5],
  popupAnchor: [0, -6],
})

const createEndpointIcon = (color, label) => L.divIcon({
  className: 'tracking-trail-icon',
  html: `<div style="
    display: flex;
    align-items: center;
    justify-content: center;
    inline-size: 26px;
    block-size: 26px;
    border-radius: 50%;
    border: 3px solid #fff;
    background: ${color};
    box-shadow: 0 2px 8px rgba(0, 0, 0, 30%);
    color: #fff;
    font: 700 10px/1 sans-serif;
  ">${label}</div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  popupAnchor: [0, -14],
})

/** Redraw the whole trail — it only changes on an explicit user query. */
const drawTrail = () => {
  if (!leafletMap) return

  if (layerGroup) {
    leafletMap.removeLayer(layerGroup)
    layerGroup = null
  }

  const points = props.points

  if (!points.length) return

  // Mercator-safe positions (see toRenderableLatLng in useTracking): a raw
  // latitude beyond ±85.05° cannot be projected, so an unclamped polyline runs
  // off the top/bottom of the world and fitBounds ends up spanning the globe.
  const latLngs = points.map(p => [
    p.mapLat ?? Number(p.latitude),
    p.mapLng ?? Number(p.longitude),
  ])

  const layers = []

  // A polyline needs at least two points — a single point is just a marker,
  // never a fake route.
  if (latLngs.length > 1) {
    layers.push(L.polyline(latLngs, {
      color: '#7367F0',
      weight: 4,
      opacity: 0.75,
    }))
  }

  // Popups keep the TRUE coordinates; only the pin position is clamped.
  const clampNote = point => (point.isOutsideMapRange
    ? '<br><span style="color:#FF9F43;">خارج نطاق ±85.05° للخريطة</span>'
    : '')

  // Intermediate points stay small so the start/end stand out.
  points.slice(1, -1).forEach((point, index) => {
    layers.push(
      L.marker(latLngs[index + 1], { icon: createDot() })
        .bindPopup(`النقطة ${index + 2} · ${formatTrackingTime(point.recordedAt)}${clampNote(point)}`),
    )
  })

  const first = points[0]

  layers.push(
    L.marker(latLngs[0], { icon: createEndpointIcon('#28C76F', 'A') })
      .bindPopup(`<strong>Start</strong><br>${formatTrackingTime(first.recordedAt)}${clampNote(first)}`),
  )

  if (points.length > 1) {
    const last = points[points.length - 1]

    layers.push(
      L.marker(latLngs[latLngs.length - 1], { icon: createEndpointIcon('#EA5455', 'B') })
        .bindPopup(`<strong>End</strong><br>${formatTrackingTime(last.recordedAt)}${clampNote(last)}`),
    )
  }

  layerGroup = L.layerGroup(layers).addTo(leafletMap)

  if (latLngs.length === 1) {
    leafletMap.setView(latLngs[0], points[0].isOutsideMapRange ? 4 : 15)

    return
  }

  const bounds = L.latLngBounds(latLngs)

  if (!bounds.isValid()) return

  // Every point on the same spot → fitBounds would slam to max zoom.
  if (bounds.getNorth() === bounds.getSouth() && bounds.getEast() === bounds.getWest()) {
    leafletMap.setView(bounds.getCenter(), 15)

    return
  }

  leafletMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 })
}

const onMapReady = map => {
  leafletMap = map

  // Before drawTrail: a trail spanning a wide area (or containing a clamped
  // polar point) makes fitBounds zoom right out, which is what put five copies
  // of the world on screen. Installing the minZoom floor first clamps it.
  releaseWorldView = constrainMapToSingleWorld(map)
  drawTrail()
}

watch(() => props.points, drawTrail)

onBeforeUnmount(() => {
  releaseWorldView?.()
  releaseWorldView = null
  layerGroup = null
  leafletMap = null
})
</script>

<template>
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
        no-wrap
      />
    </LMap>
  </div>
</template>

<style scoped>
:deep(.leaflet-container) {
  z-index: 0;
}

:deep(.tracking-trail-icon) {
  border: none !important;
  background: transparent !important;
}
</style>
