<script setup>
/**
 * DashboardSalesAnalytics.vue
 *
 * The sales half of GET /api/reports/dashboard/sales/analytics.
 *
 * Layout, and why it is this shape rather than one card per field:
 *
 *   period summary  → four KPI tiles. Four scalars in four different units; a
 *                     chart comparing them would compare nothing.
 *   salesTrend      → one large area chart, the page's primary visual.
 *   status split    → one donut beside it.
 *   the rankings    → ONE tabbed card. Four separate bar charts of five bars
 *                     each would be four screens of the same picture; as tabs
 *                     they occupy one card and stay directly comparable.
 *   routeOutcomes   → a donut plus the completion figure the API already
 *                     computed.
 *
 * Every figure is read straight from the DTO. Nothing on this page is derived
 * from another figure — `sharePercent`, `revenueSharePercent` and
 * `completionPercent` all come back from the backend, and recomputing any of
 * them here would be a second, quietly different answer to a question already
 * settled.
 */

import AnalyticsCard from '@/views/dashboards/AnalyticsCard.vue'
import AnalyticsDonutChart from '@/views/dashboards/AnalyticsDonutChart.vue'
import AnalyticsRankingChart from '@/views/dashboards/AnalyticsRankingChart.vue'
import AnalyticsTrendChart from '@/views/dashboards/AnalyticsTrendChart.vue'
import DashboardStatCard from '@/views/dashboards/DashboardStatCard.vue'

const props = defineProps({
  /** SalesAnalytics DTO, or null while loading / after a failure. */
  data: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },

  /** Granularity the DATA was built with — drives the period labels. */
  granularity: { type: String, default: 'DAY' },

  /** Caption under each card: the window on screen. */
  rangeLabel: { type: String, default: '' },
})

defineEmits(['retry'])

// ── Period summary ────────────────────────────────────────────────────────────
// STATIC_UI_CONFIGURATION: labels and icons only; every value reads the DTO.
const summaryTiles = computed(() => {
  const s = props.data?.periodSummary

  return [
    { key: 'totalSales', title: 'إجمالي المبيعات', icon: 'tabler-currency-dollar', value: formatDashboardAmount(s?.totalSales) },
    { key: 'invoiceCount', title: 'عدد الفواتير', icon: 'tabler-file-invoice', value: formatDashboardCount(s?.invoiceCount) },
    { key: 'averageInvoiceValue', title: 'متوسط قيمة الفاتورة', icon: 'tabler-receipt', value: formatDashboardAmount(s?.averageInvoiceValue) },
    { key: 'uniqueCustomers', title: 'العملاء الفريدون', icon: 'tabler-users-group', value: formatDashboardCount(s?.uniqueCustomers) },
  ]
})

// ── Sales trend ───────────────────────────────────────────────────────────────
const trendPoints = computed(() => props.data?.salesTrend ?? [])

const trendCategories = computed(() =>
  trendPoints.value.map(point => formatAnalyticsPeriod(point.periodStart, props.granularity)))

const trendTooltipTitles = computed(() =>
  trendPoints.value.map(point => formatAnalyticsPeriodLong(point.periodStart, props.granularity)))

// A value that cannot be read as a number becomes null — a gap in the line —
// rather than 0. `Number(undefined)` is NaN, and NaN handed to Apex is drawn at
// the axis floor, which would state a period of no sales that never happened.
const toChartNumber = value => {
  const n = Number(value)

  return Number.isFinite(n) ? n : null
}

const trendSeries = computed(() => [{
  name: 'المبيعات',
  color: 'primary',
  data: trendPoints.value.map(point => toChartNumber(point.salesTotal)),
}])

/**
 * The invoice count rides in the tooltip rather than as a second series.
 *
 * It is a count and the axis is money: on one scale eight invoices next to
 * ٢٦٢٬٩٠٠ is a line pinned to the floor, and a second axis for a figure this
 * small buys a second set of gridlines for no reading anyone would do. In the
 * tooltip it is exact and beside the amount it explains.
 */
const trendExtraRows = index => {
  const point = trendPoints.value[index]
  if (!point) return []

  return [{ label: 'عدد الفواتير', value: formatDashboardCount(point.invoiceCount) }]
}

// ── Rankings ──────────────────────────────────────────────────────────────────
// One tabbed card. Each tab maps its own DTO shape onto the ranking chart's
// `label` / `value` / `details` contract — the mapping stays here, next to the
// payload, and the chart stays free of any knowledge of the API.
const rankingTab = ref('representatives')

const rankings = computed(() => {
  const d = props.data

  return {
    representatives: {
      title: 'المندوبون',
      valueName: 'إجمالي المبيعات',
      format: formatDashboardAmount,
      color: 'primary',
      rows: (d?.topRepresentatives ?? []).map(row => ({
        label: formatDashboardName(row.representativeName),
        value: row.totalSales,
        details: [
          { label: 'عدد الفواتير', value: formatDashboardCount(row.invoiceCount) },
          { label: 'الحصة', value: formatDashboardPercent(row.sharePercent) },
        ],
      })),
    },
    territories: {
      title: 'المناطق',
      valueName: 'إجمالي المبيعات',
      format: formatDashboardAmount,
      color: 'info',
      rows: (d?.topTerritories ?? []).map(row => ({
        label: formatDashboardName(row.territoryName),
        value: row.totalSales,
        details: [
          { label: 'عدد الفواتير', value: formatDashboardCount(row.invoiceCount) },
          { label: 'الحصة', value: formatDashboardPercent(row.sharePercent) },
        ],
      })),
    },
    products: {
      title: 'المنتجات',
      valueName: 'الإيراد',
      format: formatDashboardAmount,
      color: 'warning',
      rows: (d?.topProducts ?? []).map(row => ({
        label: formatDashboardName(row.productName),
        value: row.revenue,
        details: [
          { label: 'الوحدات المباعة', value: formatDashboardCount(row.unitsSold) },
          { label: 'الحصة من الإيراد', value: formatDashboardPercent(row.revenueSharePercent) },
        ],
      })),
    },
    customers: {
      title: 'العملاء',
      valueName: 'إجمالي المشتريات',
      format: formatDashboardAmount,
      color: 'success',
      rows: (d?.topCustomers ?? []).map(row => ({
        label: formatDashboardName(row.customerName),
        value: row.totalSpent,
        details: [
          { label: 'عدد الفواتير', value: formatDashboardCount(row.invoiceCount) },
        ],
      })),
    },
  }
})

const activeRanking = computed(() => rankings.value[rankingTab.value])

// ── Invoice status ────────────────────────────────────────────────────────────
// Colours reuse the invoice module's own status variants, so a status wears the
// same colour in this donut as it does on its chip in the invoices list.
const statusSlices = computed(() =>
  (props.data?.invoiceStatusDistribution ?? []).map(slice => ({
    label: invoiceStatusTitle(slice.status),
    value: Number(slice.count) || 0,
    color: resolveInvoiceStatusVariant(slice.status).color,
  })))

const statusTotal = computed(() =>
  statusSlices.value.reduce((sum, slice) => sum + slice.value, 0))

/**
 * Empty when every bucket is zero, not merely when the array is.
 *
 * A donut of four zero-count slices is drawn by Apex as four equal quarters —
 * a picture of a balanced period that did not happen. The array being non-empty
 * is not enough to have something to show.
 */
const isStatusEmpty = computed(() => statusTotal.value === 0)

// ── Route outcomes ────────────────────────────────────────────────────────────
const routeOutcomes = computed(() => props.data?.routeOutcomes ?? null)

const routeSlices = computed(() => {
  const r = routeOutcomes.value
  if (!r) return []

  // The four states the backend reports, in the order a reader ranks them.
  // No fifth "other" slice is derived from `plannedStops`: these are the
  // buckets the API declares, and the total sits in the centre unchanged.
  return [
    { label: 'مكتملة', value: Number(r.completed) || 0, color: 'success' },
    { label: 'قيد التنفيذ', value: Number(r.inProgress) || 0, color: 'info' },
    { label: 'فائتة', value: Number(r.missed) || 0, color: 'error' },
    { label: 'لم تتم زيارتها', value: Number(r.notVisited) || 0, color: 'secondary' },
  ]
})

const isRouteEmpty = computed(() =>
  !routeOutcomes.value || routeSlices.value.every(slice => slice.value === 0))

const trendIsEmpty = computed(() => trendPoints.value.length === 0)
</script>

<template>
  <div>
    <div class="d-flex flex-wrap align-center gap-2 mb-4">
      <div>
        <h5 class="text-h5">
          تحليلات المبيعات
        </h5>
        <span class="text-body-2 text-medium-emphasis">
          {{ rangeLabel || 'الفترة المحددة' }}
        </span>
      </div>
    </div>

    <!--
      A failure that took the whole payload down is stated once, at the top,
      instead of repeated inside five cards that all failed for the same reason.
    -->
    <VAlert
      v-if="error"
      type="error"
      variant="tonal"
      class="mb-4"
    >
      {{ error }}

      <template #append>
        <VBtn
          variant="text"
          size="small"
          :loading="loading"
          @click="$emit('retry')"
        >
          إعادة المحاولة
        </VBtn>
      </template>
    </VAlert>

    <template v-else>
      <!-- ── Period summary ─────────────────────────────────────────────── -->
      <VRow class="match-height">
        <VCol
          v-for="tile in summaryTiles"
          :key="tile.key"
          cols="12"
          sm="6"
          lg="3"
        >
          <!--
            A skeleton, not a zero: "no sales in this window" is a result this
            dashboard reports often, and a 0 rendered while the request is still
            in flight is indistinguishable from it.
          -->
          <VSkeletonLoader
            v-if="loading"
            type="list-item-two-line"
          />

          <DashboardStatCard
            v-else
            :title="tile.title"
            :value="tile.value"
            :icon="tile.icon"
          />
        </VCol>
      </VRow>

      <!-- ── Trend + status ─────────────────────────────────────────────── -->
      <VRow class="match-height">
        <VCol
          cols="12"
          lg="8"
        >
          <AnalyticsCard
            title="اتجاه المبيعات"
            :subtitle="rangeLabel"
            :loading="loading"
            :empty="trendIsEmpty"
            :body-height="340"
            @retry="$emit('retry')"
          >
            <AnalyticsTrendChart
              :series="trendSeries"
              :categories="trendCategories"
              :tooltip-titles="trendTooltipTitles"
              :format-value="formatDashboardAmount"
              :format-axis="formatDashboardCompact"
              :extra-rows="trendExtraRows"
              :height="340"
            />
          </AnalyticsCard>
        </VCol>

        <VCol
          cols="12"
          lg="4"
        >
          <AnalyticsCard
            title="حالات الفواتير"
            subtitle="توزيع فواتير الفترة"
            :loading="loading"
            :empty="isStatusEmpty"
            empty-icon="tabler-chart-pie-off"
            empty-text="لا توجد فواتير ضمن الفترة المحددة"
            :body-height="340"
            @retry="$emit('retry')"
          >
            <AnalyticsDonutChart
              :slices="statusSlices"
              :center-value="formatDashboardCount(statusTotal)"
              center-label="إجمالي الفواتير"
              :height="340"
            />
          </AnalyticsCard>
        </VCol>
      </VRow>

      <!-- ── Rankings + route outcomes ──────────────────────────────────── -->
      <VRow class="match-height">
        <VCol
          cols="12"
          lg="8"
        >
          <AnalyticsCard
            title="الأعلى أداءً"
            :subtitle="rangeLabel"
            :loading="loading"
            :empty="!activeRanking.rows.length"
            :body-height="360"
            @retry="$emit('retry')"
          >
            <template #actions>
              <!--
                Tabs live in the header rather than above the chart so the card
                keeps one heading. `grow` is off: four Arabic words of unequal
                length stretched to equal thirds read as a toolbar, not tabs.
              -->
              <VTabs
                v-model="rankingTab"
                density="compact"
                class="analytics-ranking-tabs"
              >
                <VTab
                  v-for="(ranking, key) in rankings"
                  :key="key"
                  :value="key"
                >
                  {{ ranking.title }}
                </VTab>
              </VTabs>
            </template>

            <AnalyticsRankingChart
              :key="rankingTab"
              :rows="activeRanking.rows"
              :value-name="activeRanking.valueName"
              :format-value="activeRanking.format"
              :color="activeRanking.color"
              :height="360"
            />
          </AnalyticsCard>
        </VCol>

        <VCol
          cols="12"
          lg="4"
        >
          <AnalyticsCard
            title="نتائج المسارات"
            subtitle="محطات الفترة المحددة"
            :loading="loading"
            :empty="isRouteEmpty"
            empty-icon="tabler-route-off"
            empty-text="لا توجد محطات ضمن الفترة المحددة"
            :body-height="360"
            @retry="$emit('retry')"
          >
            <AnalyticsDonutChart
              :slices="routeSlices"
              :center-value="formatDashboardPercent(routeOutcomes?.completionPercent)"
              center-label="نسبة الإنجاز"
              :height="272"
            />

            <!--
              `plannedStops` printed beside the ring rather than summed from the
              slices: it is a figure the backend states in its own right.
            -->
            <div class="d-flex align-center justify-center gap-2 text-body-2 text-medium-emphasis">
              <VIcon
                icon="tabler-map-pin"
                size="18"
              />
              <span>المحطات المخطّطة: {{ formatDashboardCount(routeOutcomes?.plannedStops) }}</span>
            </div>
          </AnalyticsCard>
        </VCol>
      </VRow>
    </template>
  </div>
</template>

<style lang="scss" scoped>
/**
 * The ranking tabs sit in a card header slot, where Vuetify's default tab
 * height and 16px side padding would make the header taller than the title
 * beside it and push the last tab past the card's edge on a narrow column.
 * Scrolling rather than wrapping keeps all four reachable at every width.
 */
.analytics-ranking-tabs {
  --v-tabs-height: 34px;

  :deep(.v-tab) {
    min-inline-size: auto;
    padding-inline: 0.625rem;
    font-size: 0.8125rem;
  }
}
</style>
