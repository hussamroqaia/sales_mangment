/**
 * useUsers.js
 *
 * Central composable for the User Management module.
 * Manages all state and business logic. UI components call ONLY this composable.
 *
 * Responsibilities:
 *  - User list state (loading, data, filters, pagination)
 *  - Single user detail state
 *  - Create user / update status / reset password operations
 *  - Snackbar feedback for all operations
 */

import {
  fetchUsers,
  fetchUserById,
  createUser as createUserService,
  updateUserStatus as updateUserStatusService,
  resetUserPassword as resetUserPasswordService,
} from '@/services/user.service'

// ─── Role / Status display helpers (shared across components) ─────────────────
export const USER_ROLES = [
  { title: 'Admin', value: 'ADMIN' },
  { title: 'Sales Manager', value: 'SALES_MANAGER' },
  { title: 'Sales Rep', value: 'SALES_REP' },
  { title: 'Warehouse Manager', value: 'WAREHOUSE_MANAGER' },
]

export const USER_STATUSES = [
  { title: 'Active', value: 'ACTIVE' },
  { title: 'Inactive', value: 'INACTIVE' },
  { title: 'Suspended', value: 'SUSPENDED' },
]

export const resolveRoleVariant = role => {
  const map = {
    ADMIN:             { color: 'primary',  icon: 'tabler-crown'         },
    SALES_MANAGER:     { color: 'info',     icon: 'tabler-chart-bar'     },
    SALES_REP:         { color: 'success',  icon: 'tabler-user-dollar'   },
    WAREHOUSE_MANAGER: { color: 'warning',  icon: 'tabler-building-warehouse' },
  }

  return map[role?.toUpperCase()] ?? { color: 'secondary', icon: 'tabler-user' }
}

// Resolves the human-readable label for a role value (e.g. SALES_MANAGER → "Sales Manager")
export const resolveRoleTitle = role => {
  return USER_ROLES.find(r => r.value === role?.toUpperCase())?.title ?? role ?? '—'
}

export const resolveStatusVariant = status => {
  const map = {
    ACTIVE: 'success',
    INACTIVE: 'secondary',
    SUSPENDED: 'error',
  }

  return map[status?.toUpperCase()] ?? 'primary'
}

// ─── Composable ───────────────────────────────────────────────────────────────
export const useUsers = () => {
  // ── List State ─────────────────────────────────────────────────────────────
  const users = ref([])
  const isListLoading = ref(false)
  const listError = ref('')

  // Client-side search & filter (the API returns the full list in one call)
  const searchQuery = ref('')
  const selectedRole = ref(null)
  const selectedStatus = ref(null)

  // Pagination
  const page = ref(1)
  const itemsPerPage = ref(10)
  const sortBy = ref([])

  // ── Single User State ──────────────────────────────────────────────────────
  const selectedUser = ref(null)
  const isDetailLoading = ref(false)
  const detailError = ref('')

  // ── Operation State ────────────────────────────────────────────────────────
  const isSubmitting = ref(false)
  const snackbar = ref({
    show: false,
    message: '',
    color: 'success',
  })

  const showSnackbar = (message, color = 'success') => {
    snackbar.value = { show: true, message, color }
  }

  // ── Filtered + Paginated Users (computed from full list) ───────────────────
  const filteredUsers = computed(() => {
    let result = users.value

    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase()
      result = result.filter(u =>
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q),
      )
    }

    if (selectedRole.value) {
      result = result.filter(u => u.role?.toUpperCase() === selectedRole.value)
    }

    if (selectedStatus.value) {
      result = result.filter(u => u.status?.toUpperCase() === selectedStatus.value)
    }

    return result
  })

  const totalUsers = computed(() => filteredUsers.value.length)

  const paginatedUsers = computed(() => {
    if (itemsPerPage.value === -1) return filteredUsers.value
    const start = (page.value - 1) * itemsPerPage.value

    return filteredUsers.value.slice(start, start + itemsPerPage.value)
  })

  // ── fetchAllUsers() ────────────────────────────────────────────────────────
  const fetchAllUsers = async () => {
    isListLoading.value = true
    listError.value = ''

    try {
      const data = await fetchUsers()

      users.value = Array.isArray(data) ? data : []
    } catch (error) {
      const message = error?.response?.data?.message
      listError.value = message || 'Failed to load users.'
      showSnackbar(listError.value, 'error')
    } finally {
      isListLoading.value = false
    }
  }

  // ── fetchUser(id) ──────────────────────────────────────────────────────────
  const fetchUser = async id => {
    isDetailLoading.value = true
    detailError.value = ''
    selectedUser.value = null

    try {
      const data = await fetchUserById(id)

      selectedUser.value = data
    } catch (error) {
      const message = error?.response?.data?.message
      detailError.value = message || `Failed to load user #${id}.`
      showSnackbar(detailError.value, 'error')
    } finally {
      isDetailLoading.value = false
    }
  }

  // ── createUser(payload) ────────────────────────────────────────────────────
  /**
   * @param {{ name: string, email: string, password: string, role: string }} payload
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  const createUser = async payload => {
    isSubmitting.value = true

    try {
      const newUser = await createUserService(payload)

      // Optimistically prepend new user to list
      users.value = [newUser, ...users.value]
      showSnackbar('User created successfully.')

      return { success: true }
    } catch (error) {
      const message = error?.response?.data?.message

      showSnackbar(message || 'Failed to create user.', 'error')

      return { success: false, error: message || 'Failed to create user.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── changeUserStatus(id, status) ───────────────────────────────────────────
  /**
   * @param {number|string} id
   * @param {'ACTIVE'|'INACTIVE'|'SUSPENDED'} status
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  const changeUserStatus = async (id, status) => {
    isSubmitting.value = true

    try {
      await updateUserStatusService(id, status)

      // Update local list in-place — no refetch needed
      const idx = users.value.findIndex(u => u.id === id)
      if (idx !== -1) users.value[idx] = { ...users.value[idx], status }

      // Update selected user if open
      if (selectedUser.value?.id === id) {
        selectedUser.value = { ...selectedUser.value, status }
      }

      showSnackbar('User status updated successfully.')

      return { success: true }
    } catch (error) {
      const message = error?.response?.data?.message

      showSnackbar(message || 'Failed to update status.', 'error')

      return { success: false, error: message || 'Failed to update status.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── resetPassword(id, newPassword) ─────────────────────────────────────────
  /**
   * @param {number|string} id
   * @param {string} newPassword
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  const resetPassword = async (id, newPassword) => {
    isSubmitting.value = true

    try {
      await resetUserPasswordService(id, newPassword)
      showSnackbar('Password reset successfully.')

      return { success: true }
    } catch (error) {
      const message = error?.response?.data?.message

      showSnackbar(message || 'Failed to reset password.', 'error')

      return { success: false, error: message || 'Failed to reset password.' }
    } finally {
      isSubmitting.value = false
    }
  }

  // ── updateOptions (VDataTable callback) ────────────────────────────────────
  const updateOptions = options => {
    sortBy.value = options.sortBy ?? []
    // Reset to page 1 on sort change
    if (options.sortBy?.length) page.value = 1
  }

  return {
    // List state
    users,
    filteredUsers,
    paginatedUsers,
    totalUsers,
    isListLoading,
    listError,

    // Filters
    searchQuery,
    selectedRole,
    selectedStatus,

    // Pagination
    page,
    itemsPerPage,
    sortBy,
    updateOptions,

    // Single user
    selectedUser,
    isDetailLoading,
    detailError,

    // Operation state
    isSubmitting,
    snackbar,

    // Methods
    fetchAllUsers,
    fetchUser,
    createUser,
    changeUserStatus,
    resetPassword,
  }
}
