<script setup>
/**
 * DashboardInventoryAnalytics.vue
 *
 * The inventory half of GET /api/reports/dashboard/inventory/analytics.
 *
 *   stockHealth            → a donut. The one place on this dashboard where a
 *                            donut is unarguable: the backend states the three
 *                            buckets AND the total they divide.
 *   fillRateTrend          → an area chart pinned to 0–100.
 *   movementTrend          → three series in one unit, so one line chart.
 *   stock value / fast     → one tabbed ranking card, same reasoning as the
 *                            sales rankings.
 *   agingInventory         → a table, not a chart. Its useful column is `sku`,
 *                            which no bar can carry, and the rows are read one
 *                            at a time rather than compared.
 */

import AnalyticsCard from '@/views/dashboards/AnalyticsCard.vue'
import AnalyticsDonutChart from '@/views/dashboards/AnalyticsDonutChart.vue'
import AnalyticsRankingChart from '@/views/dashboards/AnalyticsRankingChart.vue'
import AnalyticsTrendChart from '@/views/dashboards/AnalyticsTrendChart.vue'

const props = defineProps({
  /** InventoryAnalytics DTO, or null while loading / after a failure. */
  data: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },

  granularity: { type: String, default: 'DAY' },
  rangeLabel: { type: String, default: '' },
})

defineEmits(['retry'])

const toChartNumber = value => {
  const n = Number(value)

  return Number.isFinite(n) ? n : null
}

// ── Stock health ──────────────────────────────────────────────────────────────
/**
 * The three buckets exactly as the backend reports them.
 *
 * `healthy` is NOT recomputed as `totalSkus - outOfStock - belowMinimum`. The
 * backend already classified every SKU, and re-deriving one bucket from the
 * others would replace its answer with an assumption about how the three
 * overlap — the one thing a donut cannot survive getting wrong.
 */
const stockHealth = computed(() => props.data?.stockHealth ?? null)

const stockHealthSlices = computed(() => {
  const h = stockHealth.value
  if (!h) return []

  return [
    { label: 'سليم', value: Number(h.healthy) || 0, color: 'success' },
    { label: 'تحت الحد الأدنى', value: Number(h.belowMinimum) || 0, color: 'warning' },
    { label: 'نفد من المخزون', value: Number(h.outOfStock) || 0, color: 'error' },
  ]
})

const isStockHealthEmpty = computed(() =>
  !stockHealth.value || stockHealthSlices.value.every(slice => slice.value === 0))

// ── Fill rate ─────────────────────────────────────────────────────────────────
const fillRatePoints = computed(() => props.data?.fillRateTrend ?? [])

const fillRateCategories = computed(() =>
  fillRatePoints.value.map(point => formatAnalyticsPeriod(point.periodStart, props.granularity)))

const fillRateTitles = computed(() =>
  fillRatePoints.value.map(point => formatAnalyticsPeriodLong(point.periodStart, props.granularity)))

/**
 * `fillRatePercent: null` is passed through as null, which the chart draws as a
 * gap.
 *
 * null and 0 are different facts here and the backend distinguishes them
 * deliberately: null means nothing was requested in that period, 0 means
 * something was requested and none of it was fulfilled. Coalescing null to 0
 * would draw a warehouse failing on days it was simply never asked for
 * anything — and on a 30-day window with two active days, that is most of the
 * chart.
 */
const fillRateSeries = computed(() => [{
  name: 'نسبة التلبية',
  color: 'success',
  data: fillRatePoints.value.map(point =>
    (point.fillRatePercent === null || point.fillRatePercent === undefined
      ? null
      : toChartNumber(point.fillRatePercent))),
}])

const fillRateExtraRows = index => {
  const point = fillRatePoints.value[index]
  if (!point) return []

  const rows = [
    { label: 'المطلوب', value: formatDashboardCount(point.requested) },
    { label: 'المُلبّى', value: formatDashboardCount(point.fulfilled) },
  ]

  // Says out loud why the line has a gap here, instead of leaving the reader to
  // guess between "no demand" and "no data".
  if (point.fillRatePercent === null || point.fillRatePercent === undefined)
    rows.unshift({ label: 'الحالة', value: 'لا يوجد طلب' })

  return rows
}

const isFillRateEmpty = computed(() => fillRatePoints.value.length === 0)

// ── Movement ──────────────────────────────────────────────────────────────────
const movementPoints = computed(() => props.data?.movementTrend ?? [])

const movementCategories = computed(() =>
  movementPoints.value.map(point => formatAnalyticsPeriod(point.periodStart, props.granularity)))

const movementTitles = computed(() =>
  movementPoints.value.map(point => formatAnalyticsPeriodLong(point.periodStart, props.granularity)))

/**
 * The three raw components, and no fourth derived one.
 *
 * A "net" series would have to assume `loaded - returned - sold` is meaningful
 * across a period boundary — stock loaded on one day is sold on the next, so
 * the figure would swing wildly and mean nothing. The backend returns the
 * components precisely so the chart can show them as components.
 */
const movementSeries = computed(() => [
  {
    name: 'المحمّل إلى السيارات',
    color: 'primary',
    data: movementPoints.value.map(point => toChartNumber(point.loadedToVans)),
  },
  {
    name: 'المرتجع من السيارات',
    color: 'warning',
    data: movementPoints.value.map(point => toChartNumber(point.returnedFromVans)),
  },
  {
    name: 'المباع',
    color: 'success',
    data: movementPoints.value.map(point => toChartNumber(point.unitsSold)),
  },
])

const isMovementEmpty = computed(() => movementPoints.value.length === 0)

// ── Product rankings ──────────────────────────────────────────────────────────
const productTab = ref('stockValue')

const productRankings = computed(() => {
  const d = props.data

  return {
    stockValue: {
      title: 'قيمة المخزون',
      valueName: 'قيمة المخزون',
      format: formatDashboardAmount,
      color: 'info',
      rows: (d?.topStockValueProducts ?? []).map(row => ({
        label: formatDashboardName(row.productName),
        value: row.stockValue,
        details: [
          { label: 'رمز الصنف (SKU)', value: formatDashboardName(row.sku) },
          { label: 'الكمية المتوفرة', value: formatDashboardCount(row.onHand) },
          { label: 'سعر الوحدة', value: formatDashboardAmount(row.unitPrice) },
        ],
      })),
    },
    fastMoving: {
      title: 'الأسرع حركة',
      valueName: 'الوحدات المباعة',

      // Ranked by units, so the axis counts units. `revenue` is the other unit
      // in the same row and stays in the tooltip — the two orders differ, and
      // labelling one bar with the other's figure would misstate the ranking.
      format: formatDashboardCount,
      color: 'success',
      rows: (d?.fastMovingProducts ?? []).map(row => ({
        label: formatDashboardName(row.productName),
        value: row.unitsSold,
        details: [
          { label: 'الإيراد', value: formatDashboardAmount(row.revenue) },
        ],
      })),
    },
  }
})

const activeProductRanking = computed(() => productRankings.value[productTab.value])

// ── Aging inventory ───────────────────────────────────────────────────────────
// STATIC_UI_CONFIGURATION: column headers. Labels match the reports module's
// vocabulary for the same fields.
const agingHeaders = [
  { title: 'المنتج', key: 'productName' },
  { title: 'رمز الصنف (SKU)', key: 'sku' },
  { title: 'الكمية', key: 'onHand', align: 'end' },
  { title: 'أيام الركود', key: 'agingDays', align: 'end' },
]

const agingRows = computed(() => props.data?.agingInventory ?? [])
</script>

<template>
  <div>
    <div class="d-flex flex-wrap align-center gap-2 mb-4">
      <div>
        <h5 class="text-h5">
          تحليلات المخزون
        </h5>
        <span class="text-body-2 text-medium-emphasis">
          {{ rangeLabel || 'الفترة المحددة' }}
        </span>
      </div>
    </div>

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
      <!-- ── Stock health + fill rate ───────────────────────────────────── -->
      <VRow class="match-height">
        <VCol
          cols="12"
          lg="4"
        >
          <AnalyticsCard
            title="حالة المخزون"
            subtitle="تصنيف الأصناف الحالي"
            :loading="loading"
            :empty="isStockHealthEmpty"
            empty-icon="tabler-package-off"
            empty-text="لا توجد أصناف مسجّلة"
            :body-height="330"
            @retry="$emit('retry')"
          >
            <AnalyticsDonutChart
              :slices="stockHealthSlices"
              :center-value="formatDashboardCount(stockHealth?.totalSkus)"
              center-label="إجمالي الأصناف"
              :height="330"
            />
          </AnalyticsCard>
        </VCol>

        <VCol
          cols="12"
          lg="8"
        >
          <AnalyticsCard
            title="نسبة تلبية الطلبات"
            :subtitle="rangeLabel"
            :loading="loading"
            :empty="isFillRateEmpty"
            :body-height="330"
            @retry="$emit('retry')"
          >
            <AnalyticsTrendChart
              :series="fillRateSeries"
              :categories="fillRateCategories"
              :tooltip-titles="fillRateTitles"
              :format-value="formatDashboardPercent"
              :extra-rows="fillRateExtraRows"
              :min="0"
              :max="100"
              :height="330"
            />
          </AnalyticsCard>
        </VCol>
      </VRow>

      <!-- ── Movement ───────────────────────────────────────────────────── -->
      <VRow>
        <VCol cols="12">
          <AnalyticsCard
            title="حركة المخزون"
            :subtitle="rangeLabel"
            :loading="loading"
            :empty="isMovementEmpty"
            :body-height="320"
            @retry="$emit('retry')"
          >
            <AnalyticsTrendChart
              :series="movementSeries"
              :categories="movementCategories"
              :tooltip-titles="movementTitles"
              type="line"
              :format-value="formatDashboardCount"
              :format-axis="formatDashboardCompact"
              :height="320"
            />
          </AnalyticsCard>
        </VCol>
      </VRow>

      <!-- ── Product rankings + aging ───────────────────────────────────── -->
      <VRow class="match-height">
        <VCol
          cols="12"
          lg="8"
        >
          <AnalyticsCard
            title="تحليلات الأصناف"
            :subtitle="rangeLabel"
            :loading="loading"
            :empty="!activeProductRanking.rows.length"
            :body-height="340"
            @retry="$emit('retry')"
          >
            <template #actions>
              <VTabs
                v-model="productTab"
                density="compact"
                class="analytics-product-tabs"
              >
                <VTab
                  v-for="(ranking, key) in productRankings"
                  :key="key"
                  :value="key"
                >
                  {{ ranking.title }}
                </VTab>
              </VTabs>
            </template>

            <AnalyticsRankingChart
              :key="productTab"
              :rows="activeProductRanking.rows"
              :value-name="activeProductRanking.valueName"
              :format-value="activeProductRanking.format"
              :color="activeProductRanking.color"
              :height="340"
            />
          </AnalyticsCard>
        </VCol>

        <VCol
          cols="12"
          lg="4"
        >
          <AnalyticsCard
            title="المخزون الراكد"
            subtitle="أصناف بلا حركة"
            :loading="loading"
            :empty="!agingRows.length"
            empty-icon="tabler-clock-check"
            empty-text="لا توجد أصناف راكدة"
            :body-height="340"
            @retry="$emit('retry')"
          >
            <!--
              A table rather than a chart: `sku` is the column a buyer acts on,
              and these rows are looked up one at a time rather than compared to
              one another.

              `agingDays` is printed as the plain number the backend returned.
              No severity colouring: neither the API nor anything in this app
              defines a threshold at which an item becomes "too" stale, and a
              red row invented here would state a policy nobody set.
            -->
            <VDataTable
              :headers="agingHeaders"
              :items="agingRows"
              item-value="productId"
              density="compact"
              :items-per-page="6"
              class="text-no-wrap analytics-aging-table"
            >
              <template #item.productName="{ item }">
                <span>{{ formatDashboardName(item.productName) }}</span>
              </template>

              <template #item.sku="{ item }">
                <span class="text-medium-emphasis">{{ formatDashboardName(item.sku) }}</span>
              </template>

              <template #item.onHand="{ item }">
                <span>{{ formatDashboardCount(item.onHand) }}</span>
              </template>

              <template #item.agingDays="{ item }">
                <span>{{ formatDashboardCount(item.agingDays) }}</span>
              </template>
            </VDataTable>
          </AnalyticsCard>
        </VCol>
      </VRow>
    </template>
  </div>
</template>

<style lang="scss" scoped>
/** Same header-slot sizing as the sales rankings — see the note there. */
.analytics-product-tabs {
  --v-tabs-height: 34px;

  :deep(.v-tab) {
    min-inline-size: auto;
    padding-inline: 0.625rem;
    font-size: 0.8125rem;
  }
}

/**
 * The aging table shares a row with a 340px chart card. Letting it scroll
 * inside its own card keeps the two level instead of stretching the row to
 * whatever the longest list happens to be.
 */
.analytics-aging-table {
  overflow-x: auto;
}
</style>
