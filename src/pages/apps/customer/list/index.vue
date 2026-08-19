<script setup>
/**
 * Customer List Page
 *
 * Route name: apps-customer-list  →  /apps/customer/list
 *
 * Access rules:
 *   - ADMIN / SALES_MANAGER / WAREHOUSE_MANAGER can VIEW
 *     (action: 'read', subject: 'Management' — SALES_REP is excluded; its
 *      workflows live in the mobile client)
 *   - Only ADMIN can CREATE / EDIT / DELETE (checked via useAuth userData.role)
 *   - Only ADMIN can change status
 */

definePage({
  meta: {
    action: 'read',
    subject: 'Management',
  },
})

import { useAuth } from '@/composables/useAuth'
import {
  CUSTOMER_STATUSES,
  resolveCategoryVariant,
  resolveStatusVariant,
  useCustomers
} from '@/composables/useCustomers'
import { fetchCustomerById } from '@/services/customer.service'
import { fetchTerritories } from '@/services/territory.service'
import CustomerFormDrawer from '@/views/apps/customer/CustomerFormDrawer.vue'
import { LMap, LMarker, LTileLayer } from '@vue-leaflet/vue-leaflet'
import 'leaflet/dist/leaflet.css'
import { INTL_LOCALE } from '@/utils/locale'

// ── Auth ───────────────────────────────────────────────────────────────────────
const { userData } = useAuth()
const isAdmin = computed(() => userData.value?.role?.toLowerCase() === 'admin')

// ── Composable ─────────────────────────────────────────────────────────────────
const {
  customers,
  totalCustomers,
  isListLoading,
  listError,
  searchQuery,
  selectedStatus,
  selectedTerritory,
  page,
  itemsPerPage,
  updateOptions,
  editingCustomer,
  isDetailLoading,
  isSubmitting,
  snackbar,
  fetchAllCustomers,
  fetchCustomer,
  createCustomer,
  updateCustomer,
  changeCustomerStatus,
  deleteCustomer,
  clearEditing,
} = useCustomers()

// ── Table Headers ──────────────────────────────────────────────────────────────
const headers = [
  { title: 'العميل',  key: 'name',        sortable: true  },
  { title: 'الفئة',  key: 'category',    sortable: true  },
  { title: 'المنطقة', key: 'territoryName', sortable: false },
  { title: 'رقم الهاتف',     key: 'phone',       sortable: false },
  { title: 'الحالة',    key: 'status',      sortable: true  },
  { title: 'الإجراءات',   key: 'actions',     sortable: false, align: 'end' },
]

// ── Territory filter autocomplete — server-side search + scroll pagination ───────────
const filterTerritorySearch     = ref('')
const filterTerritoryItems      = ref([])   // accumulated loaded options
const filterTerritoryPage       = ref(0)    // 0-based API page
const filterTerritoryTotalPages = ref(1)
const isFilterTerritoryLoading  = ref(false)
let   _filterTSearchTimer       = null
let   _filterBlockScroll        = false   // suppresses sentinel's auto-fire after reset

/** Load one page of territories for the filter dropdown (appends on scroll) */
const loadFilterTerritoryPage = async (reset = false) => {
  if (isFilterTerritoryLoading.value) return
  if (!reset && filterTerritoryPage.value >= filterTerritoryTotalPages.value) return

  // On reset, suppress the sentinel's immediate intersect event so only
  // intentional scrolling triggers the next page
  if (reset) {
    _filterBlockScroll = true
    setTimeout(() => { _filterBlockScroll = false }, 200)
  }

  isFilterTerritoryLoading.value = true
  try {
    const pageIndex = reset ? 0 : filterTerritoryPage.value
    const data = await fetchTerritories({
      page:   pageIndex,
      size:   20,
      search: filterTerritorySearch.value || undefined,
    })

    const incoming = (data?.content ?? []).map(t => ({ title: t.name, value: t.id }))

    if (reset) {
      filterTerritoryItems.value = incoming
      filterTerritoryPage.value  = 1
    } else {
      filterTerritoryItems.value = [...filterTerritoryItems.value, ...incoming]
      filterTerritoryPage.value  = pageIndex + 1
    }
    filterTerritoryTotalPages.value = data?.totalPages ?? 1
  } catch (e) {
    console.warn('[CustomerList] Territory filter load failed:', e)
  } finally {
    isFilterTerritoryLoading.value = false
  }
}

/** Debounced search handler for the filter autocomplete */
const onFilterTerritorySearch = val => {
  filterTerritorySearch.value = val ?? ''
  clearTimeout(_filterTSearchTimer)
  _filterTSearchTimer = setTimeout(() => loadFilterTerritoryPage(true), 350)
}

/**
 * Load next page when sentinel scrolls into view.
 * `isIntersecting` is the first arg Vuetify passes to v-intersect handlers.
 * Skip while _filterBlockScroll is active (right after a reset) to avoid
 * immediately auto-loading page 2.
 */
const onFilterTerritoryScrollEnd = (isIntersecting) => {
  if (!isIntersecting || _filterBlockScroll) return
  if (filterTerritoryPage.value < filterTerritoryTotalPages.value) {
    loadFilterTerritoryPage(false)
  }
}

/** Fetch first page the first time the user opens the dropdown */
const onFilterTerritoryMenuUpdate = isOpen => {
  if (isOpen && filterTerritoryItems.value.length === 0) loadFilterTerritoryPage(true)
}



// ── Drawer State ───────────────────────────────────────────────────────────────
const isDrawerOpen = ref(false)

// ── Customer Detail Dialog State ───────────────────────────────────────────────
const isDetailDialogOpen = ref(false)
const viewingCustomer    = ref(null)
const isViewLoading      = ref(false)

const openView = async customer => {
  viewingCustomer.value    = null
  isDetailDialogOpen.value = true
  isViewLoading.value      = true
  try {
    viewingCustomer.value = await fetchCustomerById(customer.id)
  } catch (e) {
    console.error('[CustomerList] View failed:', e)
    isDetailDialogOpen.value = false
  } finally {
    isViewLoading.value = false
  }
}

// ── Delete Confirmation Dialog State ──────────────────────────────────────────
const isDeleteDialogOpen = ref(false)
const customerToDelete   = ref(null)

// ── Handlers ───────────────────────────────────────────────────────────────────

const openCreate = () => {
  clearEditing()
  isDrawerOpen.value = true
}

const openEdit = async customer => {
  isDrawerOpen.value = true
  await fetchCustomer(customer.id)
}

const onSubmit = async ({ id, ...payload }) => {
  const result = id
    ? await updateCustomer(id, payload)
    : await createCustomer(payload)

  if (result.success) {
    isDrawerOpen.value = false
    clearEditing()
  }
}

const onDrawerClose = () => {
  isDrawerOpen.value = false
  clearEditing()
}

const onDelete = customer => {
  customerToDelete.value   = customer
  isDeleteDialogOpen.value = true
}

const onConfirmDelete = async () => {
  if (!customerToDelete.value) return
  isDeleteDialogOpen.value = false
  await deleteCustomer(customerToDelete.value.id)
  customerToDelete.value = null
}

const onCancelDelete = () => {
  isDeleteDialogOpen.value = false
  customerToDelete.value   = null
}

const onChangeStatus = async (customer, newStatus) => {
  await changeCustomerStatus(customer.id, newStatus)
}

// ── Date helper ────────────────────────────────────────────────────────────────
const formatDate = dateStr => {
  if (!dateStr) return '—'

  return new Date(dateStr).toLocaleDateString(INTL_LOCALE, {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

// ── Detail map layer toggle ───────────────────────────────────────────────
const detailMapLayer = ref('street')   // 'satellite' | 'street'
const detailTileUrl  = computed(() =>
  detailMapLayer.value === 'satellite'
    ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
)

// ── Init ────────────────────────────────────────────────────────────────────────────
onMounted(async () => {
  // Fix Leaflet default marker icon paths broken by Vite's asset processing.
  // Same fix used in CustomerFormDrawer.
  const L = (await import('leaflet')).default

  delete L.Icon.Default.prototype._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
    iconUrl:       new URL('leaflet/dist/images/marker-icon.png',    import.meta.url).href,
    shadowUrl:     new URL('leaflet/dist/images/marker-shadow.png',  import.meta.url).href,
  })

  await fetchAllCustomers()
})
</script>

<template>
  <section>
    <!-- ── Summary Widget ────────────────────────────────────────────────── -->
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
                إجمالي العملاء
              </div>
              <h4 class="text-h4">
                {{ totalCustomers }}
              </h4>
            </div>
            <VAvatar
              color="primary"
              variant="tonal"
              rounded
              size="44"
            >
              <VIcon
                icon="tabler-users-group"
                size="26"
              />
            </VAvatar>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>

    <!-- ── Main Card ─────────────────────────────────────────────────────── -->
    <VCard>
      <VCardItem class="pb-2">
        <VCardTitle>إدارة العملاء</VCardTitle>
      </VCardItem>

      <!-- Filters -->
      <VCardText>
        <VRow>
          <!-- Territory filter -->
          <VCol
            cols="12"
            sm="4"
          >
            <!--
              VAutocomplete with server-side search + scroll-to-load-more.
              Mirrors the same pattern used in CustomerFormDrawer.
            -->
            <VAutocomplete
              v-model="selectedTerritory"
              placeholder="تصفية حسب المنطقة"
              :items="filterTerritoryItems"
              item-title="title"
              item-value="value"
              :loading="isFilterTerritoryLoading"
              no-filter
              clearable
              clear-icon="tabler-x"
              @update:search="onFilterTerritorySearch"
              @update:menu="onFilterTerritoryMenuUpdate"
            >
              <!-- Sentinel for infinite scroll -->
              <template #append-item>
                <div
                  v-intersect="{
                    handler: onFilterTerritoryScrollEnd,
                    options: { threshold: 0.5 },
                  }"
                  class="pa-2 text-center"
                >
                  <VProgressCircular
                    v-if="isFilterTerritoryLoading"
                    indeterminate
                    size="20"
                    width="2"
                    color="primary"
                  />
                  <span
                    v-else-if="filterTerritoryPage >= filterTerritoryTotalPages"
                    class="text-caption text-disabled"
                  >
                    تم تحميل كل المناطق
                  </span>
                </div>
              </template>

              <!-- Empty state -->
              <template #no-data>
                <VListItem>
                  <VListItemTitle class="text-medium-emphasis">
                    {{ isFilterTerritoryLoading ? 'Loading…' : 'لا توجد مناطق' }}
                  </VListItemTitle>
                </VListItem>
              </template>
            </VAutocomplete>
          </VCol>

          <!-- Status filter -->
          <VCol
            cols="12"
            sm="4"
          >
            <AppSelect
              v-model="selectedStatus"
              placeholder="تصفية حسب الحالة"
              :items="CUSTOMER_STATUSES"
              item-title="title"
              item-value="value"
              clearable
              clear-icon="tabler-x"
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

        <!-- Search -->
        <div style="inline-size: 15.625rem;">
          <AppTextField
            v-model="searchQuery"
            placeholder="ابحث عن عميل…"
            prepend-inner-icon="tabler-search"
            clearable
          />
        </div>

        <!-- Add Customer — Admin only -->
        <VBtn
          v-if="isAdmin"
          prepend-icon="tabler-plus"
          @click="openCreate"
        >
          إضافة عميل
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

      <!-- Data Table -->
      <VDataTableServer
        :headers="headers"
        :items="customers"
        :items-length="totalCustomers"
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
              icon="tabler-users-group"
              size="48"
              color="secondary"
            />
            <p class="text-body-1 text-medium-emphasis mb-0">
              لا يوجد عملاء.
              <span v-if="!searchQuery && !selectedStatus && !selectedTerritory && isAdmin">
                أنشئ أول عميل للبدء.
              </span>
            </p>
            <VBtn
              v-if="!searchQuery && !selectedStatus && !selectedTerritory && isAdmin"
              prepend-icon="tabler-plus"
              size="small"
              @click="openCreate"
            >
              إضافة عميل
            </VBtn>
          </div>
        </template>

        <!-- Customer (name) column -->
        <template #item.name="{ item }">
          <div class="d-flex align-center gap-x-3">
            <VAvatar
              size="36"
              :color="resolveCategoryVariant(item.category).color"
              variant="tonal"
            >
              <VIcon
                :icon="resolveCategoryVariant(item.category).icon"
                size="18"
              />
            </VAvatar>
            <div class="d-flex flex-column">
              <span class="text-body-1 font-weight-medium text-high-emphasis">
                {{ item.name }}
              </span>
              <span
                v-if="item.address"
                class="text-sm text-medium-emphasis"
              >{{ item.address }}</span>
            </div>
          </div>
        </template>

        <!-- Category column -->
        <template #item.category="{ item }">
          <div class="d-flex align-center gap-x-2">
            <VIcon
              :icon="resolveCategoryVariant(item.category).icon"
              :color="resolveCategoryVariant(item.category).color"
              size="20"
            />
            <span class="text-body-2 text-capitalize">
              {{ item.category?.toLowerCase() ?? '—' }}
            </span>
          </div>
        </template>

        <!-- Territory column -->
        <template #item.territoryName="{ item }">
          <VChip
            v-if="item.territoryName"
            size="small"
            color="info"
            variant="tonal"
            label
          >
            <VIcon
              start
              icon="tabler-map-pin"
              size="12"
            />
            {{ item.territoryName }}
          </VChip>
          <span
            v-else
            class="text-medium-emphasis"
          >—</span>
        </template>

        <!-- Phone column -->
        <template #item.phone="{ item }">
          <span class="text-body-2">{{ item.phone || '—' }}</span>
        </template>

        <!-- Status column -->
        <template #item.status="{ item }">
          <VChip
            :color="resolveStatusVariant(item.status)"
            size="small"
            label
            class="text-capitalize"
          >
            {{ item.status?.toLowerCase() ?? '—' }}
          </VChip>
        </template>

        <!-- Actions column -->
        <template #item.actions="{ item }">
          <div class="d-flex justify-end gap-1">
            <!-- View details — all roles -->
            <VTooltip text="عرض التفاصيل">
              <template #activator="{ props: tp }">
                <IconBtn
                  v-bind="tp"
                  @click="openView(item)"
                >
                  <VIcon icon="tabler-eye" />
                </IconBtn>
              </template>
            </VTooltip>

            <!-- Edit — Admin only -->
            <VTooltip
              v-if="isAdmin"
              text="تعديل العميل"
            >
              <template #activator="{ props: tp }">
                <IconBtn
                  v-bind="tp"
                  :loading="isDetailLoading"
                  @click="openEdit(item)"
                >
                  <VIcon icon="tabler-edit" />
                </IconBtn>
              </template>
            </VTooltip>

            <!-- Status toggle dropdown -->
            <VBtn
              v-if="isAdmin"
              icon
              variant="text"
              color="medium-emphasis"
              size="small"
            >
              <VIcon icon="tabler-dots-vertical" />
              <VMenu activator="parent">
                <VList density="compact">
                  <!-- Toggle status options -->
                  <VListItem
                    v-for="s in CUSTOMER_STATUSES.filter(st => st.value !== item.status)"
                    :key="s.value"
                    @click="onChangeStatus(item, s.value)"
                  >
                    <template #prepend>
                      <VIcon
                        :icon="s.value === 'ACTIVE' ? 'tabler-user-check' : 'tabler-user-off'"
                        :color="resolveStatusVariant(s.value)"
                        size="16"
                      />
                    </template>
                    <VListItemTitle>Set {{ s.title }}</VListItemTitle>
                  </VListItem>

                  <template v-if="isAdmin">
                    <VDivider class="my-1" />
                    <!-- Delete — Admin only -->
                    <VListItem @click="onDelete(item)">
                      <template #prepend>
                        <VIcon
                          icon="tabler-trash"
                          color="error"
                          size="16"
                        />
                      </template>
                      <VListItemTitle class="text-error">
                        حذف
                      </VListItemTitle>
                    </VListItem>
                  </template>
                </VList>
              </VMenu>
            </VBtn>

            <!-- View only chip for non-admins -->
            <VChip
              v-if="!isAdmin"
              size="small"
              color="secondary"
              variant="tonal"
              label
            >
              عرض فقط
            </VChip>
          </div>
        </template>

        <!-- Pagination footer -->
        <template #bottom>
          <TablePagination
            v-model:page="page"
            :items-per-page="itemsPerPage"
            :total-items="totalCustomers"
          />
        </template>
      </VDataTableServer>
    </VCard>

    <!-- ── Customer Form Drawer ──────────────────────────────────────────── -->
    <CustomerFormDrawer
      v-model:is-drawer-open="isDrawerOpen"
      :customer="editingCustomer"
      :is-submitting="isSubmitting"
      @submit="onSubmit"
      @update:is-drawer-open="val => { if (!val) onDrawerClose() }"
    />

    <!-- ── Customer Detail Dialog ──────────────────────────────────────── -->
    <VDialog
      v-model="isDetailDialogOpen"
      max-width="560"
      scrollable
    >
      <VCard>
        <!-- Header -->
        <VCardTitle class="d-flex align-center gap-2 pa-4">
          <VAvatar
            v-if="viewingCustomer"
            size="36"
            :color="resolveCategoryVariant(viewingCustomer.category).color"
            variant="tonal"
          >
            <VIcon
              :icon="resolveCategoryVariant(viewingCustomer.category).icon"
              size="18"
            />
          </VAvatar>
          <span>تفاصيل العميل</span>
          <VSpacer />
          <IconBtn @click="isDetailDialogOpen = false">
            <VIcon icon="tabler-x" />
          </IconBtn>
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-4">
          <!-- Loading -->
          <div
            v-if="isViewLoading"
            class="d-flex justify-center align-center py-8"
          >
            <VProgressCircular
              indeterminate
              color="primary"
            />
          </div>

          <!-- Content -->
          <VRow
            v-else-if="viewingCustomer"
            dense
          >
            <!-- Name -->
            <VCol cols="12">
              <p class="text-caption text-medium-emphasis mb-1">
                اسم العميل
              </p>
              <p class="text-body-1 font-weight-medium mb-0">
                {{ viewingCustomer.name }}
              </p>
            </VCol>

            <VCol cols="12">
              <VDivider />
            </VCol>

            <!-- Status / Category -->
            <VCol
              cols="6"
              sm="6"
            >
              <p class="text-caption text-medium-emphasis mb-1">
                الحالة
              </p>
              <VChip
                :color="resolveStatusVariant(viewingCustomer.status)"
                size="small"
                label
                class="text-capitalize"
              >
                {{ viewingCustomer.status?.toLowerCase() }}
              </VChip>
            </VCol>

            <VCol
              cols="6"
              sm="6"
            >
              <p class="text-caption text-medium-emphasis mb-1">
                الفئة
              </p>
              <div class="d-flex align-center gap-1">
                <VIcon
                  :icon="resolveCategoryVariant(viewingCustomer.category).icon"
                  :color="resolveCategoryVariant(viewingCustomer.category).color"
                  size="18"
                />
                <span class="text-body-2 text-capitalize">
                  {{ viewingCustomer.category?.toLowerCase() }}
                </span>
              </div>
            </VCol>

            <VCol cols="12">
              <VDivider />
            </VCol>

            <!-- Territory -->
            <VCol
              cols="6"
              sm="6"
            >
              <p class="text-caption text-medium-emphasis mb-1">
                المنطقة
              </p>
              <VChip
                v-if="viewingCustomer.territoryName"
                size="small"
                color="info"
                variant="tonal"
                label
              >
                <VIcon
                  start
                  icon="tabler-map-pin"
                  size="12"
                />
                {{ viewingCustomer.territoryName }}
              </VChip>
              <span
                v-else
                class="text-medium-emphasis"
              >—</span>
            </VCol>

            <!-- Phone -->
            <VCol
              cols="6"
              sm="6"
            >
              <p class="text-caption text-medium-emphasis mb-1">
                رقم الهاتف
              </p>
              <p class="text-body-2 mb-0">
                {{ viewingCustomer.phone || '—' }}
              </p>
            </VCol>

            <VCol cols="12">
              <VDivider />
            </VCol>

            <!-- Address -->
            <VCol cols="12">
              <p class="text-caption text-medium-emphasis mb-1">
                العنوان
              </p>
              <p class="text-body-2 mb-0">
                {{ viewingCustomer.address || '—' }}
              </p>
            </VCol>

            <!-- Coordinates map -->
            <VCol
              v-if="viewingCustomer.latitude != null && viewingCustomer.longitude != null"
              cols="12"
            >
              <p class="text-caption text-medium-emphasis mb-2">
                <VIcon
                  icon="tabler-map-pin"
                  size="13"
                  class="me-1"
                />
                الموقع
                <span class="ms-2 font-weight-regular">
                  ({{ viewingCustomer.latitude }}, {{ viewingCustomer.longitude }})
                </span>
              </p>
              <div style="position: relative; block-size: 220px; border-radius: 8px; overflow: hidden;">
                <!-- Layer toggle button -->
                <button
                  type="button"
                  style="
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    z-index: 1000;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 5px 10px;
                    border-radius: 6px;
                    border: 1px solid rgba(255,255,255,0.4);
                    background: rgba(30,30,30,0.72);
                    backdrop-filter: blur(6px);
                    color: #fff;
                    font-size: 12px;
                    font-weight: 500;
                    cursor: pointer;
                    letter-spacing: 0.3px;
                  "
                  @click.stop="detailMapLayer = detailMapLayer === 'satellite' ? 'street' : 'satellite'"
                >
                  <span style="font-size:14px;">{{ detailMapLayer === 'satellite' ? '🗺️' : '🛰️' }}</span>
                  {{ detailMapLayer === 'satellite' ? 'خريطة' : 'قمر صناعي' }}
                </button>

                <LMap
                  data-allow-mismatch
                  :zoom="13"
                  :center="[viewingCustomer.latitude, viewingCustomer.longitude]"
                  :use-global-leaflet="false"
                  style="block-size: 100%; inline-size: 100%;"
                >
                  <LTileLayer
                    :key="detailMapLayer"
                    :url="detailTileUrl"
                    attribution=""
                    :options="{ attribution: '' }"
                  />
                  <LMarker :lat-lng="[viewingCustomer.latitude, viewingCustomer.longitude]" />
                </LMap>
              </div>
            </VCol>

            <VCol cols="12">
              <VDivider />
            </VCol>

            <!-- Dates -->
            <VCol
              cols="6"
              sm="6"
            >
              <p class="text-caption text-medium-emphasis mb-1">
                تاريخ الإنشاء
              </p>
              <p class="text-body-2 mb-0">
                {{ formatDate(viewingCustomer.createdAt) }}
              </p>
            </VCol>

            <VCol
              cols="6"
              sm="6"
            >
              <p class="text-caption text-medium-emphasis mb-1">
                آخر تحديث
              </p>
              <p class="text-body-2 mb-0">
                {{ formatDate(viewingCustomer.updatedAt) }}
              </p>
            </VCol>
          </VRow>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-3 justify-end">
          <VBtn
            v-if="isAdmin && viewingCustomer"
            prepend-icon="tabler-edit"
            variant="tonal"
            @click="isDetailDialogOpen = false; openEdit(viewingCustomer)"
          >
            تعديل
          </VBtn>
          <VBtn
            variant="tonal"
            color="secondary"
            @click="isDetailDialogOpen = false"
          >
            إغلاق
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- ── Delete Confirmation Dialog ───────────────────────────────────── -->
    <VDialog
      v-model="isDeleteDialogOpen"
      max-width="440"
      persistent
    >
      <VCard>
        <VCardTitle class="d-flex align-center gap-2 pa-4">
          <VIcon
            icon="tabler-alert-triangle"
            color="error"
            size="24"
          />
          حذف العميل
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-4">
          <p class="mb-1">
            هل أنت متأكد من حذف
            <strong>{{ customerToDelete?.name }}</strong>?
          </p>
          <p class="text-medium-emphasis text-body-2 mb-0">
            لا يمكن التراجع عن هذا الإجراء.
          </p>
        </VCardText>

        <VCardActions class="pa-4 pt-0 gap-2 justify-end">
          <VBtn
            variant="tonal"
            color="secondary"
            :disabled="isSubmitting"
            @click="onCancelDelete"
          >
            إلغاء
          </VBtn>
          <VBtn
            color="error"
            :loading="isSubmitting"
            @click="onConfirmDelete"
          >
            <VIcon
              icon="tabler-trash"
              start
            />
            حذف
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- ── Snackbar ──────────────────────────────────────────────────────── -->
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
