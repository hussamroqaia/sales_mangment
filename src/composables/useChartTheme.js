/**
 * useChartTheme.js
 *
 * The bridge between the Vuetify theme and ApexCharts.
 *
 * ApexCharts draws an SVG, so it inherits nothing from the CSS cascade: every
 * colour it uses has to be handed to it as a literal value. Reading those
 * values from `useTheme()` instead of hardcoding hexes is what keeps the charts
 * legible when the user switches skin or flips light/dark — the returned
 * options are computed, so re-assigning them re-renders the chart with the new
 * palette. Hardcoding `#7367F0` would also silently ignore the primary colour
 * the customizer writes into the theme cookie.
 *
 * ─── RTL ─────────────────────────────────────────────────────────────────────
 * The page is RTL, the SVG is not mirrored. `direction: rtl` on a chart root
 * does not flip an SVG's geometry — it only reorders the HTML overlays Apex
 * renders (legend, tooltip), while axes, bars and gridlines stay where they
 * were, which is how a chart ends up with its labels on the wrong side of its
 * own bars. So RTL is applied where it is meaningful and nowhere else:
 *
 *   • value axes are moved to the right (`opposite`), the reading start;
 *   • horizontal bars grow right-to-left (`xaxis.reversed`) with their
 *     category labels on the right;
 *   • time keeps running left-to-right on trend charts — a reversed time axis
 *     is a stronger convention to break than the page direction is to honour;
 *   • legends and tooltips are HTML, so they get `rtl` treatment directly.
 *
 * Arabic strings inside SVG `<text>` are laid out by the browser's own bidi
 * algorithm and render correctly without any of this.
 */

import { useTheme } from 'vuetify'

/** `rgba()` from a theme hex + alpha. Theme colours are always plain hex. */
const withAlpha = (hex, alpha) => {
  const rgb = hexToRgb(hex)

  return rgb ? `rgba(${rgb},${alpha})` : hex
}

export const useChartTheme = () => {
  const vuetifyTheme = useTheme()

  const current = computed(() => vuetifyTheme.current.value)

  /**
   * Categorical series colours.
   *
   * Semantic theme entries rather than an invented ramp, in the order Vuexy
   * itself uses them, so a series picks up the same primary the rest of the app
   * is wearing. Enough distinct hues for the widest chart on the dashboard
   * (three movement series); rankings use a single colour throughout.
   */
  const palette = computed(() => {
    const c = current.value.colors

    return [c.primary, c.info, c.warning, c.success, c.error, c.secondary]
  })

  /** Colour tokens individual charts reach for by name. */
  const colors = computed(() => {
    const c = current.value.colors

    return {
      primary: c.primary,
      success: c.success,
      info: c.info,
      warning: c.warning,
      error: c.error,
      secondary: c.secondary,
      surface: c.surface,
    }
  })

  /** Text/line colours derived from the theme's emphasis + border variables. */
  const ink = computed(() => {
    const onSurface = current.value.colors['on-surface']
    const v = current.value.variables

    return {
      high: withAlpha(onSurface, v['high-emphasis-opacity']),
      medium: withAlpha(onSurface, v['medium-emphasis-opacity']),
      disabled: withAlpha(onSurface, v['disabled-opacity']),
      border: withAlpha(v['border-color'], v['border-opacity']),
      track: v['track-bg'],
    }
  })

  /**
   * Options every chart on the dashboard shares.
   *
   * Deliberately small: it fixes the theme-dependent values and the chrome that
   * would otherwise differ card to card (no toolbar, no chart-level animation
   * on re-filter, tooltip theme). Everything about what a chart MEANS — series
   * type, axis formatters, tooltips — stays in the chart component.
   */
  const baseOptions = computed(() => ({
    chart: {
      fontFamily: 'inherit',
      foreColor: ink.value.medium,
      toolbar: { show: false },
      zoom: { enabled: false },
      parentHeightOffset: 0,
      animations: { enabled: true, easing: 'easeout', speed: 350 },
    },
    colors: palette.value,
    grid: {
      borderColor: ink.value.border,
      strokeDashArray: 5,
      padding: { top: -8, bottom: -4, left: 4, right: 4 },
      xaxis: { lines: { show: false } },
    },
    dataLabels: { enabled: false },
    tooltip: {
      theme: current.value.dark ? 'dark' : 'light',
      style: { fontSize: '13px', fontFamily: 'inherit' },
    },
    legend: {
      position: 'top',
      horizontalAlign: 'left',
      fontFamily: 'inherit',
      fontSize: '13px',
      labels: { colors: ink.value.medium },
      markers: { width: 10, height: 10, radius: 10, offsetX: -4 },
      itemMargin: { horizontal: 10, vertical: 4 },
    },
    states: { hover: { filter: { type: 'lighten', value: 0.06 } } },
    noData: { text: '' },
  }))

  /** Axis label style, applied to whichever axes a chart actually renders. */
  const axisLabelStyle = computed(() => ({
    colors: ink.value.disabled,
    fontSize: '12px',
    fontFamily: 'inherit',
  }))

  return {
    isDark: computed(() => current.value.dark),
    palette,
    colors,
    ink,
    baseOptions,
    axisLabelStyle,
  }
}
