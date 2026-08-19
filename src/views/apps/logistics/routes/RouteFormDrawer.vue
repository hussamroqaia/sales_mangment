<script setup>
/**
 * RouteFormDrawer.vue
 *
 * Create drawer for a Route. Form flow:
 *   1. Select Representative
 *   2. Select Territory
 *   3. Based on Territory, multi-select Customers
 *   4. Enter Route Name and Date
 *
 * The component is "dumb": it validates and emits `submit` with the API payload
 * shape `{ representativeId, territoryId, name, routeDate, customerIds }`;
 * the parent page calls the composable and closes the drawer on success.
 */

import { PerfectScrollbar } from 'vue3-perfect-scrollbar'
import RepresentativeSelect from '@/views/apps/logistics/RepresentativeSelect.vue'
import { fetchTerritories } from '@/services/territory.service'
import { fetchCustomers } from '@/services/customer.service'

const props = defineProps({
  isDrawerOpen: {
    type: Boolean,
    required: true,
  },
  isSubmitting: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:isDrawerOpen', 'submit'])

const refForm      = ref()
const refScrollbar = ref()

// ── Form state ──────────────────────────────────────────────────────────────
const blankForm = () => ({
  representativeId: null,
  territoryId: null,
  customerIds: [],
  name: '',
  routeDate: '',
})

const form = ref(blankForm())

// ── Territory autocomplete — server-side search + scroll pagination ───────────
const territorySearch     = ref('')
const territoryItems      = ref([])
const territoryPage       = ref(0)
const territoryTotalPages = ref(1)
const isTerritoryLoading  = ref(false)
let   _tSearchTimer       = null
let   _tBlockScroll       = false

const loadTerritoryPage = async (reset = false) => {
  if (isTerritoryLoading.value) return
  if (!reset && territoryPage.value >= territoryTotalPages.value) return

  if (reset) {
    _tBlockScroll = true
    setTimeout(() => { _tBlockScroll = false }, 200)
  }

  isTerritoryLoading.value = true
  try {
    const pageIndex = reset ? 0 : territoryPage.value
    const data = await fetchTerritories({
      page:   pageIndex,
      size:   20,
      search: territorySearch.value || undefined,
    })

    const incoming = (data?.content ?? []).map(t => ({
      title: t.name || `Territory #${t.id}`,
      value: t.id,
    }))

    if (reset) {
      territoryItems.value = incoming
      territoryPage.value  = 1
    } else {
      territoryItems.value = [...territoryItems.value, ...incoming]
      territoryPage.value  = pageIndex + 1
    }
    territoryTotalPages.value = data?.totalPages ?? 1
  } catch (e) {
    console.warn('[RouteFormDrawer] Failed to load territories:', e)
  } finally {
    isTerritoryLoading.value = false
  }
}

const onTerritorySearch = val => {
  territorySearch.value = val ?? ''
  clearTimeout(_tSearchTimer)
  _tSearchTimer = setTimeout(() => loadTerritoryPage(true), 350)
}

const onTerritoryScrollEnd = (isIntersecting) => {
  if (!isIntersecting || _tBlockScroll) return
  if (territoryPage.value < territoryTotalPages.value) {
    loadTerritoryPage(false)
  }
}

const onTerritoryMenuUpdate = isOpen => {
  if (isOpen && territoryItems.value.length === 0) loadTerritoryPage(true)
}

// ── Customer autocomplete — server-side search + scroll pagination ────────────
const customerSearch     = ref('')
const customerItems      = ref([])
const customerPage       = ref(0)
const customerTotalPages = ref(1)
const isCustomerLoading  = ref(false)
let   _cSearchTimer       = null
let   _cBlockScroll       = false

const loadCustomerPage = async (reset = false) => {
  if (!form.value.territoryId) {
    customerItems.value = []
    return
  }
  if (isCustomerLoading.value) return
  if (!reset && customerPage.value >= customerTotalPages.value) return

  if (reset) {
    _cBlockScroll = true
    setTimeout(() => { _cBlockScroll = false }, 200)
  }

  isCustomerLoading.value = true
  try {
    const pageIndex = reset ? 0 : customerPage.value
    const data = await fetchCustomers({
      territoryId: form.value.territoryId,
      status: 'ACTIVE',
      page: pageIndex,
      size: 20,
      search: customerSearch.value || undefined,
    })

    const content = data?.content ?? []
    const incoming = content.map(c => ({
      title: c.name || `Customer #${c.id}`,
      value: c.id,
      subtitle: c.address || '',
    }))

    if (reset) {
      customerItems.value = incoming
      customerPage.value  = 1
    } else {
      customerItems.value = [...customerItems.value, ...incoming]
      customerPage.value  = pageIndex + 1
    }
    customerTotalPages.value = data?.totalPages ?? 1
  } catch (e) {
    console.warn('[RouteFormDrawer] Failed to load customers:', e)
  } finally {
    isCustomerLoading.value = false
  }
}

const onCustomerSearch = val => {
  customerSearch.value = val ?? ''
  clearTimeout(_cSearchTimer)
  _cSearchTimer = setTimeout(() => loadCustomerPage(true), 350)
}

const onCustomerScrollEnd = (isIntersecting) => {
  if (!isIntersecting || _cBlockScroll) return
  if (customerPage.value < customerTotalPages.value) {
    loadCustomerPage(false)
  }
}

const onCustomerMenuUpdate = isOpen => {
  if (isOpen && customerItems.value.length === 0) loadCustomerPage(true)
}

// When territory changes, reset customers and reload
watch(() => form.value.territoryId, newTerritoryId => {
  form.value.customerIds = []
  customerSearch.value = ''
  customerItems.value = []
  customerPage.value = 0
  customerTotalPages.value = 1
  if (newTerritoryId) {
    loadCustomerPage(true)
  }
})

// ── Reset & close ───────────────────────────────────────────────────────────
const resetForm = () => {
  form.value = blankForm()
  
  territorySearch.value = ''
  territoryItems.value = []
  territoryPage.value = 0
  territoryTotalPages.value = 1
  
  customerSearch.value = ''
  customerItems.value = []
  customerPage.value = 0
  customerTotalPages.value = 1

  nextTick(() => refForm.value?.resetValidation())
}

const closeDrawer = () => {
  emit('update:isDrawerOpen', false)
  nextTick(resetForm)
}

watch(
  () => props.isDrawerOpen,
  isOpen => {
    if (isOpen) {
      resetForm()
      loadTerritoryPage(true)
      nextTick(() => {
        if (refScrollbar.value?.$el) refScrollbar.value.$el.scrollTop = 0
      })
    }
  },
)

// ── Submit ──────────────────────────────────────────────────────────────────
const onSubmit = () => {
  refForm.value?.validate().then(({ valid }) => {
    if (!valid) return

    emit('submit', {
      representativeId: form.value.representativeId,
      territoryId: form.value.territoryId,
      name: form.value.name,
      routeDate: form.value.routeDate,
      customerIds: form.value.customerIds,
    })
  })
}
</script>

<template>
  <VNavigationDrawer
    data-allow-mismatch
    temporary
    :width="520"
    location="end"
    class="scrollable-content"
    :model-value="props.isDrawerOpen"
    @update:model-value="emit('update:isDrawerOpen', $event)"
  >
    <AppDrawerHeaderSection
      title="مسار جديد"
      @cancel="closeDrawer"
    />

    <VDivider />

    <PerfectScrollbar
      ref="refScrollbar"
      :options="{ wheelPropagation: false }"
    >
      <VCard flat>
        <VCardText>
          <VForm
            ref="refForm"
            @submit.prevent="onSubmit"
          >
            <VRow>
              <!-- Step 1: Representative -->
              <VCol cols="12">
                <RepresentativeSelect
                  v-model="form.representativeId"
                  :rules="[requiredValidator]"
                  :disabled="props.isSubmitting"
                />
              </VCol>

              <!-- Step 2: Territory -->
              <VCol cols="12">
                <VAutocomplete
                  v-model="form.territoryId"
                  label="المنطقة"
                  placeholder="اختر المنطقة…"
                  :items="territoryItems"
                  item-title="title"
                  item-value="value"
                  :loading="isTerritoryLoading"
                  :rules="[requiredValidator]"
                  :disabled="props.isSubmitting"
                  clearable
                  no-filter
                  @update:search="onTerritorySearch"
                  @update:menu="onTerritoryMenuUpdate"
                >
                  <!-- Append sentinel for infinite scroll -->
                  <template #append-item>
                    <div
                      v-intersect="{
                        handler: onTerritoryScrollEnd,
                        options: { threshold: 0.5 },
                      }"
                      class="pa-2 text-center"
                    >
                      <VProgressCircular
                        v-if="isTerritoryLoading"
                        indeterminate
                        size="20"
                        width="2"
                        color="primary"
                      />
                      <span
                        v-else-if="territoryPage >= territoryTotalPages"
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
                        {{ isTerritoryLoading ? 'Loading…' : 'لا توجد مناطق' }}
                      </VListItemTitle>
                    </VListItem>
                  </template>
                </VAutocomplete>
              </VCol>

              <!-- Step 3: Customers (multi-select, depends on Territory) -->
              <VCol cols="12">
                <VAutocomplete
                  v-model="form.customerIds"
                  label="العملاء"
                  placeholder="اختر عملاء هذا المسار…"
                  :items="customerItems"
                  item-title="title"
                  item-value="value"
                  :loading="isCustomerLoading"
                  :disabled="props.isSubmitting || !form.territoryId"
                  :rules="[v => (v && v.length > 0) || 'يجب اختيار عميل واحد على الأقل']"
                  multiple
                  chips
                  closable-chips
                  clearable
                  no-filter
                  @update:search="onCustomerSearch"
                  @update:menu="onCustomerMenuUpdate"
                >
                  <!-- Append sentinel for infinite scroll -->
                  <template #append-item>
                    <div
                      v-intersect="{
                        handler: onCustomerScrollEnd,
                        options: { threshold: 0.5 },
                      }"
                      class="pa-2 text-center"
                    >
                      <VProgressCircular
                        v-if="isCustomerLoading"
                        indeterminate
                        size="20"
                        width="2"
                        color="primary"
                      />
                      <span
                        v-else-if="customerPage >= customerTotalPages"
                        class="text-caption text-disabled"
                      >
                        تم تحميل كل العملاء
                      </span>
                    </div>
                  </template>

                  <template #no-data>
                    <VListItem>
                      <VListItemTitle class="text-medium-emphasis">
                        {{ !form.territoryId ? 'اختر المنطقة أولًا' : (isCustomerLoading ? 'Loading…' : 'لا يوجد عملاء في هذه المنطقة') }}
                      </VListItemTitle>
                    </VListItem>
                  </template>
                </VAutocomplete>
              </VCol>

              <!-- Step 4: Route Name -->
              <VCol cols="12">
                <AppTextField
                  v-model="form.name"
                  label="اسم المسار"
                  placeholder="مثال: المسار 29"
                  :rules="[requiredValidator]"
                  :disabled="props.isSubmitting"
                />
              </VCol>

              <!-- Step 4: Route Date -->
              <VCol cols="12">
                <AppDateTimePicker
                  v-model="form.routeDate"
                  label="تاريخ المسار"
                  placeholder="اختر التاريخ"
                  :rules="[requiredValidator]"
                  :disabled="props.isSubmitting"
                  :config="{ dateFormat: 'Y-m-d' }"
                />
              </VCol>

              <!-- Actions -->
              <VCol cols="12">
                <VBtn
                  type="submit"
                  class="me-3"
                  :loading="props.isSubmitting"
                  :disabled="props.isSubmitting"
                >
                  إنشاء المسار
                </VBtn>
                <VBtn
                  type="button"
                  variant="tonal"
                  color="error"
                  :disabled="props.isSubmitting"
                  @click="closeDrawer"
                >
                  إلغاء
                </VBtn>
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
      </VCard>
    </PerfectScrollbar>
  </VNavigationDrawer>
</template>
