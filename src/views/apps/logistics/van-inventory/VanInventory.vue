<script setup>
/**
 * VanInventory.vue
 *
 * Pick a representative → fetch and display their current van stock in a
 * standard (non-paginated) Vuexy data table. The GET /inventory/van/{id}
 * endpoint returns a flat array, so we use a plain VDataTable with client-side
 * paging disabled (items-per-page = -1).
 */

import RepresentativeSelect from '@/views/apps/logistics/RepresentativeSelect.vue'
import { useVanInventory } from '@/composables/useVanInventory'

const {
  representativeId,
  inventory,
  isLoading,
  error,
  hasFetched,
  totalUnits,
  loadInventory,
} = useVanInventory()

const headers = [
  { title: 'المنتج',          key: 'product.name', sortable: true  },
  { title: 'رمز الصنف',              key: 'product.sku',  sortable: true  },
  { title: 'الكمية الحالية', key: 'quantity',     sortable: true, align: 'end' },
  { title: 'الوحدة',             key: 'product.unitOfMeasure', sortable: true },
]
</script>

<template>
  <section>
    <VCard>
      <VCardItem class="pb-2">
        <VCardTitle>مخزون المركبات</VCardTitle>
        <template #append>
          <VChip
            v-if="hasFetched && inventory.length"
            color="primary"
            variant="tonal"
            label
          >
            {{ countAr(totalUnits, { one: 'وحدة', two: 'وحدتان', few: 'وحدات', many: 'وحدة', other: 'وحدة' }) }} في المركبة
          </VChip>
        </template>
      </VCardItem>

      <!-- Representative selector -->
      <VCardText>
        <VRow>
          <VCol
            cols="12"
            sm="6"
            md="5"
          >
            <RepresentativeSelect
              v-model="representativeId"
              label="المندوب"
              placeholder="اختر مندوبًا لعرض مخزون مركبته"
              clearable
            />
          </VCol>
          <VCol
            cols="12"
            sm="auto"
            class="mt-6"
          >
            <VBtn
              variant="tonal"
              color="secondary"
              prepend-icon="tabler-refresh"
              :disabled="!representativeId"
              :loading="isLoading"
              @click="loadInventory"
            >
              تحديث
            </VBtn>
          </VCol>
        </VRow>
      </VCardText>

      <VDivider />

      <VAlert
        v-if="error"
        type="error"
        variant="tonal"
        class="ma-4"
        closable
      >
        {{ error }}
      </VAlert>

      <!-- Prompt before a rep is chosen -->
      <div
        v-if="!representativeId"
        class="d-flex flex-column align-center justify-center py-12 gap-3"
      >
        <VIcon
          icon="tabler-box-seam"
          size="48"
          color="secondary"
        />
        <p class="text-body-1 text-medium-emphasis mb-0">
          اختر مندوبًا لعرض مخزون مركبته الحالي.
        </p>
      </div>

      <!-- Non-paginated standard data table -->
      <VDataTable
        v-else
        :headers="headers"
        :items="inventory"
        :loading="isLoading"
        :items-per-page="-1"
        item-value="id"
        class="text-no-wrap"
        hide-default-footer
      >
        <template #loading>
          <VSkeletonLoader type="table-row@6" />
        </template>

        <template #no-data>
          <div class="d-flex flex-column align-center justify-center py-10 gap-3">
            <VIcon
              icon="tabler-package-off"
              size="48"
              color="secondary"
            />
            <p class="text-body-1 text-medium-emphasis mb-0">
              مخزون هذه المركبة فارغ حاليًا.
            </p>
          </div>
        </template>

        <template #item.product.name="{ item }">
          <div class="d-flex align-center gap-x-3">
            <VAvatar
              size="36"
              color="primary"
              variant="tonal"
            >
              <VIcon
                icon="tabler-box"
                size="18"
              />
            </VAvatar>
            <span class="text-body-1 font-weight-medium text-high-emphasis">
              {{ item.product?.name || '—' }}
            </span>
          </div>
        </template>

        <template #item.product.sku="{ item }">
          <span class="text-body-2 font-weight-medium">{{ item.product?.sku || '—' }}</span>
        </template>

        <template #item.quantity="{ item }">
          <span class="text-body-1 font-weight-medium">{{ item.quantity ?? '—' }}</span>
        </template>

        <template #item.product.unitOfMeasure="{ item }">
          <span class="text-body-2">{{ resolveUnitTitle(item.product?.unitOfMeasure) }}</span>
        </template>
      </VDataTable>
    </VCard>
  </section>
</template>
