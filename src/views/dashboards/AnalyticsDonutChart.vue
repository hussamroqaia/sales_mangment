<script setup>
/**
 * AnalyticsDonutChart.vue
 *
 * A donut for the two genuine part-of-whole breakdowns on this dashboard —
 * invoice status, stock health — and for route outcomes, which is the same
 * shape: a set of mutually exclusive buckets that sum to a total the backend
 * also states.
 *
 * Slices arrive already named, coloured and counted. The component never
 * derives a slice: every "other" category a donut appears to need is arithmetic
 * on figures whose exclusivity nothing guarantees, and a donut that silently
 * assumes it is a wrong chart rather than an incomplete one.
 *
 * The centre carries the total the API returned, not a sum of the slices —
 * `stockHealth.totalSkus` and `routeOutcomes.plannedStops` are values in their
 * own right, and recomputing them here would quietly paper over any disagreement
 * with the parts instead of showing it.
 */

const props = defineProps({
  /** `[{ label: string, value: number, color: string }]` — `color` is a theme key. */
  slices: { type: Array, required: true },

  /** Big figure inside the ring, already formatted. */
  centerValue: { type: String, default: '' },

  /** Caption under it. */
  centerLabel: { type: String, default: '' },

  height: { type: Number, default: 320 },
})

const { baseOptions, colors, ink } = useChartTheme()

const series = computed(() => props.slices.map(slice => Number(slice.value) || 0))

const chartOptions = computed(() => ({
  ...baseOptions.value,
  chart: { ...baseOptions.value.chart, type: 'donut' },
  labels: props.slices.map(slice => slice.label),
  colors: props.slices.map(slice => colors.value[slice.color] ?? colors.value.primary),
  stroke: { width: 0 },
  grid: { padding: { top: 0, bottom: 0, left: 0, right: 0 } },
  legend: {
    ...baseOptions.value.legend,
    position: 'bottom',
    horizontalAlign: 'center',
    offsetY: 4,
  },
  plotOptions: {
    pie: {
      donut: {
        size: '72%',
        labels: {
          show: Boolean(props.centerValue),

          // `name` is the caption, `value` the figure — Apex draws the caption
          // above, which is the wrong way round for a total. So the total is
          // rendered as the always-on `total` label and the per-slice hover
          // labels are turned off: hovering a slice must not replace the
          // period's total with one bucket's count.
          name: {
            fontSize: '0.8125rem',
            fontFamily: 'inherit',
            color: ink.value.medium,
            offsetY: 22,
          },
          value: {
            fontSize: '1.5rem',
            fontFamily: 'inherit',
            fontWeight: 500,
            color: ink.value.high,
            offsetY: -18,
            formatter: () => props.centerValue,
          },
          total: {
            show: true,
            showAlways: true,
            label: props.centerLabel,
            fontSize: '0.8125rem',
            fontFamily: 'inherit',
            color: ink.value.medium,
            formatter: () => props.centerValue,
          },
        },
      },
    },
  },
  tooltip: {
    ...baseOptions.value.tooltip,
    y: { formatter: value => formatDashboardCount(value) },
  },
  dataLabels: { enabled: false },
}))
</script>

<template>
  <VueApexCharts
    type="donut"
    :height="height"
    :options="chartOptions"
    :series="series"
  />
</template>
