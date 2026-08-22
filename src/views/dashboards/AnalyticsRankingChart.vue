<script setup>
/**
 * AnalyticsRankingChart.vue
 *
 * One horizontal bar chart for a "top N" list.
 *
 * Horizontal rather than vertical because every ranking on this dashboard is
 * keyed by a name — `شادي حمزة`, `ماركت المالكي المركزي`, `مسحوق تايد ٣ كغ` —
 * and names that long under a vertical axis either overlap or get rotated onto
 * their side. A horizontal bar gives each label a full line of its own.
 *
 * It takes rows that are ALREADY normalised (`label` / `value` / `details`)
 * rather than a DTO plus a pair of key names. Six rankings across the two
 * endpoints use six different field names for the same two ideas; mapping them
 * at the call site keeps that knowledge next to the payload it belongs to and
 * leaves this component with nothing to know about the API at all.
 *
 * ─── RTL, and why the bars still run left-to-right ───────────────────────────
 * The obvious mirror — `yaxis.opposite` to put the names on the right and
 * `xaxis.reversed` to grow the bars leftwards to meet them — does not work:
 * ApexCharts honours `reversed` on a category axis but not on the value axis of
 * a horizontal bar series, so the labels move and the bars do not. That is
 * worse than not mirroring at all, because every name ends up at the far end of
 * the bar it belongs to, and it is what this component did until it was seen on
 * screen.
 *
 * `direction: rtl` on the container is not the answer either: CSS direction
 * does not mirror an SVG. It moves only the HTML overlays Apex renders (legend,
 * tooltip) and leaves the geometry exactly where it was.
 *
 * So the bars keep the conventional orientation — name on the left, bar growing
 * rightwards from it — which keeps every label adjacent to the bar it names.
 * The Arabic text inside each label is still laid out right-to-left by the
 * browser's own bidi handling, and the tooltip, which IS HTML, is rendered RTL.
 */

import { useDisplay } from 'vuetify'

const props = defineProps({
  /**
   * Rows in the order they should appear, already ranked by the backend.
   * `{ label: string, value: number, details?: [{ label: string, value: string }] }`
   * — `details` are extra tooltip lines, pre-formatted by the caller.
   */
  rows: { type: Array, required: true },

  /** Series name; also the tooltip's value row label. */
  valueName: { type: String, required: true },

  /** A formatter for the value axis and the tooltip's headline figure. */
  formatValue: { type: Function, required: true },

  /** Semantic theme colour for the bars. */
  color: { type: String, default: 'primary' },

  height: { type: Number, default: 320 },
})

const { baseOptions, axisLabelStyle, colors } = useChartTheme()

// Category labels are given a share of the chart, not a fixed slab of it. At
// 190px — comfortable beside a two-thirds-width desktop card — the same label
// column would eat half of a full-width phone card and leave the bars with
// nothing to be long in.
const { smAndDown } = useDisplay()

const series = computed(() => [{
  name: props.valueName,
  data: props.rows.map(row => Number(row.value) || 0),
}])

/**
 * Tooltip as explicit RTL markup.
 *
 * Apex's default tooltip is `label: value` in DOM order, which an Arabic
 * sentence needs the other way round, and it can only show the one number in
 * the series. Every ranking here carries a second figure the bar cannot state —
 * an invoice count behind a total, a share of the period — so the tooltip is
 * where they go.
 */
const tooltipRenderer = ({ dataPointIndex }) => {
  const row = props.rows[dataPointIndex]
  if (!row) return ''

  const escape = text => String(text).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

  const detailRows = (row.details ?? [])
    .map(detail => `
      <div class="analytics-tooltip__row">
        <span class="analytics-tooltip__label">${escape(detail.label)}</span>
        <span class="analytics-tooltip__value">${escape(detail.value)}</span>
      </div>`)
    .join('')

  return `
    <div class="analytics-tooltip" dir="rtl">
      <div class="analytics-tooltip__title">${escape(row.label)}</div>
      <div class="analytics-tooltip__row">
        <span class="analytics-tooltip__label">${escape(props.valueName)}</span>
        <span class="analytics-tooltip__value">${escape(props.formatValue(row.value))}</span>
      </div>
      ${detailRows}
    </div>`
}

const chartOptions = computed(() => {
  const barColor = colors.value[props.color] ?? colors.value.primary

  return {
    ...baseOptions.value,
    colors: [barColor],
    chart: { ...baseOptions.value.chart, type: 'bar' },
    plotOptions: {
      bar: {
        horizontal: true,
        barHeight: props.rows.length > 8 ? '70%' : '55%',
        borderRadius: 4,
        borderRadiusApplication: 'end',
        distributed: false,
      },
    },
    grid: {
      ...baseOptions.value.grid,
      padding: { top: -12, bottom: -6, left: 0, right: 0 },
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: false } },
    },
    legend: { show: false },
    xaxis: {
      categories: props.rows.map(row => row.label),

      // Four ticks, so the value scale is readable without the axis turning
      // into a row of overlapping thousands separators.
      tickAmount: 4,
      labels: {
        style: axisLabelStyle.value,

        // Compact on the axis, exact in the tooltip: a stock-value ranking
        // reaches seven figures, and five ticks of `1,800,000` is a wall of
        // digits under a chart whose point is the relative bar lengths.
        formatter: value => formatDashboardCompact(value),
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        style: axisLabelStyle.value,

        // Wide enough for the longest customer names the API returns, so a
        // ranking is not reduced to a column of ellipses. Anything still longer
        // is readable in full in the tooltip.
        maxWidth: smAndDown.value ? 120 : 190,
      },
    },
    tooltip: { ...baseOptions.value.tooltip, custom: tooltipRenderer },
    fill: { opacity: 1 },
    stroke: { show: false },
  }
})
</script>

<template>
  <VueApexCharts
    type="bar"
    :height="height"
    :options="chartOptions"
    :series="series"
  />
</template>
