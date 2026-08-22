<script setup>
/**
 * RouteSelect.vue
 *
 * Reusable route picker with infinite-scroll pagination (mirrors
 * RepresentativeSelect / ProductAutocomplete). Loads routes one page at a time
 * from `GET /routes?page=&size=&sortBy=&sortDir=`.
 *
 * `GET /routes` has no `search` parameter, so filtering inside the menu is done
 * client-side over the pages that have already been loaded — the sentinel at
 * the bottom of the menu keeps pulling more pages as the user scrolls.
 *
 * Displays the route NAME; binds the chosen route id via v-model.
 * Pass `representativeId` to scope the options to a single sales rep.
 *
 * Emits `options` with the raw route objects that are currently loaded so the
 * parent can resolve a route name from a bare `routeId` without an extra
 * request per row.
 */

import { fetchRoutes } from '@/services/route.service'

const props = defineProps({
  modelValue: {
    type: [Number, String],
    default: null,
  },
  representativeId: {
    type: [Number, String],
    default: null,
  },
  label: {
    type: String,
    default: 'المسار',
  },
  placeholder: {
    type: String,
    default: 'ابحث عن مسار…',
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

const emit = defineEmits(['update:modelValue', 'select', 'options'])

const items      = ref([])   // [{ title, subtitle, value, raw }]
const pageIndex  = ref(0)    // next 0-based page to request
const totalPages = ref(1)
const isLoading  = ref(false)
let   blockScroll = false

const mapRoute = r => ({
  title: r.name || `Route #${r.id}`,
  subtitle: [r.representativeName, r.routeDate].filter(Boolean).join(' · '),
  value: r.id,
  raw: r,
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

    const data = await fetchRoutes({
      representativeId: props.representativeId || undefined,
      page: idx,
      size: props.pageSize,
      sortBy: 'id',
      sortDir: 'desc',
    })

    const incoming = (data?.content ?? []).map(mapRoute)

    if (reset) {
      items.value     = incoming
      pageIndex.value = 1
    } else {
      // De-dupe by id in case pages overlap
      const existing = new Set(items.value.map(i => i.value))

      items.value     = [...items.value, ...incoming.filter(i => !existing.has(i.value))]
      pageIndex.value = idx + 1
    }
    totalPages.value = data?.totalPages ?? 1
    emit('options', items.value.map(i => i.raw))
  } catch (error) {
    console.warn('[RouteSelect] load failed:', error)
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

  emit('select', picked?.raw ?? null)
}

// Reload the option list whenever the representative scope changes. The parent
// owns clearing an incompatible selection.
watch(() => props.representativeId, () => {
  items.value      = []
  pageIndex.value  = 0
  totalPages.value = 1
  loadPage(true)
})

// Preload the first page so a v-model value can resolve to a visible label.
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
    :disabled="props.disabled"
    :clearable="props.clearable"
    clear-icon="tabler-x"
    @update:model-value="onChange"
    @update:menu="onMenuToggle"
  >
    <template #item="{ props: itemProps, item }">
      <VListItem
        v-bind="itemProps"
        :subtitle="item.raw.subtitle"
      />
    </template>

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
          تم تحميل كل المسارات
        </span>
      </div>
    </template>

    <template #no-data>
      <VListItem>
        <VListItemTitle class="text-medium-emphasis">
          {{ isLoading ? 'جارِ التحميل…' : 'لا توجد مسارات' }}
        </VListItemTitle>
      </VListItem>
    </template>
  </AppAutocomplete>
</template>
