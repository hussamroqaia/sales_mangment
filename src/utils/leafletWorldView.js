/**
 * leafletWorldView.js
 *
 * Keeps a Leaflet map showing exactly ONE copy of the world.
 *
 * The "world repeats across the map" look is really two separate defects, and
 * fixing only one of them just trades a wrong picture for a different one:
 *
 *  1. Horizontal repetition — Leaflet tiles the basemap infinitely along the
 *     x-axis. As soon as the container is wider than the projected world you
 *     see Africa two or three times over. `noWrap` on the TILE LAYER stops the
 *     tiles from repeating; it is a tile-layer option, not a map option, which
 *     is why it cannot live in this helper.
 *
 *  2. Empty gutters — with the repetition gone, any zoom level where the world
 *     is smaller than the container leaves blank background instead (the grey
 *     band above the map in the reported screenshot). Leaflet cannot pick the
 *     floor for us because the answer depends on the container's pixel size, so
 *     `applyMinZoom` computes the zoom at which the world still covers the
 *     viewport and installs it as `minZoom` — recomputed on every resize, since
 *     a wider card needs a deeper floor.
 *
 * `maxBounds` then stops the single world copy being dragged off-screen.
 *
 * ⚠️ Names are prefixed because `src/utils` is auto-imported project-wide (see
 * the note in locale.js) — a duplicate export name would silently shadow.
 */

/**
 * Web Mercator cannot project past ±85.05112878°, so as far as the tiles are
 * concerned this IS the whole world. Matches the clamp useTracking applies to
 * out-of-range positions.
 */
export const LEAFLET_WORLD_BOUNDS = [[-85.05112878, -180], [85.05112878, 180]]

/**
 * Constrain a Leaflet map to a single, gutter-free copy of the world.
 *
 * Call once the map instance exists (vue-leaflet's `@ready`). Remember to pair
 * it with `no-wrap` on the tile layer — see the note above.
 *
 * @param {Object} map  Leaflet map instance
 * @returns {() => void} teardown that detaches the resize listener
 */
export const constrainMapToSingleWorld = map => {
  if (!map) return () => {}

  const container = map.getContainer()

  map.setMaxBounds(LEAFLET_WORLD_BOUNDS)

  // 1.0 makes the edge solid — the world cannot be dragged past at all.
  // Assigned on the instance because vue-leaflet does not surface this as a prop.
  map.options.maxBoundsViscosity = 1

  const applyMinZoom = () => {
    // getBoundsZoom clamps its result to the CURRENT minZoom, so a floor left
    // over from a wider layout would stop the new (lower) one being applied
    // when the card shrinks. Drop the floor first, then measure.
    map.setMinZoom(0)

    // `inside: true` → the lowest zoom at which the viewport still fits inside
    // the world, i.e. the last zoom before gutters would appear.
    const min = map.getBoundsZoom(LEAFLET_WORLD_BOUNDS, true)

    if (!Number.isFinite(min)) return

    map.setMinZoom(min)
    if (map.getZoom() < min) map.setZoom(min)
  }

  // Leaflet's own `trackResize` listens to the WINDOW, so a container that
  // changes size because the layout moved — the nav rail collapsing, a card
  // reflowing — leaves the map holding a stale size. That is not just a
  // cosmetic problem here: the floor above is derived from the container's
  // pixel width, so a stale size means the wrong floor. Observing the element
  // catches both causes, and refreshing Leaflet's own size first keeps the
  // measurement honest (it also fixes the tile misalignment that a
  // container-only resize otherwise leaves behind).
  // No extra debouncing: ResizeObserver already delivers at most once per
  // animation frame, so a rAF wrapper would only add a hazard — rAF is parked
  // while the tab is hidden, which is exactly when a layout change is likely.
  const handleResize = () => {
    // A hidden container reports 0×0, which would yield a meaningless floor.
    if (!container.clientWidth || !container.clientHeight) return

    map.invalidateSize({ animate: false })
    applyMinZoom()
  }

  applyMinZoom()

  const observer = new ResizeObserver(handleResize)

  observer.observe(container)

  return () => observer.disconnect()
}
