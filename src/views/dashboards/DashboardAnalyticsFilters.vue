<script setup>
/**
 * DashboardAnalyticsFilters.vue
 *
 * The one filter bar both analytics sections obey.
 *
 * ─── Why an Apply button ─────────────────────────────────────────────────────
 * Four controls feeding two endpoints means a naïve `watch` costs eight
 * requests for one change of mind — and the last of them is not necessarily the
 * one that answers last. Apply is also what the reports module already does, so
 * a filter bar in this app behaves the same way wherever it appears. The chip
 * beside the button is what stops that from being a trap: it says out loud that
 * the charts no longer match the controls.
 *
 * Refresh is a separate control on purpose. It re-runs the SAME window rather
 * than adopting whatever is currently typed into the pickers, which is what
 * "refresh" has to mean for it to be safe to press while mid-edit.
 *
 * ─── Dates ───────────────────────────────────────────────────────────────────
 * Both pickers are INCLUSIVE, which is the only thing "إلى ٣١ آب" can mean to
 * the person reading it. The API's window is half-open; the conversion lives in
 * useDashboard and never leaks into this component.
 */

const props = defineProps({
  loading: { type: Boolean, default: false },

  /** Filters edited since the last load. */
  stale: { type: Boolean, default: false },

  /** Arabic validation message, empty when the range is usable. */
  rangeError: { type: String, default: '' },

  /** The window currently on screen, e.g. `من 24 تموز 2026 إلى 22 آب 2026`. */
  appliedRange: { type: String, default: '' },
})

const emit = defineEmits(['apply', 'refresh'])

const from        = defineModel('from', { type: String, default: null })
const to          = defineModel('to', { type: String, default: null })
const granularity = defineModel('granularity', { type: String, default: 'DAY' })
const top         = defineModel('top', { type: Number, default: 5 })

// `top` is a fixed list rather than a number field: the API rejects anything
// outside 1..20 with a 400, and a free-text box is an invitation to earn one.
const topOptions = ANALYTICS_TOP_OPTIONS.map(value => ({ title: String(value), value }))

const canApply = computed(() => !props.rangeError && !props.loading)
</script>

<template>
  <VCard>
    <VCardText>
      <VRow>
        <VCol
          cols="12"
          sm="6"
          md="3"
        >
          <AppDateTimePicker
            v-model="from"
            label="من تاريخ"
            placeholder="سنة-شهر-يوم"
            :config="{ dateFormat: 'Y-m-d' }"
          />
        </VCol>

        <VCol
          cols="12"
          sm="6"
          md="3"
        >
          <AppDateTimePicker
            v-model="to"
            label="إلى تاريخ"
            placeholder="سنة-شهر-يوم"
            :config="{ dateFormat: 'Y-m-d' }"
          />
        </VCol>

        <VCol
          cols="12"
          sm="6"
          md="3"
        >
          <AppSelect
            v-model="granularity"
            label="التجميع"
            :items="ANALYTICS_GRANULARITIES"
            item-title="title"
            item-value="value"
          />
        </VCol>

        <VCol
          cols="12"
          sm="6"
          md="3"
        >
          <AppSelect
            v-model="top"
            label="عدد العناصر في الترتيب"
            :items="topOptions"
            item-title="title"
            item-value="value"
          />
        </VCol>
      </VRow>

      <VAlert
        v-if="rangeError"
        type="warning"
        variant="tonal"
        density="compact"
        class="mt-2"
      >
        {{ rangeError }}
      </VAlert>
    </VCardText>

    <VDivider />

    <VCardText class="d-flex flex-wrap align-center gap-3">
      <VBtn
        prepend-icon="tabler-filter-check"
        :disabled="!canApply"
        :loading="loading"
        @click="emit('apply')"
      >
        تطبيق
      </VBtn>

      <VBtn
        variant="tonal"
        color="secondary"
        prepend-icon="tabler-refresh"
        :disabled="loading"
        @click="emit('refresh')"
      >
        تحديث
      </VBtn>

      <VChip
        v-if="stale"
        color="warning"
        size="small"
        label
      >
        تغيّرت عوامل التصفية — اضغط «تطبيق»
      </VChip>

      <VSpacer />

      <!--
        The window the charts actually describe, not the one in the pickers.
        While the two disagree the chip above says so, and this stays truthful
        about what is on screen.
      -->
      <span
        v-if="appliedRange"
        class="text-body-2 text-medium-emphasis"
      >
        {{ appliedRange }}
      </span>
    </VCardText>
  </VCard>
</template>
