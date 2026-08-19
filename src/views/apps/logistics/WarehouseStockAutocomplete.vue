<script setup>
/**
 * WarehouseStockAutocomplete.vue
 *
 * Product picker sourced from WAREHOUSE STOCK (GET /inventory/warehouse-stock)
 * with infinite-scroll pagination. Only products that exist in warehouse stock
 * are selectable. Binds the underlying `productId` (NOT the stock row id) via
 * v-model, and emits the full stock row (with a `name` alias) via @select.
 *
 * ⚠️ This endpoint has no free-text `search` param — it only supports
 * page/size/sortBy/sortDir (+ productId / lowStock filters). So we page through
 * the catalogue on scroll and let VAutocomplete filter the already-loaded rows
 * client-side as the user types.
 */

import { fetchWarehouseStock } from '@/services/warehouseStock.service'

const props = defineProps({
  modelValue: {
    type: [Number, String],
    default: null,
  },
  label: {
    type: String,
    default: 'المنتج',
  },
  placeholder: {
    type: String,
    default: 'اختر منتجًا من المخزون…',
  },
  rules: {
    type: Array,
    default: () => [],
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  pageSize: {
    type: Number,
    default: 20,
  },
})

const emit = defineEmits(['update:modelValue', 'select'])

const items      = ref([])   // [{ title, value: productId, raw }]
const pageIndex  = ref(0)     // next 0-based page to request
const totalPages = ref(1)
const isLoading  = ref(false)
let   blockScroll = false

const mapRow = row => ({
  title: row.sku ? `${row.productName} — ${row.sku}` : row.productName,
  value: row.productId,
  raw: row,
})

const loadPage = async (reset = false) => {
  if (isLoading.value) return
  if (!reset && pageIndex.value >= totalPages.value) return

  if (reset) {
    blockScroll = true
    setTimeout(() => { blockScroll = false }, 200)
  }

  isLoading.value = true
  try {
    const idx = reset ? 0 : pageIndex.value
    const data = await fetchWarehouseStock({
      page:     idx,
      size:     props.pageSize,
      sortBy:   'id',
      sortDir:  'asc',
      lowStock: false,
    })

    // fetchWarehouseStock returns the inner data object: { content, totalPages, ... }
    const incoming = (data?.content ?? []).map(mapRow)

    if (reset) {
      items.value     = incoming
      pageIndex.value = 1
    } else {
      // De-dupe by productId in case pages overlap
      const existing = new Set(items.value.map(i => i.value))
      items.value     = [...items.value, ...incoming.filter(i => !existing.has(i.value))]
      pageIndex.value = idx + 1
    }
    totalPages.value = data?.totalPages ?? 1
  } catch (e) {
    console.warn('[WarehouseStockAutocomplete] load failed:', e)
  } finally {
    isLoading.value = false
  }
}

const onScrollEnd = isIntersecting => {
  if (!isIntersecting || blockScroll) return
  if (pageIndex.value < totalPages.value) loadPage(false)
}

const onMenuToggle = isOpen => {
  if (isOpen && items.value.length === 0) loadPage(true)
}

const onChange = val => {
  emit('update:modelValue', val)
  const picked = items.value.find(i => i.value === val)
  // Alias productName → name so callers can read `product.name` uniformly.
  emit('select', picked ? { ...picked.raw, name: picked.raw.productName } : null)
}

// Preload the first page so a pre-set v-model can resolve to a label.
onMounted(() => loadPage(true))
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
    :rules="props.rules"
    :disabled="props.disabled"
    clearable
    @update:model-value="onChange"
    @update:menu="onMenuToggle"
  >
    <!-- Infinite-scroll sentinel -->
    <template #append-item>
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
          تم تحميل كل المنتجات
        </span>
      </div>
    </template>

    <template #no-data>
      <VListItem>
        <VListItemTitle class="text-medium-emphasis">
          {{ isLoading ? 'Loading…' : 'لا توجد منتجات في المخزون' }}
        </VListItemTitle>
      </VListItem>
    </template>
  </AppAutocomplete>
</template>
