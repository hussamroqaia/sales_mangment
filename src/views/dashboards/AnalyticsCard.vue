<script setup>
/**
 * AnalyticsCard.vue
 *
 * The shell every analytics card on the dashboard wears: heading, optional
 * header controls, and the four states a card can be in — loading, failed,
 * empty, populated.
 *
 * It exists so those four states are decided in ONE place. Written out per card
 * they drift immediately: one card renders a chart with no series, the next
 * shows `0%` while its request is still in flight, a third blanks out on an
 * error with nothing to say why. The distinction that matters most here is the
 * one between "still loading" and "the answer is zero" — both are common on
 * this dashboard, and only the skeleton keeps them apart.
 *
 * Presentational only: it takes an already-resolved `loading` / `error` /
 * `empty` triple and never looks at a request itself.
 */

const props = defineProps({
  title: { type: String, required: true },

  /** Second line under the title — usually the window the data describes. */
  subtitle: { type: String, default: '' },

  loading: { type: Boolean, default: false },

  /** Arabic message from `resolveApiError`. Empty when the load succeeded. */
  error: { type: String, default: '' },

  /**
   * True when the request succeeded and returned nothing to draw. Distinct
   * from `loading`: an empty state is an answer, a skeleton is the absence of
   * one.
   */
  empty: { type: Boolean, default: false },

  emptyText: { type: String, default: 'لا توجد بيانات ضمن الفترة المحددة' },
  emptyIcon: { type: String, default: 'tabler-chart-bar-off' },

  /**
   * Height of the card's body, in px. Charts need a number — an SVG has no
   * intrinsic height to collapse to — and pinning it here keeps the skeleton,
   * the empty state and the chart itself the same size, so a card does not
   * resize under the pointer as its request resolves. Only the height is
   * fixed; the width is always the column's.
   */
  bodyHeight: { type: Number, default: 320 },
})

defineEmits(['retry'])

const bodyStyle = computed(() => ({ blockSize: `${props.bodyHeight}px` }))
</script>

<template>
  <VCard class="h-100">
    <VCardItem class="pb-2">
      <VCardTitle>{{ title }}</VCardTitle>
      <VCardSubtitle v-if="subtitle">
        {{ subtitle }}
      </VCardSubtitle>

      <template #append>
        <!-- Tabs, toggles, a legend — whatever this particular card steers with. -->
        <slot name="actions" />
      </template>
    </VCardItem>

    <VCardText>
      <!--
        Loading wins over every other state: while a request is in flight the
        previous answer is no longer the answer, and an empty state shown
        mid-request reads as a result the backend never gave.
      -->
      <div
        v-if="loading"
        :style="bodyStyle"
      >
        <VSkeletonLoader
          type="image"
          class="h-100"
        />
      </div>

      <VAlert
        v-else-if="error"
        type="error"
        variant="tonal"
        density="compact"
      >
        {{ error }}

        <template #append>
          <VBtn
            variant="text"
            size="small"
            @click="$emit('retry')"
          >
            إعادة المحاولة
          </VBtn>
        </template>
      </VAlert>

      <div
        v-else-if="empty"
        class="d-flex flex-column align-center justify-center text-center gap-2"
        :style="bodyStyle"
      >
        <VIcon
          :icon="emptyIcon"
          size="42"
          color="secondary"
        />
        <span class="text-body-2 text-medium-emphasis">{{ emptyText }}</span>
      </div>

      <slot v-else />
    </VCardText>
  </VCard>
</template>
