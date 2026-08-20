<script setup>
/**
 * DashboardKpiOverview.vue
 *
 * Real backend KPI tiles for the management dashboards.
 *
 *   GET /api/reports/dashboard/sales      → ADMIN, SALES_MANAGER
 *   GET /api/reports/dashboard/inventory  → ADMIN, WAREHOUSE_MANAGER
 *
 * Sections are rendered per role, and the composable refuses to request an
 * endpoint the role cannot access — so a SALES_MANAGER never calls the
 * inventory endpoint, a WAREHOUSE_MANAGER never calls the sales endpoint, and a
 * SALES_REP renders nothing and issues no request at all.
 *
 * Layout reuses the project's existing Vuexy widget pattern (VCard → VCardText →
 * VRow of value/label/VAvatar tiles with inset dividers), so labels, icons, and
 * spacing are static UI configuration while every number is live backend data.
 */

import {
  useDashboard,
  formatDashboardAmount,
  formatDashboardCount,
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

// ── Tile definitions ──────────────────────────────────────────────────────────
// STATIC_UI_CONFIGURATION: titles/icons only. `value` reads the live DTO field.
const salesTiles = computed(() => {
  const d = salesDashboard.value

  return [
    { title: 'مبيعات اليوم',      icon: 'tabler-currency-dollar', value: formatDashboardAmount(d?.todaySalesTotal) },
    { title: 'فواتير اليوم',      icon: 'tabler-file-invoice',    value: formatDashboardCount(d?.todayInvoiceCount) },
    { title: 'مبيعات الشهر',      icon: 'tabler-chart-line',      value: formatDashboardAmount(d?.monthSalesTotal) },
    { title: 'فواتير الشهر',      icon: 'tabler-files',           value: formatDashboardCount(d?.monthInvoiceCount) },
    { title: 'المسارات النشطة',   icon: 'tabler-route',           value: formatDashboardCount(d?.activeRoutesToday) },
  ]
})

const inventoryTiles = computed(() => {
  const d = inventoryDashboard.value

  return [
    { title: 'أقل من الحد الأدنى', icon: 'tabler-alert-triangle',    value: formatDashboardCount(d?.belowMinimumCount) },
    { title: 'مخزون راكد',         icon: 'tabler-clock-exclamation', value: formatDashboardCount(d?.agingCount) },
    { title: 'إجمالي الأصناف',     icon: 'tabler-packages',          value: formatDashboardCount(d?.totalSkus) },
    { title: 'نسبة التلبية للشهر', icon: 'tabler-progress-check',    value: formatDashboardPercent(d?.monthFillRatePercent) },
  ]
})

// ── Value typography ──────────────────────────────────────────────────────────
// The sales row packs five tiles into one 12-column grid, so each gets a sixth
// of the card. A money figure in the millions ("142,435,434.00") is wider than
// that at `text-h4`, and the overflow used to run over the neighbouring tile
// and crush its icon. Long values step down one notch on the Vuexy type scale
// rather than overflowing; `.dashboard-kpi__value` in the style block below
// keeps even an extreme value inside its own column.
const valueClass = value => {
  const { length } = String(value)

  if (length > 12) return 'text-h6'
  if (length > 9) return 'text-h5'

  return 'text-h4'
}

onMounted(loadDashboards)
</script>

<template>
  <!--
    Renders nothing for roles without dashboard KPIs (e.g. SALES_REP), which
    is also why no request is issued for them. 
  -->
  <VCard v-if="hasAnyDashboard">
    <VCardItem class="pb-2">
      <VCardTitle>نظرة عامة</VCardTitle>
      <VCardSubtitle>مؤشرات مباشرة من خدمة التقارير</VCardSubtitle>

      <template #append>
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
      </template>
    </VCardItem>

    <!-- ── Sales ─────────────────────────────────────────────────────────── -->
    <template v-if="canViewSalesDashboard">
      <VCardText>
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

        <!-- Skeletons keep the layout stable instead of flashing placeholder numbers. -->
        <VRow v-if="isSalesLoading && !salesDashboard">
          <VCol
            v-for="n in 5"
            :key="n"
            cols="12"
            sm="6"
            md="4"
            lg="2"
          >
            <VSkeletonLoader type="list-item-two-line" />
          </VCol>
        </VRow>

        <VRow v-else-if="salesDashboard">
          <template
            v-for="(tile, index) in salesTiles"
            :key="tile.title"
          >
            <VCol
              cols="12"
              sm="6"
              md="4"
              lg="2"
            >
              <div class="d-flex justify-space-between align-center dashboard-kpi">
                <div class="d-flex flex-column dashboard-kpi__text">
                  <h4
                    class="dashboard-kpi__value"
                    :class="valueClass(tile.value)"
                  >
                    {{ tile.value }}
                  </h4>
                  <span class="text-body-1">{{ tile.title }}</span>
                </div>

                <VAvatar
                  class="dashboard-kpi__avatar"
                  variant="tonal"
                  rounded
                  size="42"
                >
                  <VIcon
                    :icon="tile.icon"
                    size="26"
                    color="high-emphasis"
                  />
                </VAvatar>
              </div>
            </VCol>

            <VDivider
              v-if="$vuetify.display.lgAndUp && index !== salesTiles.length - 1"
              vertical
              inset
              length="60"
            />
          </template>
        </VRow>
      </VCardText>

      <VDivider v-if="canViewInventoryDashboard" />
    </template>

    <!-- ── Inventory ─────────────────────────────────────────────────────── -->
    <VCardText v-if="canViewInventoryDashboard">
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
          v-for="n in 4"
          :key="n"
          cols="12"
          sm="6"
          md="3"
        >
          <VSkeletonLoader type="list-item-two-line" />
        </VCol>
      </VRow>

      <VRow v-else-if="inventoryDashboard">
        <template
          v-for="(tile, index) in inventoryTiles"
          :key="tile.title"
        >
          <VCol
            cols="12"
            sm="6"
            md="3"
          >
            <div class="d-flex justify-space-between align-center dashboard-kpi">
              <div class="d-flex flex-column dashboard-kpi__text">
                <h4
                  class="dashboard-kpi__value"
                  :class="valueClass(tile.value)"
                >
                  {{ tile.value }}
                </h4>
                <span class="text-body-1">{{ tile.title }}</span>
              </div>

              <VAvatar
                class="dashboard-kpi__avatar"
                variant="tonal"
                rounded
                size="42"
              >
                <VIcon
                  :icon="tile.icon"
                  size="26"
                  color="high-emphasis"
                />
              </VAvatar>
            </div>
          </VCol>

          <VDivider
            v-if="$vuetify.display.mdAndUp && index !== inventoryTiles.length - 1"
            vertical
            inset
            length="60"
          />
        </template>
      </VRow>
    </VCardText>
  </VCard>
</template>

<style lang="scss" scoped>
/**
 * Keeps a tile's number inside its own column.
 *
 * `justify-space-between` alone lets the text block push past the tile: a flex
 * item's default `min-inline-size: auto` refuses to shrink below its content,
 * so a wide figure spilled over the divider and squeezed the neighbouring
 * avatar to nothing. Allowing the text block to shrink and pinning the avatar
 * out of the shrink calculation fixes both halves of that.
 */
.dashboard-kpi {
  gap: 0.5rem;

  &__text {
    min-inline-size: 0;
  }

  &__value {
    overflow-wrap: anywhere;
  }

  &__avatar {
    flex: 0 0 auto;
  }
}
</style>
