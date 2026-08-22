<script setup>
/**
 * AnalyticsTrendChart.vue
 *
 * The time-series chart shared by the three trends on this dashboard: sales,
 * inventory movement, and fill rate.
 *
 * ─── One numeric axis, always ────────────────────────────────────────────────
 * Every series handed to this component must be in the SAME unit. The sales
 * trend carries an invoice count alongside its money total, and the fill-rate
 * trend carries requested/fulfilled quantities alongside a percentage — neither
 * belongs on the axis that scales the other. Eight invoices plotted against a
 * quarter of a million in sales is a flat line at zero; a percentage plotted
 * against a unit count is a percentage nobody can read. Those companion figures
 * go in the tooltip instead (`extraRows`), where they are exact and cost the
 * chart nothing.
 *
 * ─── Nulls ───────────────────────────────────────────────────────────────────
 * A null in a series is drawn as a gap, never as zero. `fillRatePercent` is
 * null when nothing was requested in a period, which is a different statement
 * from "nothing was fulfilled" — flattening it to 0 would invent a failure the
 * warehouse never had.
 *
 * ─── RTL ─────────────────────────────────────────────────────────────────────
 * Time runs left-to-right even on an Arabic page: a reversed time axis is a
 * stronger convention to break than the page direction is to honour, and every
 * reader of this dashboard has seen a hundred charts that run the usual way.
 * What does move is the value axis, to the right — the reading start.
 */

const props = defineProps({
  /**
   * `[{ name: string, data: (number|null)[], color?: string }]` — one entry per
   * series, all in the same unit, aligned index-for-index with `categories`.
   */
  series: { type: Array, required: true },

  /** X-axis labels, already formatted for the applied granularity. */
  categories: { type: Array, required: true },

  /** Long labels for the tooltip heading — same index basis as `categories`. */
  tooltipTitles: { type: Array, default: () => [] },

  /** 'area' | 'line' | 'bar'. */
  type: { type: String, default: 'area' },

  /** Formats the value axis and every series row in the tooltip. */
  formatValue: { type: Function, required: true },

  /** Compact form for the axis ticks; falls back to `formatValue`. */
  formatAxis: { type: Function, default: null },

  /**
   * Extra tooltip rows for a data point: `index => [{ label, value }]`.
   * This is where a companion metric in another unit belongs.
   */
  extraRows: { type: Function, default: null },

  /** Pins the axis, e.g. `[0, 100]` for a percentage. */
  min: { type: Number, default: undefined },
  max: { type: Number, default: undefined },

  height: { type: Number, default: 320 },
})

const { baseOptions, axisLabelStyle, colors, palette } = useChartTheme()

const apexSeries = computed(() => props.series.map(s => ({ name: s.name, data: s.data })))

const seriesColors = computed(() =>
  props.series.map((s, index) =>
    (s.color ? colors.value[s.color] ?? colors.value.primary : palette.value[index % palette.value.length])))

const escape = text => String(text).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/**
 * Tooltip as explicit RTL markup — the Arabic label has to precede its figure,
 * and Apex's shared default cannot carry the companion metrics described above.
 */
const tooltipRenderer = ({ dataPointIndex }) => {
  const title = props.tooltipTitles[dataPointIndex] ?? props.categories[dataPointIndex] ?? ''

  const seriesRows = props.series.map((s, index) => {
    const raw = s.data[dataPointIndex]

    // A gap in the data is stated as such rather than printed as a zero.
    const value = raw === null || raw === undefined ? 'لا توجد بيانات' : props.formatValue(raw)
    const swatch = seriesColors.value[index]

    return `
      <div class="analytics-tooltip__row">
        <span class="analytics-tooltip__label">
          <span class="analytics-tooltip__dot" style="background:${escape(swatch)}"></span>${escape(s.name)}
        </span>
        <span class="analytics-tooltip__value">${escape(value)}</span>
      </div>`
  }).join('')

  const extras = (props.extraRows?.(dataPointIndex) ?? [])
    .map(row => `
      <div class="analytics-tooltip__row">
        <span class="analytics-tooltip__label">${escape(row.label)}</span>
        <span class="analytics-tooltip__value">${escape(row.value)}</span>
      </div>`)
    .join('')

  return `
    <div class="analytics-tooltip" dir="rtl">
      <div class="analytics-tooltip__title">${escape(title)}</div>
      ${seriesRows}
      ${extras}
    </div>`
}

/**
 * Whether any plotted point stands alone between two gaps.
 *
 * A line is drawn between neighbours, so a value whose neighbours are both null
 * has nothing to connect to and renders as literally nothing with markers off.
 * That is exactly the shape of the fill-rate trend: one day of demand in a
 * thirty-day window, which appeared on screen as an empty grid rather than as
 * the 100% it actually was. Markers are turned on only when that can happen,
 * so a dense trend keeps its clean unmarked line.
 */
const hasIsolatedPoint = computed(() => props.series.some(s => s.data.some((value, index) => {
  if (value === null || value === undefined) return false

  const before = s.data[index - 1]
  const after = s.data[index + 1]
  const noBefore = index === 0 || before === null || before === undefined
  const noAfter = index === s.data.length - 1 || after === null || after === undefined

  return noBefore && noAfter
})))

/**
 * A short series is drawn with straight segments and visible points.
 *
 * `curve: 'smooth'` interpolates a monotone spline between samples, which is a
 * fair reading of thirty daily points and a false one of two monthly buckets:
 * at MONTH granularity over a single month the smooth curve drew a graceful
 * S-shaped ramp between July and August, implying a month of steady growth the
 * API never reported. Below four points the segments are drawn straight and
 * every sample is marked, so what was measured and what was interpolated stay
 * distinguishable.
 */
const isSparse = computed(() => props.categories.length <= 3)

const chartOptions = computed(() => ({
  ...baseOptions.value,
  chart: { ...baseOptions.value.chart, type: props.type },
  colors: seriesColors.value,
  stroke: {
    curve: isSparse.value ? 'straight' : 'smooth',
    width: props.type === 'bar' ? 0 : 2.5,
    lineCap: 'round',
  },
  fill: props.type === 'area'
    ? {
      type: 'gradient',
      gradient: { shadeIntensity: 0.6, opacityFrom: 0.35, opacityTo: 0.02, stops: [0, 95, 100] },
    }
    : { opacity: 1 },
  markers: { size: hasIsolatedPoint.value || isSparse.value ? 4 : 0, hover: { size: 6 } },

  // Edge ticks need room. Apex centres a label under its data point, and the
  // first and last points sit hard against the ends of the plot — so half of
  // `يوليو 2026` was drawn outside the chart and clipped. A dense axis hides
  // the overlapping ends anyway and needs far less room, so the inset is only
  // paid for where it is needed.
  grid: {
    ...baseOptions.value.grid,
    padding: { top: -8, bottom: -4, left: isSparse.value ? 34 : 20, right: isSparse.value ? 34 : 12 },
  },
  legend: { ...baseOptions.value.legend, show: props.series.length > 1 },
  xaxis: {
    type: 'category',
    categories: props.categories,

    // A month of daily buckets is 30 ticks and room for about eight. Apex thins
    // them evenly rather than dropping the tail, so the first and last periods
    // stay labelled. This belongs on the axis, NOT on `labels` — nested inside
    // `labels` it is silently ignored and all thirty dates are drawn on top of
    // one another.
    tickAmount: Math.min(props.categories.length, 8),
    axisBorder: { show: false },
    axisTicks: { show: false },
    tooltip: { enabled: false },
    labels: {
      style: axisLabelStyle.value,
      rotate: 0,
      hideOverlappingLabels: true,
      trim: false,
    },
  },
  yaxis: {
    // Value axis on the right: the reading start of an RTL page.
    opposite: true,
    min: props.min,
    max: props.max,
    tickAmount: 4,
    labels: {
      style: axisLabelStyle.value,
      formatter: value => (props.formatAxis ?? props.formatValue)(value),
    },
  },
  tooltip: { ...baseOptions.value.tooltip, shared: false, intersect: false, custom: tooltipRenderer },
  plotOptions: {
    bar: { borderRadius: 4, borderRadiusApplication: 'end', columnWidth: '55%' },
  },
}))
</script>

<template>
  <VueApexCharts
    :type="type"
    :height="height"
    :options="chartOptions"
    :series="apexSeries"
  />
</template>
