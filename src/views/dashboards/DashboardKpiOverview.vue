<script setup>
/**
 * DashboardKpiOverview.vue
 *
 * Real backend KPIs for the management dashboards.
 *
 *   GET /api/reports/dashboard/sales      → ADMIN, SALES_MANAGER
 *   GET /api/reports/dashboard/inventory  → ADMIN, WAREHOUSE_MANAGER
 *
 * Sections render per role, and the composable refuses to request an endpoint
 * the role cannot access — so a SALES_MANAGER never calls the inventory
 * endpoint, a WAREHOUSE_MANAGER never calls the sales endpoint, and a
 * SALES_REP renders nothing and issues no request at all. The two sections
 * also fail independently: a 500 on one leaves the other on screen.
 *
 * ─── What is drawn as a chart, and what is not ───────────────────────────────
 * Both endpoints return scalars, not series. Only one figure is genuinely a
 * proportion of a whole — `monthFillRatePercent` — and it is the only chart on
 * the page, a 0–100 radial gauge. Everything else stays a number, because:
 *
 *   • `todaySalesTotal` … `activeRoutesToday` are independent counters. A bar
 *     chart of five unrelated units (money, invoices, routes) compares nothing.
 *   • `topTerritoryName` / `topRepName` are a single winner each, not a
 *     ranking. A one-bar chart is a number wearing a costume; the reports
 *     module (/reports/territories/sales, /reports/sales/rep-performance) is
 *     where the full ranking lives.
 *   • `monthOverMonthPercent` is one delta with no history behind it. It gets
 *     an arrow and a semantic colour instead of a trend line — no endpoint in
 *     the API returns sales grouped by date, so drawing a line would mean
 *     inventing the points between the two ends.
 *   • `belowMinimumCount` / `agingCount` / `totalSkus` are NOT a donut. The
 *     slice arithmetic a donut needs (`other = totalSkus - belowMinimum -
 *     aging`) is only valid if an SKU can never be short-stocked and stale at
 *     the same time, and nothing in the DTO or the OpenAPI schema guarantees
 *     that — both are plain int64 counts with no stated exclusivity. A wrong
 *     pie is worse than an honest pair of counters.
 */

import DashboardStatCard from '@/views/dashboards/DashboardStatCard.vue'
import {
  useDashboard,
  clampDashboardPercent,
  dashboardDeltaState,
  formatDashboardAmount,
  formatDashboardChangeMagnitude,
  formatDashboardCount,
  formatDashboardName,
  formatDashboardPercent,
} from '@/composables/useDashboard'

const {
  canViewSalesDashboard,
  canViewInventoryDashboard,
  hasAnyDashboard,
  salesDashboard,
  isSalesLoading,
  salesError,
  loadSalesDashboard,
  inventoryDashboard,
  isInventoryLoading,
  inventoryError,
  loadInventoryDashboard,
  isLoading,
  loadDashboards,
} = useDashboard()

// ── Sales counters ────────────────────────────────────────────────────────────
// STATIC_UI_CONFIGURATION: titles/icons only. `value` reads the live DTO field.
const salesTiles = computed(() => {
  const d = salesDashboard.value

  return [
    { title: 'مبيعات اليوم',    icon: 'tabler-currency-dollar', value: formatDashboardAmount(d?.todaySalesTotal) },
    { title: 'فواتير اليوم',    icon: 'tabler-file-invoice',    value: formatDashboardCount(d?.todayInvoiceCount) },
    { title: 'مبيعات الشهر',    icon: 'tabler-chart-line',      value: formatDashboardAmount(d?.monthSalesTotal) },
    { title: 'فواتير الشهر',    icon: 'tabler-files',           value: formatDashboardCount(d?.monthInvoiceCount) },
    { title: 'المسارات النشطة', icon: 'tabler-route',           value: formatDashboardCount(d?.activeRoutesToday) },
  ]
})

// ── Sales highlights ──────────────────────────────────────────────────────────
// A name paired with the figure that earned it. Separated from the counters
// because the primary value is a name, and a null name is a real state — the
// period produced no sales to rank at all.
const salesHighlightTiles = computed(() => {
  const d = salesDashboard.value

  return [
    {
      key: 'topTerritory',
      title: 'أعلى منطقة مبيعًا',
      icon: 'tabler-map-pin-star',
      value: formatDashboardName(d?.topTerritoryName),
      caption: `إجمالي المبيعات: ${formatDashboardAmount(d?.topTerritorySales)}`,
    },
    {
      key: 'topRep',
      title: 'أعلى مندوب مبيعًا',
      icon: 'tabler-user-star',
      value: formatDashboardName(d?.topRepName),
      caption: `إجمالي المبيعات: ${formatDashboardAmount(d?.topRepSales)}`,
    },
  ]
})

// STATIC_UI_CONFIGURATION: colour, arrow and wording per direction of change.
// Vertical arrows rather than the diagonal `tabler-trending-*` pair: a diagonal
// line reads as a time axis, and this tile has no time axis behind it.
const DELTA_VISUALS = {
  up: { color: 'success', valueIcon: 'tabler-arrow-up', caption: 'ارتفاع عن الشهر السابق' },
  down: { color: 'error', valueIcon: 'tabler-arrow-down', caption: 'انخفاض عن الشهر السابق' },
  neutral: { color: 'secondary', valueIcon: 'tabler-minus', caption: 'لا تغيّر عن الشهر السابق' },
}

/**
 * Month-over-month change as a signed state rather than a signed number.
 *
 * A missing figure lands on the same neutral colour as a genuine 0 %, so the
 * wording has to separate them: 0 % means the two months matched, null means
 * there is nothing to compare against.
 */
const monthOverMonth = computed(() => {
  const raw = salesDashboard.value?.monthOverMonthPercent
  const hasValue = raw !== null && raw !== undefined && !Number.isNaN(Number(raw))
  const visuals = DELTA_VISUALS[dashboardDeltaState(raw)]

  return {
    value: formatDashboardChangeMagnitude(raw),
    color: visuals.color,
    valueIcon: hasValue ? visuals.valueIcon : '',
    caption: hasValue ? visuals.caption : 'لا تتوفر مقارنة بالشهر السابق',
  }
})

// ── Inventory ─────────────────────────────────────────────────────────────────
const inventoryTiles = computed(() => {
  const d = inventoryDashboard.value

  return [
    { title: 'إجمالي الأصناف',     icon: 'tabler-packages',          value: formatDashboardCount(d?.totalSkus) },
    { title: 'قيمة المخزون',       icon: 'tabler-cash',              value: formatDashboardAmount(d?.totalStockValue) },
    { title: 'أقل من الحد الأدنى', icon: 'tabler-alert-triangle',    value: formatDashboardCount(d?.belowMinimumCount) },
    { title: 'مخزون راكد',         icon: 'tabler-clock-exclamation', value: formatDashboardCount(d?.agingCount) },
  ]
})

/**
 * The one figure on this page that is a share of a whole, so the one that gets
 * a chart. `arc` is clamped to what a 0–100 gauge can draw; `label` prints the
 * value the API actually returned, so an out-of-range figure stays visible in
 * the middle of the ring instead of being silently rounded into it.
 */
const fillRate = computed(() => {
  const raw = inventoryDashboard.value?.monthFillRatePercent
  const arc = clampDashboardPercent(raw)

  return {
    arc: arc ?? 0,
    hasValue: arc !== null,
    label: formatDashboardPercent(raw),
  }
})

onMounted(loadDashboards)
</script>

<template>
  <!--
    Renders nothing for roles without dashboard KPIs (e.g. SALES_REP), which
    is also why no request is issued for them.
  -->
  <div v-if="hasAnyDashboard">
    <!-- ── Sales ─────────────────────────────────────────────────────────── -->
    <template v-if="canViewSalesDashboard">
      <div class="d-flex flex-wrap align-center justify-space-between gap-2 mb-4">
        <div>
          <h5 class="text-h5">
            نظرة عامة
          </h5>
          <span class="text-body-2 text-medium-emphasis">
            مؤشرات مباشرة من خدمة التقارير
          </span>
        </div>

        <VBtn
          variant="tonal"
          color="secondary"
          size="small"
          prepend-icon="tabler-refresh"
          :loading="isLoading"
          @click="loadDashboards"
        >
          تحديث
        </VBtn>
      </div>

      <VAlert
        v-if="salesError"
        type="error"
        variant="tonal"
        class="mb-4"
      >
        {{ salesError }}
        <template #append>
          <VBtn
            variant="text"
            size="small"
            :loading="isSalesLoading"
            @click="loadSalesDashboard"
          >
            إعادة المحاولة
          </VBtn>
        </template>
      </VAlert>

      <!--
        Skeletons keep the layout stable instead of flashing placeholder
        numbers — a rendered 0 is indistinguishable from a real "no sales
        today", which this dashboard reports often enough to matter.
      -->
      <template v-if="isSalesLoading && !salesDashboard">
        <VRow class="dashboard-row--fifths">
          <VCol
            v-for="n in 5"
            :key="n"
            cols="12"
            sm="6"
            md="4"
          >
            <VSkeletonLoader type="list-item-two-line" />
          </VCol>
        </VRow>

        <VRow>
          <VCol
            v-for="n in 3"
            :key="n"
            cols="12"
            md="4"
          >
            <VSkeletonLoader type="list-item-two-line" />
          </VCol>
        </VRow>
      </template>

      <template v-else-if="salesDashboard">
        <!-- Five counters: one row on desktop, 3 + 2 on laptops, stacked on phones. -->
        <VRow class="match-height dashboard-row--fifths">
          <VCol
            v-for="tile in salesTiles"
            :key="tile.title"
            cols="12"
            sm="6"
            md="4"
          >
            <DashboardStatCard
              :title="tile.title"
              :value="tile.value"
              :icon="tile.icon"
            />
          </VCol>
        </VRow>

        <!--
          Leaderboard + trend, as a row of three. The trend tile comes from the
          sales DTO, so pairing it with the inventory gauge instead would leave
          a half-empty row for every SALES_MANAGER.
        -->
        <VRow class="match-height">
          <VCol
            v-for="tile in salesHighlightTiles"
            :key="tile.key"
            cols="12"
            md="4"
          >
            <DashboardStatCard
              :title="tile.title"
              :value="tile.value"
              :icon="tile.icon"
              :caption="tile.caption"
            />
          </VCol>

          <VCol
            cols="12"
            md="4"
          >
            <DashboardStatCard
              title="التغيّر عن الشهر السابق"
              :value="monthOverMonth.value"
              icon="tabler-calendar-stats"
              :caption="monthOverMonth.caption"
              :color="monthOverMonth.color"
              :value-icon="monthOverMonth.valueIcon"
              ltr-value
            />
          </VCol>
        </VRow>
      </template>
    </template>

    <!-- ── Inventory ─────────────────────────────────────────────────────── -->
    <template v-if="canViewInventoryDashboard">
      <div
        class="d-flex flex-wrap align-center justify-space-between gap-2 mb-4"
        :class="canViewSalesDashboard ? 'mt-6' : ''"
      >
        <div>
          <h5 class="text-h5">
            المخزون
          </h5>
          <span class="text-body-2 text-medium-emphasis">
            حالة المخزون الحالية
          </span>
        </div>

        <!-- The sales header owns the refresh control whenever it is rendered. -->
        <VBtn
          v-if="!canViewSalesDashboard"
          variant="tonal"
          color="secondary"
          size="small"
          prepend-icon="tabler-refresh"
          :loading="isLoading"
          @click="loadDashboards"
        >
          تحديث
        </VBtn>
      </div>

      <VAlert
        v-if="inventoryError"
        type="error"
        variant="tonal"
        class="mb-4"
      >
        {{ inventoryError }}
        <template #append>
          <VBtn
            variant="text"
            size="small"
            :loading="isInventoryLoading"
            @click="loadInventoryDashboard"
          >
            إعادة المحاولة
          </VBtn>
        </template>
      </VAlert>

      <VRow v-if="isInventoryLoading && !inventoryDashboard">
        <VCol
          cols="12"
          md="5"
          lg="4"
        >
          <VSkeletonLoader type="image" />
        </VCol>

        <VCol
          cols="12"
          md="7"
          lg="8"
        >
          <div class="dashboard-inventory-grid">
            <VSkeletonLoader
              v-for="n in 4"
              :key="n"
              type="list-item-two-line"
            />
          </div>
        </VCol>
      </VRow>

      <VRow
        v-else-if="inventoryDashboard"
        class="match-height"
      >
        <VCol
          cols="12"
          md="5"
          lg="4"
        >
          <VCard class="h-100">
            <VCardItem class="pb-0">
              <VCardTitle>نسبة تلبية الطلبات</VCardTitle>
              <VCardSubtitle>خلال الشهر الحالي</VCardSubtitle>
            </VCardItem>

            <VCardText class="d-flex flex-column align-center justify-center">
              <!--
                Vuetify's radial: an SVG arc that always starts at 12 o'clock
                and grows clockwise, unaffected by the page's RTL direction, so
                it needs no mirroring workaround. The track colour comes from
                the theme's border token and the arc from the theme palette,
                which is what keeps it legible in both themes.
              -->
              <VProgressCircular
                :model-value="fillRate.arc"
                :size="148"
                :width="14"
                color="primary"
              >
                <span
                  class="text-h4 font-weight-medium"
                  dir="ltr"
                >
                  {{ fillRate.label }}
                </span>
              </VProgressCircular>

              <span class="text-body-2 text-medium-emphasis text-center mt-4">
                {{
                  fillRate.hasValue
                    ? 'نسبة الطلبات المُلبّاة بالكامل من طلبات الشهر'
                    : 'لم ترد نسبة تلبية لهذا الشهر'
                }}
              </span>
            </VCardText>
          </VCard>
        </VCol>

        <VCol
          cols="12"
          md="7"
          lg="8"
        >
          <!--
            A grid rather than a nested VRow: the row would only be as tall as
            its two lines of content, leaving the gauge beside it overhanging by
            the difference. Equal-fraction rows inside a full-height grid make
            the four cards divide exactly the height the gauge sets.
          -->
          <div class="dashboard-inventory-grid">
            <DashboardStatCard
              v-for="tile in inventoryTiles"
              :key="tile.title"
              :title="tile.title"
              :value="tile.value"
              :icon="tile.icon"
            />
          </div>
        </VCol>
      </VRow>
    </template>
  </div>
</template>

<style lang="scss" scoped>
/**
 * Five equal counters on one desktop row.
 *
 * Vuetify's 12-column grid has no fifth, so the columns declare `md="4"` — a
 * clean 3 + 2 on laptops — and are widened to a fifth each from `lg` up, where
 * there is room for all five side by side.
 */
@media (min-width: 1280px) {
  .dashboard-row--fifths > .v-col-md-4 {
    flex: 0 0 20%;
    max-inline-size: 20%;
  }
}

/**
 * The four inventory counters beside the fill-rate gauge.
 *
 * `grid-auto-rows: 1fr` over a full-height grid is what keeps the block level
 * with the gauge: the rows split whatever height the gauge card sets, instead
 * of the column ending short of it. The gap matches Vuetify's 24px gutter so
 * the block lines up with every other row on the page. One column below `sm`,
 * where the cards stack.
 */
.dashboard-inventory-grid {
  display: grid;
  gap: 1.5rem;
  block-size: 100%;
  grid-auto-rows: 1fr;
  grid-template-columns: 1fr;
}

@media (min-width: 600px) {
  .dashboard-inventory-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
