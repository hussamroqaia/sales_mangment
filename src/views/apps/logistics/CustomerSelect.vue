<script setup>
/**
 * CustomerSelect.vue
 *
 * Reusable customer picker with SERVER-SIDE search + infinite-scroll pagination
 * (mirrors RepresentativeSelect). Loads customers one page at a time from
 * `GET /customers?search=&page=&size=&sortBy=&sortDir=`.
 *
 * When a `stops` array is supplied (a route's stops) the component switches to
 * that fixed, de-duplicated set instead of querying the API — that is exactly
 * the customer set the selected route can produce visits for, so hitting the
 * customers endpoint would only offer choices that return no rows.
 *
 * Displays the customer NAME; binds the chosen customer id via v-model.
 */

import { fetchCustomers } from '@/services/customer.service'

const props = defineProps({
  modelValue: {
    type: [Number, String],
    default: null,
  },
  stops: {
    type: Array,
    default: null,
  },
  label: {
    type: String,
    default: 'العميل',
  },
  placeholder: {
    type: String,
    default: 'ابحث عن عميل…',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  clearable: {
    type: Boolean,
    default: false,
  },
  pageSize: {
    type: Number,
    default: 20,
  },
})

const emit = defineEmits(['update:modelValue', 'select'])

const remoteItems = ref([])   // [{ title, subtitle, value, raw }]
const pageIndex   = ref(0)    // next 0-based page to request
const totalPages  = ref(1)
const isLoading   = ref(false)
const searchTerm  = ref('')
let   searchTimer = null
let   blockScroll = false

const mapCustomer = c => ({
  title: c.name || `Customer #${c.id}`,
  subtitle: c.address ?? '',
  value: c.id,
  raw: c,
})

// Customers taken from a route's stops — flattened and de-duplicated by id.
const stopItems = computed(() => {
  if (!props.stops) return null

  const seen = new Map()

  props.stops.forEach(stop => {
    if (stop?.customerId == null || seen.has(stop.customerId)) return
    seen.set(stop.customerId, {
      title: stop.customerName || `Customer #${stop.customerId}`,
      subtitle: stop.customerAddress ?? '',
      value: stop.customerId,
      raw: stop,
    })
  })

  return [...seen.values()]
})

const isStopMode = computed(() => stopItems.value !== null)
const items = computed(() => stopItems.value ?? remoteItems.value)

const loadPage = async (reset = false) => {
  if (isStopMode.value || isLoading.value) return
  if (!reset && pageIndex.value >= totalPages.value) return

  if (reset) {
    blockScroll = true
    setTimeout(() => { blockScroll = false }, 200)
  }

  isLoading.value = true
  try {
    const idx = reset ? 0 : pageIndex.value

    const data = await fetchCustomers({
      search: searchTerm.value || undefined,
      page: idx,
      size: props.pageSize,
      sortBy: 'id',
      sortDir: 'asc',
    })

    const incoming = (data?.content ?? []).map(mapCustomer)

    if (reset) {
      remoteItems.value = incoming
      pageIndex.value   = 1
    } else {
      // De-dupe by id in case pages overlap
      const existing = new Set(remoteItems.value.map(i => i.value))

      remoteItems.value = [...remoteItems.value, ...incoming.filter(i => !existing.has(i.value))]
      pageIndex.value   = idx + 1
    }
    totalPages.value = data?.totalPages ?? 1
  } catch (error) {
    console.warn('[CustomerSelect] load failed:', error)
  } finally {
    isLoading.value = false
  }
}

const onSearch = val => {
  if (isStopMode.value) return
  searchTerm.value = val ?? ''
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => loadPage(true), 350)
}

const onScrollEnd = isIntersecting => {
  if (!isIntersecting || blockScroll || isStopMode.value) return
  if (pageIndex.value < totalPages.value) loadPage(false)
}

const onMenuToggle = isOpen => {
  if (isOpen && !isStopMode.value && remoteItems.value.length === 0) loadPage(true)
}

const onChange = val => {
  emit('update:modelValue', val)

  const picked = items.value.find(i => i.value === val)

  emit('select', picked?.raw ?? null)
}

// Leaving stop mode (route filter cleared) — refill from the API.
watch(isStopMode, stopMode => {
  if (!stopMode) loadPage(true)
})

// Preload the first page so a v-model value can resolve to a visible label.
onMounted(() => {
  if (!isStopMode.value) loadPage(true)
})
</script>

<template>
  <AppAutocomplete
    :model-value="props.modelValue"
    :label="props.label"
    :placeholder="props.placeholder"
    :items="items"
    item-title="title"
    item-value="value"
    :loading="isLoading"
    :disabled="props.disabled"
    :clearable="props.clearable"
    clear-icon="tabler-x"
    :no-filter="!isStopMode"
    @update:model-value="onChange"
    @update:search="onSearch"
    @update:menu="onMenuToggle"
  >
    <template #item="{ props: itemProps, item }">
      <VListItem
        v-bind="itemProps"
        :subtitle="item.raw.subtitle"
      />
    </template>

    <!-- Infinite-scroll sentinel (server-side mode only) -->
    <template
      v-if="!isStopMode"
      #append-item
    >
      <div
        v-intersect="{ handler: onScrollEnd, options: { threshold: 0.5 } }"
        class="pa-2 text-center"
      >
        <VProgressCircular
          v-if="isLoading"
          indeterminate
          size="20"
          width="2"
          color="primary"
        />
        <span
          v-else-if="pageIndex >= totalPages && items.length"
          class="text-caption text-disabled"
        >
          تم تحميل كل العملاء
        </span>
      </div>
    </template>

    <template #no-data>
      <VListItem>
        <VListItemTitle class="text-medium-emphasis">
          {{ isLoading ? 'جارِ التحميل…' : 'لا يوجد عملاء' }}
        </VListItemTitle>
      </VListItem>
    </template>
  </AppAutocomplete>
</template>
