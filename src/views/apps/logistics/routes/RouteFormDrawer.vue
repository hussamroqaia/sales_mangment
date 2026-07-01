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

// ── Territory options ───────────────────────────────────────────────────────
const territoryOptions    = ref([])
const isTerritoryLoading  = ref(false)

const loadTerritories = async () => {
  isTerritoryLoading.value = true
  try {
    const data = await fetchTerritories({ page: 0, size: 200 })
    const content = data?.content ?? []

    territoryOptions.value = content.map(t => ({
      title: t.name || `Territory #${t.id}`,
      value: t.id,
    }))
  } catch (e) {
    console.warn('[RouteFormDrawer] Failed to load territories:', e)
  } finally {
    isTerritoryLoading.value = false
  }
}

// ── Customer options (filtered by selected territory) ───────────────────────
const customerOptions    = ref([])
const isCustomerLoading  = ref(false)

const loadCustomers = async territoryId => {
  if (!territoryId) {
    customerOptions.value = []

    return
  }

  isCustomerLoading.value = true
  try {
    const data = await fetchCustomers({
      territoryId,
      status: 'ACTIVE',
      page: 0,
      size: 200,
    })

    const content = data?.content ?? []

    customerOptions.value = content.map(c => ({
      title: c.name || `Customer #${c.id}`,
      value: c.id,
      subtitle: c.address || '',
    }))
  } catch (e) {
    console.warn('[RouteFormDrawer] Failed to load customers:', e)
  } finally {
    isCustomerLoading.value = false
  }
}

// When territory changes, reset customers and reload
watch(() => form.value.territoryId, newTerritoryId => {
  form.value.customerIds = []
  loadCustomers(newTerritoryId)
})

// ── Reset & close ───────────────────────────────────────────────────────────
const resetForm = () => {
  form.value = blankForm()
  customerOptions.value = []
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
      loadTerritories()
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
      title="New Route"
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
                  label="Territory"
                  placeholder="Select territory…"
                  :items="territoryOptions"
                  item-title="title"
                  item-value="value"
                  :loading="isTerritoryLoading"
                  :rules="[requiredValidator]"
                  :disabled="props.isSubmitting"
                  clearable
                  no-filter
                />
              </VCol>

              <!-- Step 3: Customers (multi-select, depends on Territory) -->
              <VCol cols="12">
                <VAutocomplete
                  v-model="form.customerIds"
                  label="Customers"
                  placeholder="Select customers for this route…"
                  :items="customerOptions"
                  item-title="title"
                  item-value="value"
                  :loading="isCustomerLoading"
                  :disabled="props.isSubmitting || !form.territoryId"
                  :rules="[v => (v && v.length > 0) || 'At least one customer is required']"
                  multiple
                  chips
                  closable-chips
                  clearable
                  no-filter
                >
                  <template #no-data>
                    <VListItem>
                      <VListItemTitle class="text-medium-emphasis">
                        {{ !form.territoryId ? 'Select a territory first' : (isCustomerLoading ? 'Loading…' : 'No customers found in this territory') }}
                      </VListItemTitle>
                    </VListItem>
                  </template>
                </VAutocomplete>
              </VCol>

              <!-- Step 4: Route Name -->
              <VCol cols="12">
                <AppTextField
                  v-model="form.name"
                  label="Route Name"
                  placeholder="e.g. Route 29"
                  :rules="[requiredValidator]"
                  :disabled="props.isSubmitting"
                />
              </VCol>

              <!-- Step 4: Route Date -->
              <VCol cols="12">
                <AppDateTimePicker
                  v-model="form.routeDate"
                  label="Route Date"
                  placeholder="Select date"
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
                  Create Route
                </VBtn>
                <VBtn
                  type="button"
                  variant="tonal"
                  color="error"
                  :disabled="props.isSubmitting"
                  @click="closeDrawer"
                >
                  Cancel
                </VBtn>
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
      </VCard>
    </PerfectScrollbar>
  </VNavigationDrawer>
</template>
