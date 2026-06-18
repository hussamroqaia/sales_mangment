<script setup>
/**
 * WarehouseStockList.vue
 *
 * Main view for the Warehouse Stock Management module.
 *  - Server-side paginated / sorted Vuexy data table (VDataTableServer).
 *  - Filters: "Show Low Stock Only" switch + a productId number search.
 *  - Low-stock rows are highlighted and flagged with a warning badge.
 *  - Row actions: "Receive Stock" (POST) and "Correct Stock" (PUT), both routed
 *    through a single reusable StockAdjustmentModal driven by `mode`.
 *
 * All Axios access lives in the service layer; all state/business logic lives in
 * useWarehouseStock. This view only wires UI events to the composable.
 */

import StockAdjustmentModal from '@/views/apps/warehouse-stock/StockAdjustmentModal.vue'
import {
  useWarehouseStock,
  STOCK_MODES,
  resolveStockVariant,
} from '@/composables/useWarehouseStock'
import { useAuth } from '@/composables/useAuth'
import { fetchProducts } from '@/services/product.service'

// ── Auth — role guard for mutating actions ───────────────────────────────────
const { userData } = useAuth()
const isAdmin = computed(() => userData.value?.role?.toLowerCase() === 'admin')

// ── Composable ────────────────────────────────────────────────────────────────
const {
  stockList,
  totalStock,
  isListLoading,
  listError,
  lowStockOnly,
  productIdFilter,
  page,
  itemsPerPage,
  updateOptions,
  selectedStock,
  isSubmitting,
  snackbar,
  fetchAllStock,
  receiveStock,
  correctStock,
} = useWarehouseStock()

// ── Table Headers ──────────────────────────────────────────────────────────────
const headers = [
  { title: 'Product',     key: 'productName',   sortable: true  },
  { title: 'SKU',         key: 'sku',           sortable: true  },
  { title: 'Quantity',    key: 'quantity',      sortable: true  },
  { title: 'Min Stock',   key: 'minStockLevel', sortable: true  },
  { title: 'Status',      key: 'lowStock',      sortable: true  },
  { title: 'Last Updated', key: 'lastUpdated',  sortable: true  },
  { title: 'Actions',     key: 'actions',       sortable: false, align: 'end' },
]

// ── Modal State ────────────────────────────────────────────────────────────────
const isModalOpen = ref(false)
const modalMode   = ref(STOCK_MODES.RECEIVE)

/** Open the adjustment modal in a given mode for a given row. */
const openModal = (item, mode) => {
  // The row object already carries productId/productName/sku/quantity — pass it
  // straight to the modal as read-only context (no extra fetch required).
  selectedStock.value = { ...item }
  modalMode.value     = mode
  isModalOpen.value   = true
}

const onReceive = item => openModal(item, STOCK_MODES.RECEIVE)
const onCorrect = item => openModal(item, STOCK_MODES.UPDATE)

/** Unified submit from the modal — receive (POST) or correct (PUT) by mode. */
const onSubmit = async ({ productId, quantity, mode }) => {
  const result = mode === STOCK_MODES.RECEIVE
    ? await receiveStock(productId, quantity)
    : await correctStock(productId, quantity)

  if (result.success) isModalOpen.value = false
}

// ── Add New Item Dialog ────────────────────────────────────────────────────────
const isAddDialogOpen    = ref(false)
const addForm            = ref({ productId: null, quantity: null })
const refAddForm         = ref()
const isAddSubmitting    = ref(false)

// Separate product autocomplete state for the Add dialog
const addProductSearch     = ref('')
const addProductItems      = ref([])
const addProductPage       = ref(0)
const addProductTotalPages = ref(1)
const isAddProductLoading  = ref(false)
let   _addPSearchTimer     = null
let   _addPBlockScroll     = false

const loadAddProductPage = async (reset = false) => {
  if (isAddProductLoading.value) return
  if (!reset && addProductPage.value >= addProductTotalPages.value) return

  if (reset) {
    _addPBlockScroll = true
    setTimeout(() => { _addPBlockScroll = false }, 200)
  }

  isAddProductLoading.value = true
  try {
    const pageIndex = reset ? 0 : addProductPage.value
    const data = await fetchProducts({
      page:   pageIndex,
      size:   20,
      search: addProductSearch.value || undefined,
    })

    const incoming = (data?.content ?? []).map(p => ({ title: p.name, value: p.id }))

    if (reset) {
      addProductItems.value = incoming
      addProductPage.value  = 1
    } else {
      addProductItems.value = [...addProductItems.value, ...incoming]
      addProductPage.value  = pageIndex + 1
    }
    addProductTotalPages.value = data?.totalPages ?? 1
  } catch (e) {
    console.warn('[WarehouseStockList] Add-dialog product load failed:', e)
  } finally {
    isAddProductLoading.value = false
  }
}

const onAddProductSearch = val => {
  addProductSearch.value = val ?? ''
  clearTimeout(_addPSearchTimer)
  _addPSearchTimer = setTimeout(() => loadAddProductPage(true), 350)
}

const onAddProductScrollEnd = (isIntersecting) => {
  if (!isIntersecting || _addPBlockScroll) return
  if (addProductPage.value < addProductTotalPages.value) {
    loadAddProductPage(false)
  }
}

const onAddProductMenuUpdate = isOpen => {
  if (isOpen && addProductItems.value.length === 0) loadAddProductPage(true)
}

const openAddDialog = () => {
  addForm.value = { productId: null, quantity: null }
  addProductSearch.value = ''
  addProductItems.value  = []
  addProductPage.value   = 0
  isAddDialogOpen.value  = true
}

const closeAddDialog = () => {
  isAddDialogOpen.value = false
}

const onAddSubmit = async () => {
  const { valid } = await refAddForm.value?.validate()
  if (!valid) return

  isAddSubmitting.value = true
  try {
    const result = await receiveStock(addForm.value.productId, Number(addForm.value.quantity))
    if (result.success) {
      isAddDialogOpen.value = false
    }
  } finally {
    isAddSubmitting.value = false
  }
}

// ── Formatters ──────────────────────────────────────────────────────────────────
const formatDate = value => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

// ── Product autocomplete — server-side search + scroll pagination ───────────
const productSearch     = ref('')
const productItems      = ref([])
const productPage       = ref(0)
const productTotalPages = ref(1)
const isProductLoading  = ref(false)
let   _pSearchTimer     = null
let   _pBlockScroll     = false

const loadProductPage = async (reset = false) => {
  if (isProductLoading.value) return
  if (!reset && productPage.value >= productTotalPages.value) return

  if (reset) {
    _pBlockScroll = true
    setTimeout(() => { _pBlockScroll = false }, 200)
  }

  isProductLoading.value = true
  try {
    const pageIndex = reset ? 0 : productPage.value
    const data = await fetchProducts({
      page:   pageIndex,
      size:   20,
      search: productSearch.value || undefined,
    })

    const incoming = (data?.content ?? []).map(p => ({ title: p.name, value: p.id }))

    if (reset) {
      productItems.value = incoming
      productPage.value  = 1
    } else {
      productItems.value = [...productItems.value, ...incoming]
      productPage.value  = pageIndex + 1
    }
    productTotalPages.value = data?.totalPages ?? 1
  } catch (e) {
    console.warn('[WarehouseStockList] Product load failed:', e)
  } finally {
    isProductLoading.value = false
  }
}

const onProductSearch = val => {
  productSearch.value = val ?? ''
  clearTimeout(_pSearchTimer)
  _pSearchTimer = setTimeout(() => loadProductPage(true), 350)
}

const onProductScrollEnd = (isIntersecting) => {
  if (!isIntersecting || _pBlockScroll) return
  if (productPage.value < productTotalPages.value) {
    loadProductPage(false)
  }
}

const onProductMenuUpdate = isOpen => {
  if (isOpen && productItems.value.length === 0) loadProductPage(true)
}

// ── Fetch on mount ─────────────────────────────────────────────────────────────
onMounted(fetchAllStock)
</script>

<template>
  <section>
    <!-- ── Summary Widget ──────────────────────────────────────────────────── -->
    <VRow class="mb-6">
      <VCol
        cols="12"
        sm="6"
        md="3"
      >
        <VCard>
          <VCardText class="d-flex justify-space-between align-center">
            <div>
              <div class="text-body-2 text-medium-emphasis mb-1">
                Stock Records
              </div>
              <h4 class="text-h4">
                {{ totalStock }}
              </h4>
            </div>
            <VAvatar
              color="primary"
              variant="tonal"
              rounded
              size="44"
            >
              <VIcon
                icon="tabler-building-warehouse"
                size="26"
              />
            </VAvatar>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>

    <!-- ── Main Card ─────────────────────────────────────────────────────────── -->
    <VCard>
      <VCardItem class="pb-2">
        <VCardTitle>Warehouse Stock</VCardTitle>
      </VCardItem>

      <!-- Filters -->
      <VCardText>
        <VRow class="align-center">
          <!-- Product search -->
          <VCol
            cols="12"
            sm="6"
          >
            <VAutocomplete
              v-model="productIdFilter"
              label="Filter by Product"
              placeholder="Search products…"
              :items="productItems"
              item-title="title"
              item-value="value"
              :loading="isProductLoading"
              no-filter
              clearable
              @update:search="onProductSearch"
              @update:menu="onProductMenuUpdate"
              @click:clear="productIdFilter = null"
            >
              <!-- Append sentinel for infinite scroll -->
              <template #append-item>
                <div
                  v-intersect="{
                    handler: onProductScrollEnd,
                    options: { threshold: 0.5 },
                  }"
                  class="pa-2 text-center"
                >
                  <VProgressCircular
                    v-if="isProductLoading"
                    indeterminate
                    size="20"
                    width="2"
                    color="primary"
                  />
                  <span
                    v-else-if="productPage >= productTotalPages"
                    class="text-caption text-disabled"
                  >
                    All products loaded
                  </span>
                </div>
              </template>

              <!-- Empty state -->
              <template #no-data>
                <VListItem>
                  <VListItemTitle class="text-medium-emphasis">
                    {{ isProductLoading ? 'Loading…' : 'No products found' }}
                  </VListItemTitle>
                </VListItem>
              </template>
            </VAutocomplete>
          </VCol>

          <!-- Low stock only toggle -->
          <VCol
            cols="12"
            sm="6"
            class="d-flex align-center"
          >
            <VSwitch
              v-model="lowStockOnly"
              label="Show Low Stock Only"
              color="warning"
            />
          </VCol>
        </VRow>
      </VCardText>

      <VDivider />

      <!-- Toolbar -->
      <VCardText class="d-flex flex-wrap align-center gap-4">
        <!-- Items per page -->
        <AppSelect
          :model-value="itemsPerPage"
          :items="[
            { value: 10, title: '10' },
            { value: 25, title: '25' },
            { value: 50, title: '50' },
          ]"
          style="inline-size: 6.25rem;"
          @update:model-value="itemsPerPage = parseInt($event, 10)"
        />

        <VSpacer />

        <!-- Add New Item -->
        <VBtn
          v-if="isAdmin"
          color="primary"
          prepend-icon="tabler-plus"
          @click="openAddDialog"
        >
          Add New Item
        </VBtn>

        <!-- Manual refresh -->
        <VBtn
          variant="tonal"
          color="secondary"
          prepend-icon="tabler-refresh"
          :loading="isListLoading"
          @click="fetchAllStock"
        >
          Refresh
        </VBtn>
      </VCardText>

      <VDivider />

      <!-- Error state -->
      <VAlert
        v-if="listError"
        type="error"
        variant="tonal"
        class="ma-4"
        closable
      >
        {{ listError }}
      </VAlert>

      <!--
        VDataTableServer — server-side pagination + sorting.
        @update:options forwards sort changes to the composable.
        We disable the built-in footer and render our own TablePagination.
      -->
      <VDataTableServer
        :headers="headers"
        :items="stockList"
        :items-length="totalStock"
        :loading="isListLoading"
        :page="page"
        :items-per-page="itemsPerPage"
        item-value="id"
        class="text-no-wrap"
        hide-default-footer
        @update:options="updateOptions"
      >
        <!-- Loading -->
        <template #loading>
          <VSkeletonLoader type="table-row@8" />
        </template>

        <!-- Empty -->
        <template #no-data>
          <div class="d-flex flex-column align-center justify-center py-10 gap-3">
            <VIcon
              icon="tabler-package-off"
              size="48"
              color="secondary"
            />
            <p class="text-body-1 text-medium-emphasis mb-0">
              <template v-if="lowStockOnly || productIdFilter">
                No stock records match your filters.
              </template>
              <template v-else>
                No warehouse stock records found.
              </template>
            </p>
          </div>
        </template>

        <!-- Product column -->
        <template #item.productName="{ item }">
          <div class="d-flex align-center gap-x-3">
            <VAvatar
              size="36"
              :color="item.lowStock ? 'warning' : 'primary'"
              variant="tonal"
            >
              <VIcon
                icon="tabler-box"
                size="18"
              />
            </VAvatar>
            <div class="d-flex flex-column">
              <span class="text-body-1 font-weight-medium text-high-emphasis">
                {{ item.productName || '—' }}
              </span>
              <span class="text-caption text-medium-emphasis">
                Product #{{ item.productId }}
              </span>
            </div>
          </div>
        </template>

        <!-- SKU column -->
        <template #item.sku="{ item }">
          <span class="text-body-2 font-weight-medium">{{ item.sku || '—' }}</span>
        </template>

        <!-- Quantity column -->
        <template #item.quantity="{ item }">
          <span
            class="text-body-1 font-weight-medium"
            :class="item.lowStock ? 'text-warning' : 'text-high-emphasis'"
          >
            {{ item.quantity ?? '—' }}
          </span>
        </template>

        <!-- Min Stock column -->
        <template #item.minStockLevel="{ item }">
          <span class="text-body-2 text-medium-emphasis">{{ item.minStockLevel ?? '—' }}</span>
        </template>

        <!-- Status (low stock) column -->
        <template #item.lowStock="{ item }">
          <VChip
            :color="resolveStockVariant(item.lowStock)"
            size="small"
            label
          >
            <VIcon
              :icon="item.lowStock ? 'tabler-alert-triangle' : 'tabler-circle-check'"
              size="14"
              start
            />
            {{ item.lowStock ? 'Low Stock' : 'In Stock' }}
          </VChip>
        </template>

        <!-- Last Updated column -->
        <template #item.lastUpdated="{ item }">
          <span class="text-body-2 text-medium-emphasis">{{ formatDate(item.lastUpdated) }}</span>
        </template>

        <!-- Actions column -->
        <template #item.actions="{ item }">
          <div class="d-flex justify-end gap-1">
            <template v-if="isAdmin">
              <!-- Receive Stock -->
              <VTooltip text="Receive Stock">
                <template #activator="{ props: tp }">
                  <IconBtn
                    v-bind="tp"
                    color="success"
                    @click="onReceive(item)"
                  >
                    <VIcon icon="tabler-truck-delivery" />
                  </IconBtn>
                </template>
              </VTooltip>

              <!-- Correct Stock -->
              <VTooltip text="Correct Stock">
                <template #activator="{ props: tp }">
                  <IconBtn
                    v-bind="tp"
                    color="primary"
                    @click="onCorrect(item)"
                  >
                    <VIcon icon="tabler-adjustments" />
                  </IconBtn>
                </template>
              </VTooltip>
            </template>

            <!-- Non-admin: read-only indicator -->
            <VChip
              v-else
              size="small"
              color="secondary"
              variant="tonal"
              label
            >
              View only
            </VChip>
          </div>
        </template>

        <!-- Pagination footer -->
        <template #bottom>
          <TablePagination
            v-model:page="page"
            :items-per-page="itemsPerPage"
            :total-items="totalStock"
          />
        </template>
      </VDataTableServer>
    </VCard>

    <!-- ── Stock Adjustment Modal (Receive / Correct) ──────────────────────── -->
    <StockAdjustmentModal
      v-model:is-dialog-open="isModalOpen"
      :mode="modalMode"
      :stock="selectedStock"
      :is-submitting="isSubmitting"
      @submit="onSubmit"
    />

    <!-- ── Add New Item Dialog ──────────────────────────────────────────────── -->
    <VDialog
      v-model="isAddDialogOpen"
      max-width="480"
      persistent
    >
      <VCard>
        <VCardItem class="pb-2">
          <template #prepend>
            <VAvatar
              color="primary"
              variant="tonal"
              rounded
              size="40"
            >
              <VIcon
                icon="tabler-plus"
                size="22"
              />
            </VAvatar>
          </template>
          <VCardTitle>Add New Item to Warehouse</VCardTitle>
        </VCardItem>

        <VDivider />

        <VCardText>
          <VForm
            ref="refAddForm"
            @submit.prevent="onAddSubmit"
          >
            <VRow>
              <!-- Product Autocomplete -->
              <VCol cols="12">
                <VAutocomplete
                  v-model="addForm.productId"
                  :rules="[v => !!v || 'Product is required']"
                  label="Product"
                  placeholder="Search products…"
                  :items="addProductItems"
                  item-title="title"
                  item-value="value"
                  :loading="isAddProductLoading"
                  :disabled="isAddSubmitting"
                  no-filter
                  clearable
                  @update:search="onAddProductSearch"
                  @update:menu="onAddProductMenuUpdate"
                >
                  <!-- Sentinel for infinite scroll -->
                  <template #append-item>
                    <div
                      v-intersect="{
                        handler: onAddProductScrollEnd,
                        options: { threshold: 0.5 },
                      }"
                      class="pa-2 text-center"
                    >
                      <VProgressCircular
                        v-if="isAddProductLoading"
                        indeterminate
                        size="20"
                        width="2"
                        color="primary"
                      />
                      <span
                        v-else-if="addProductPage >= addProductTotalPages"
                        class="text-caption text-disabled"
                      >
                        All products loaded
                      </span>
                    </div>
                  </template>

                  <!-- Empty state -->
                  <template #no-data>
                    <VListItem>
                      <VListItemTitle class="text-medium-emphasis">
                        {{ isAddProductLoading ? 'Loading…' : 'No products found' }}
                      </VListItemTitle>
                    </VListItem>
                  </template>
                </VAutocomplete>
              </VCol>

              <!-- Quantity -->
              <VCol cols="12">
                <AppTextField
                  v-model="addForm.quantity"
                  label="Quantity to Receive"
                  :rules="[
                    v => (v !== null && v !== undefined && v !== '') || 'Quantity is required',
                    v => Number.isInteger(Number(v)) || 'Must be a whole number',
                    v => Number(v) >= 1 || 'Enter a value of 1 or greater',
                  ]"
                  hint="This amount will be added to the warehouse stock."
                  persistent-hint
                  type="number"
                  min="1"
                  step="1"
                  placeholder="0"
                  :disabled="isAddSubmitting"
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>

        <VCardActions class="pa-4 pt-0 gap-2 justify-end">
          <VBtn
            variant="tonal"
            color="secondary"
            :disabled="isAddSubmitting"
            @click="closeAddDialog"
          >
            Cancel
          </VBtn>
          <VBtn
            color="primary"
            :loading="isAddSubmitting"
            :disabled="isAddSubmitting"
            @click="onAddSubmit"
          >
            <VIcon
              icon="tabler-plus"
              start
            />
            Add to Warehouse
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- ── Global Snackbar ─────────────────────────────────────────────────── -->
    <VSnackbar
      v-model="snackbar.show"
      :color="snackbar.color"
      :timeout="3500"
      location="bottom end"
    >
      <VIcon
        :icon="snackbar.color === 'success' ? 'tabler-circle-check' : 'tabler-alert-circle'"
        class="me-2"
      />
      {{ snackbar.message }}
    </VSnackbar>
  </section>
</template>

<style scoped>
/* Subtle highlight for low-stock rows */
:deep(.v-data-table__tr--low-stock) {
  background-color: rgba(var(--v-theme-warning), 0.08);
}
</style>
