<script setup>
/**
 * RepresentativeSelect.vue
 *
 * Reusable representative picker with SERVER-SIDE search + infinite-scroll
 * pagination (mirrors ProductAutocomplete). Loads SALES_REP users one page at a
 * time from `GET /users?role=SALES_REP&page=&size=&sortBy=&sortDir=` and appends
 * the next page when the user scrolls to the bottom of the menu.
 *
 * Displays the representative's NAME; binds the chosen rep id via v-model.
 *
 * Usage:
 *   <RepresentativeSelect v-model="form.representativeId" :rules="[requiredValidator]" />
 */

import { fetchUsers } from '@/services/user.service'

const props = defineProps({
  modelValue: {
    type: [Number, String],
    default: null,
  },
  label: {
    type: String,
    default: 'المندوب',
  },
  placeholder: {
    type: String,
    default: 'ابحث عن مندوب…',
  },
  rules: {
    type: Array,
    default: () => [],
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
    default: 10,
  },
})

const emit = defineEmits(['update:modelValue', 'select'])

const items       = ref([])   // [{ title: name, value: id, raw }]
const pageIndex   = ref(0)     // next 0-based page to request
const totalPages  = ref(1)
const isLoading   = ref(false)
const searchTerm  = ref('')
let   searchTimer = null
let   blockScroll = false

const mapUser = u => ({
  title: u.name ? u.name : `Rep #${u.id}`,
  subtitle: u.phoneNumber ? formatPhoneNumber(u.phoneNumber) : '',
  value: u.id,
  raw: u,
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
    const data = await fetchUsers({
      role:    'SALES_REP',
      status:  'ACTIVE',
      search:  searchTerm.value || undefined,
      page:    idx,
      size:    props.pageSize,
      sortBy:  'id',
      sortDir: 'asc',
    })

    // fetchUsers returns { users: { content, totalPages, ... }, counts }
    const pageData = data?.users ?? data
    const incoming = (pageData?.content ?? []).map(mapUser)

    if (reset) {
      items.value     = incoming
      pageIndex.value = 1
    } else {
      // De-dupe by id in case pages overlap
      const existing = new Set(items.value.map(i => i.value))
      items.value     = [...items.value, ...incoming.filter(i => !existing.has(i.value))]
      pageIndex.value = idx + 1
    }
    totalPages.value = pageData?.totalPages ?? 1
  } catch (e) {
    console.warn('[RepresentativeSelect] load failed:', e)
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

// Preload the first page so a v-model value can resolve to a visible label.
onMounted(() => loadPage(true))
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
    :clearable="props.clearable"
    no-filter
    @update:model-value="onChange"
    @update:search="onSearch"
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
          تم تحميل كل المندوبين
        </span>
      </div>
    </template>

    <template #no-data>
      <VListItem>
        <VListItemTitle class="text-medium-emphasis">
          {{ isLoading ? 'جارِ التحميل…' : 'لا يوجد مندوبون' }}
        </VListItemTitle>
      </VListItem>
    </template>
  </VAutocomplete>
</template>
