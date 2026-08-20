<script setup>
/**
 * ProductAutocomplete.vue
 *
 * Reusable product picker with SERVER-SIDE search + infinite-scroll pagination
 * (mirrors the pattern used in WarehouseStockList). Emits the selected product id
 * via v-model and the full product object via @select (so callers can capture
 * name/sku for display in dynamic line rows).
 *
 * Usage:
 *   <ProductAutocomplete v-model="line.productId" @select="p => onPick(p)" />
 */

import { fetchProducts } from '@/services/product.service'

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
    default: 'ابحث عن منتج…',
  },
  rules: {
    type: Array,
    default: () => [],
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue', 'select'])

const items        = ref([])   // [{ title, value, raw }]
const pageIndex    = ref(0)
const totalPages   = ref(1)
const isLoading    = ref(false)
const searchTerm   = ref('')
let   searchTimer  = null
let   blockScroll  = false

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
    const data = await fetchProducts({
      page: idx,
      size: 20,
      search: searchTerm.value || undefined,
      status: 'ACTIVE',
    })

    const incoming = (data?.content ?? []).map(p => ({
      title: p.sku ? `${p.name} — ${p.sku}` : p.name,
      value: p.id,
      raw: p,
    }))

    if (reset) {
      items.value     = incoming
      pageIndex.value = 1
    } else {
      items.value     = [...items.value, ...incoming]
      pageIndex.value = idx + 1
    }
    totalPages.value = data?.totalPages ?? 1
  } catch (e) {
    console.warn('[ProductAutocomplete] load failed:', e)
  } finally {
    isLoading.value = false
  }
}

const onSearch = val => {
  searchTerm.value = val ?? ''
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => loadPage(true), 350)
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
  emit('select', picked?.raw ?? null)
}
</script>

<template>
  <VAutocomplete
    :model-value="props.modelValue"
    :label="props.label"
    :placeholder="props.placeholder"
    :items="items"
    item-title="title"
    item-value="value"
    :loading="isLoading"
    :rules="props.rules"
    :disabled="props.disabled"
    no-filter
    clearable
    @update:model-value="onChange"
    @update:search="onSearch"
    @update:menu="onMenuToggle"
  >
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
          {{ isLoading ? 'جارِ التحميل…' : 'لا توجد منتجات' }}
        </VListItemTitle>
      </VListItem>
    </template>
  </VAutocomplete>
</template>
