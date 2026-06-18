/**
 * useRepresentatives.js
 *
 * Small shared composable that loads SALES_REP users to populate the
 * "representative" selectors used across the Logistics modules
 * (Demand Orders, Return Sheets, Van Inventory).
 *
 * Reps are just users with role === 'SALES_REP'. We expose them as
 * { title, value } option objects ready for AppSelect / VAutocomplete.
 *
 * Architecture: UI → useRepresentatives → user.service (pure Axios)
 */

import { fetchUsers } from '@/services/user.service'

export const useRepresentatives = () => {
  const representatives    = ref([])   // [{ title, value, subtitle }]
  const isRepsLoading      = ref(false)
  const repsError          = ref('')
  const hasLoadedReps      = ref(false)

  /**
   * Load (once) the list of sales representatives.
   * @param {boolean} [force=false] - Re-fetch even if already loaded.
   */
  const loadRepresentatives = async (force = false) => {
    if (hasLoadedReps.value && !force) return
    isRepsLoading.value = true
    repsError.value     = ''

    try {
      // Pull a generous page of reps; adjust size if your rep roster is larger.
      const data = await fetchUsers({
        role: 'SALES_REP',
        status: 'ACTIVE',
        page: 0,
        size: 200,
        sortBy: 'id',
        sortDir: 'asc',
      })

      // fetchUsers returns { users: { content, ... }, counts }
      const content = data?.users?.content ?? data?.content ?? []

      representatives.value = content.map(u => ({
        title: u.name ? `${u.name} (#${u.id})` : `Rep #${u.id}`,
        value: u.id,
        subtitle: u.email ?? '',
      }))
      hasLoadedReps.value = true
    } catch (error) {
      repsError.value = error?.response?.data?.message || 'Failed to load representatives.'
    } finally {
      isRepsLoading.value = false
    }
  }

  return {
    representatives,
    isRepsLoading,
    repsError,
    hasLoadedReps,
    loadRepresentatives,
  }
}
