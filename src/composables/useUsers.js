/**
 * useUsers.js
 *
 * Central composable for the User Management module.
 * All filtering, sorting, and pagination is handled SERVER-SIDE.
 *
 * Architecture:
 *   UI → useUsers (state + business logic) → user.service (pure Axios calls)
 *
 * Key design decisions:
 *  - `page` is kept in 1-based internally (Vuetify convention) and converted
 *    to 0-based before sending to the API.
 *  - `counts` from the API powers the summary widgets independently of the
 *    current page/filter view.
 *  - Search is debounced (400 ms) to avoid hammering the API on every keystroke.
 *  - Changing any filter or sort resets the page to 1 automatically.
 */

import { watchDebounced } from '@vueuse/core'
import { resolveApiError } from '@/utils/apiErrors'
import {
  fetchUsers,
  fetchUserById,
  createUser as createUserService,
  updateUserStatus as updateUserStatusService,
  resetUserPassword as resetUserPasswordService,
} from '@/services/user.service'

// ─── Role / Status display helpers (shared across components) ─────────────────
export const USER_ROLES = [
  { title: 'مدير النظام',     value: 'ADMIN'             },
  { title: 'مدير المبيعات',   value: 'SALES_MANAGER'     },
  { title: 'مندوب المبيعات',  value: 'SALES_REP'         },
  { title: 'مدير المستودع',   value: 'WAREHOUSE_MANAGER' },
]

export const USER_STATUSES = [
  { title: 'نشط',       value: 'ACTIVE'    },
  { title: 'غير نشط',   value: 'INACTIVE'  },
  { title: 'موقوف',     value: 'SUSPENDED' },
]

export const resolveRoleVariant = role => {
  const map = {
    ADMIN:             { color: 'primary', icon: 'tabler-crown'                  },
    SALES_MANAGER:     { color: 'info',    icon: 'tabler-chart-bar'              },
    SALES_REP:         { color: 'success', icon: 'tabler-user-dollar'            },
    WAREHOUSE_MANAGER: { color: 'warning', icon: 'tabler-building-warehouse'     },
  }

  return map[role?.toUpperCase()] ?? { color: 'secondary', icon: 'tabler-user' }
}

export const resolveRoleTitle = role =>
  USER_ROLES.find(r => r.value === role?.toUpperCase())?.title ?? role ?? '—'

export const resolveUserStatusVariant = status => {
  const map = { ACTIVE: 'success', INACTIVE: 'secondary', SUSPENDED: 'error' }

  return map[status?.toUpperCase()] ?? 'primary'
}

/**
 * Arabic label for a status enum. The list, the filter and the detail dialog all
 * render the same `UserResponse.status` value, so they share one lookup rather
 * than each printing the raw `ACTIVE`/`SUSPENDED` token.
 */
export const resolveStatusTitle = status =>
  USER_STATUSES.find(s => s.value === status?.toUpperCase())?.title ?? status ?? '—'

// ─── Composable ───────────────────────────────────────────────────────────────
export const useUsers = () => {
  // ── List State ─────────────────────────────────────────────────────────────
  /** Current page's user rows (from API response content array) */
  const paginatedUsers = ref([])
  const isListLoading   = ref(false)
  const listError       = ref('')

  // ── Counts (from API — independent of page view) ───────────────────────────
  const counts = ref({ active: 0, inactive: 0, suspended: 0, total: 0 })

  // ── Filter / Search State ──────────────────────────────────────────────────
  const searchQuery   = ref('')
  const selectedRole   = ref(null)
  const selectedStatus = ref(null)

  // ── Pagination State ───────────────────────────────────────────────────────
  /** 1-based page (Vuetify convention). Converted to 0-based when calling API. */
  const page         = ref(1)
  const itemsPerPage = ref(10)
  /** totalElements returned by the server */
  const totalUsers   = ref(0)

  // ── Sorting State ─────────────────────────────────────────────────────────
  // VDataTableServer emits `update:options` on mount with an EMPTY `sortBy`,
  // meaning "the user has chosen no column". `updateOptions` below falls back
  // to these defaults for that case. It used to fall back to a hardcoded
  // id/asc, which on a list defaulting to `desc` both overrode the intended
  // order and — because the fallback differed from the current value — counted
  // as a sort change and fired a second request on top of the one onMounted
  // had already issued.
  const DEFAULT_SORT_BY  = 'id'
  const DEFAULT_SORT_DIR = 'asc'

  const sortBy  = ref(DEFAULT_SORT_BY)
  const sortDir = ref(DEFAULT_SORT_DIR)

  // ── Single User State ──────────────────────────────────────────────────────
  const selectedUser    = ref(null)
  const isDetailLoading = ref(false)
  const detailError     = ref('')

  // ── Operation State ────────────────────────────────────────────────────────
  const isSubmitting = ref(false)
  const snackbar     = ref({ show: false, message: '', color: 'success' })

  const showSnackbar = (message, color = 'success') => {
    snackbar.value = { show: true, message, color }
  }

  // ── fetchAllUsers() — calls API with current params ────────────────────────
  const fetchAllUsers = async () => {
    isListLoading.value = true
    listError.value     = ''

    try {
      const data = await fetchUsers({
        search:  searchQuery.value   || undefined,
        role:    selectedRole.value  || undefined,
        status:  selectedStatus.value || undefined,
        page:    page.value - 1,   // convert 1-based UI → 0-based API
        size:    itemsPerPage.value,
        sortBy:  sortBy.value,
        sortDir: sortDir.value,
      })

      // data = { users: { content, page, size, totalElements, totalPages }, counts }
      paginatedUsers.value = data?.users?.content   ?? []
      totalUsers.value     = data?.users?.totalElements ?? 0
      counts.value         = data?.counts ?? { active: 0, inactive: 0, suspended: 0, total: 0 }
    } catch (error) {
      const message = resolveApiError(error, '')
      listError.value = message || 'تعذّر تحميل المستخدمين.'
      showSnackbar(listError.value, 'error')
    } finally {
      isListLoading.value = false
    }
  }

  // ── reloadFromFirstPage() ────────────────────────────────────────
  /**
   * Apply a filter/search/create result: go back to the first page, then load.
   *
   * Assigning `page` fires the page watcher, which loads on its own. Calling
   * the loader here as well would issue the same request twice for anyone who
   * was not already on page 1, so exactly one of the two paths ever runs.
   *
   * @returns {Promise<void>|undefined} resolves once the load this call owns
   *   has finished; `undefined` when the page watcher owns it instead.
   */
  const reloadFromFirstPage = () => {
    if (page.value !== 1) {
      page.value = 1

      return undefined
    }

    return fetchAllUsers()
  }

  // ── Watchers — re-fetch on filter/sort/page/size change ───────────────────

  // Debounce search so we don't fire on every keystroke
  watchDebounced(searchQuery, () => {
    reloadFromFirstPage()
  }, { debounce: 400 })

  // Immediate refetch when filters change (reset to page 1)
  watch([selectedRole, selectedStatus], () => {
    reloadFromFirstPage()
  })

  // Refetch when page or page size changes
  watch([page, itemsPerPage], fetchAllUsers)

  // ── fetchUser(id) ──────────────────────────────────────────────────────────
  const fetchUser = async id => {
    isDetailLoading.value = true
    detailError.value     = ''
    selectedUser.value    = null

    try {
      const data = await fetchUserById(id)
      selectedUser.value = data
    } catch (error) {
      const message = resolveApiError(error, '')
      detailError.value = message || `تعذّر تحميل المستخدم رقم ${id}.`
      showSnackbar(detailError.value, 'error')
    } finally {
      isDetailLoading.value = false
    }
  }

  // ── createUser(payload) ────────────────────────────────────────────────────
  const createUser = async payload => {
    isSubmitting.value = true
    try {
      await createUserService(payload)
      showSnackbar('تم إنشاء المستخدم بنجاح.')
      // Refetch first page to show the new user
      await reloadFromFirstPage()

      return { success: true }
    } catch (error) {
      const message = resolveApiError(error, '')
      showSnackbar(message || 'تعذّر إنشاء المستخدم.', 'error')

      return { success: false, error: message || 'تعذّر إنشاء المستخدم.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── changeUserStatus(id, status) ───────────────────────────────────────────
  const changeUserStatus = async (id, status) => {
    isSubmitting.value = true
    try {
      await updateUserStatusService(id, status)

      // Optimistic local update — avoids a full refetch for inline row actions
      const idx = paginatedUsers.value.findIndex(u => u.id === id)
      if (idx !== -1) paginatedUsers.value[idx] = { ...paginatedUsers.value[idx], status }

      if (selectedUser.value?.id === id) {
        selectedUser.value = { ...selectedUser.value, status }
      }

      // Also refresh counts from the server since a status change affects them
      await fetchAllUsers()
      showSnackbar('تم تحديث حالة المستخدم بنجاح.')

      return { success: true }
    } catch (error) {
      const message = resolveApiError(error, '')
      showSnackbar(message || 'تعذّر تحديث الحالة.', 'error')

      return { success: false, error: message || 'تعذّر تحديث الحالة.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── resetPassword(id, newPassword) ─────────────────────────────────────────
  const resetPassword = async (id, newPassword) => {
    isSubmitting.value = true
    try {
      await resetUserPasswordService(id, newPassword)
      showSnackbar('تمت إعادة تعيين كلمة المرور بنجاح.')

      return { success: true }
    } catch (error) {
      const message = resolveApiError(error, '')
      showSnackbar(message || 'تعذّر إعادة تعيين كلمة المرور.', 'error')

      return { success: false, error: message || 'تعذّر إعادة تعيين كلمة المرور.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── updateOptions (VDataTable @update:options callback) ───────────────────
  /**
   * Called by VDataTable when the user changes sort. We read the first sort
   * entry and map it to our sortBy/sortDir refs, then re-fetch.
   * @param {{ sortBy: Array<{key: string, order: string}> }} options
   */
  const updateOptions = options => {
    const firstSort  = options.sortBy?.[0]
    const newSortBy  = firstSort?.key ?? DEFAULT_SORT_BY
    const newSortDir = firstSort
      ? (firstSort.order === 'desc' ? 'desc' : 'asc')
      : DEFAULT_SORT_DIR

    // Only act when the sort actually changed. VDataTableServer emits
    // `update:options` once on mount with the options it was handed, and
    // reloading on that emit duplicated the mount request from onMounted();
    // it would also fight with TablePagination's own page clicks.
    const sortChanged = newSortBy !== sortBy.value || newSortDir !== sortDir.value

    sortBy.value  = newSortBy
    sortDir.value = newSortDir

    if (sortChanged) reloadFromFirstPage()
  }

  return {
    // List
    paginatedUsers,
    totalUsers,
    isListLoading,
    listError,
    counts,

    // Filters
    searchQuery,
    selectedRole,
    selectedStatus,

    // Pagination
    page,
    itemsPerPage,

    // Sorting
    sortBy,
    sortDir,
    updateOptions,

    // Single user
    selectedUser,
    isDetailLoading,
    detailError,

    // Operations
    isSubmitting,
    snackbar,
    fetchAllUsers,
    fetchUser,
    createUser,
    changeUserStatus,
    resetPassword,
  }
}
