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

export const resolveStatusVariant = status => {
  const map = { ACTIVE: 'success', INACTIVE: 'secondary', SUSPENDED: 'error' }

  return map[status?.toUpperCase()] ?? 'primary'
}

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

  // ── Sorting State ──────────────────────────────────────────────────────────
  const sortBy  = ref('id')
  const sortDir = ref('asc')

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
      const message = error?.response?.data?.message
      listError.value = message || 'تعذّر تحميل المستخدمين.'
      showSnackbar(listError.value, 'error')
    } finally {
      isListLoading.value = false
    }
  }

  // ── Watchers — re-fetch on filter/sort/page/size change ───────────────────

  // Debounce search so we don't fire on every keystroke
  watchDebounced(searchQuery, () => {
    page.value = 1
    fetchAllUsers()
  }, { debounce: 400 })

  // Immediate refetch when filters change (reset to page 1)
  watch([selectedRole, selectedStatus], () => {
    page.value = 1
    fetchAllUsers()
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
      const message = error?.response?.data?.message
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
      page.value = 1
      await fetchAllUsers()

      return { success: true }
    } catch (error) {
      const message = error?.response?.data?.message
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
      const message = error?.response?.data?.message
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
      const message = error?.response?.data?.message
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
    const firstSort = options.sortBy?.[0]
    if (firstSort) {
      sortBy.value  = firstSort.key
      sortDir.value = firstSort.order === 'desc' ? 'desc' : 'asc'
    } else {
      sortBy.value  = 'id'
      sortDir.value = 'asc'
    }
    page.value = 1
    fetchAllUsers()
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
