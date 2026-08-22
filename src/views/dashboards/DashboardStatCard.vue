<script setup>
/**
 * DashboardStatCard.vue
 *
 * One dashboard figure: value, label, optional sub-caption, and an icon.
 *
 * The same three-part tile was previously written out four times inside
 * DashboardKpiOverview — counters, the two leaderboard tiles, and the
 * month-over-month tile — each copy drifting slightly in its shrink and
 * overflow handling. It lives here once so every card on the dashboard sizes
 * and truncates identically.
 *
 * Presentational only: it receives already-formatted strings, so a raw DTO
 * value can never reach the DOM unformatted.
 */

const props = defineProps({
  /** Arabic label under the figure. */
  title: { type: String, required: true },

  /** The figure itself — ALREADY formatted by the caller ('—' when absent). */
  value: { type: String, required: true },

  /** Tabler icon name for the trailing avatar. */
  icon: { type: String, required: true },

  /** Optional second line, e.g. the sales total behind a leaderboard name. */
  caption: { type: String, default: '' },

  /**
   * Semantic theme colour ('success' | 'error' | 'secondary' | …) applied to
   * the figure and the avatar. Empty keeps the neutral surface treatment used
   * by the plain counters.
   */
  color: { type: String, default: '' },

  /** Small icon printed immediately before the figure (trend arrows). */
  valueIcon: { type: String, default: '' },

  /**
   * Isolates the figure as LTR. Needed for anything carrying a sign or a
   * leading arrow: an Arabic paragraph reorders those to the far end of the
   * number. Plain grouped digits do not need it.
   */
  ltrValue: { type: Boolean, default: false },
})

/**
 * Long values step down the Vuexy type scale instead of overflowing.
 *
 * A money figure in the millions is wider than a quarter-row at `text-h4`; the
 * old markup let it run over the neighbouring tile and crush its icon. The
 * `overflow-wrap` rule below catches whatever is still too wide after this.
 */
const valueClass = computed(() => {
  const { length } = props.value

  if (length > 12) return 'text-h6'
  if (length > 9) return 'text-h5'

  return 'text-h4'
})
</script>

<template>
  <VCard>
    <VCardText class="d-flex justify-space-between align-center dashboard-stat">
      <div class="d-flex flex-column dashboard-stat__text">
        <h4
          class="d-flex align-center dashboard-stat__value"
          :class="[valueClass, color ? `text-${color}` : '']"
          :dir="ltrValue ? 'ltr' : undefined"
        >
          <VIcon
            v-if="valueIcon"
            :icon="valueIcon"
            size="24"
            class="me-1 flex-shrink-0"
          />
          {{ value }}
        </h4>

        <span class="text-body-1">{{ title }}</span>

        <span
          v-if="caption"
          class="text-body-2 text-medium-emphasis"
        >
          {{ caption }}
        </span>
      </div>

      <VAvatar
        class="dashboard-stat__avatar"
        variant="tonal"
        rounded
        size="42"
        :color="color || undefined"
      >
        <VIcon
          :icon="icon"
          size="26"
          :color="color ? undefined : 'high-emphasis'"
        />
      </VAvatar>
    </VCardText>
  </VCard>
</template>

<style lang="scss" scoped>
/**
 * Keeps the figure inside its own card.
 *
 * `justify-space-between` alone lets the text block push past the tile: a flex
 * item's default `min-inline-size: auto` refuses to shrink below its content,
 * so a wide figure squeezed the avatar to nothing. Letting the text block
 * shrink and pinning the avatar out of the shrink calculation fixes both.
 */
.dashboard-stat {
  gap: 0.5rem;

  &__text {
    min-inline-size: 0;
  }

  &__value {
    overflow-wrap: anywhere;
  }

  &__avatar {
    flex: 0 0 auto;
  }
}
</style>
