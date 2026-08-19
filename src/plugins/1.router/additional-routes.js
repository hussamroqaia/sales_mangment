// 👉 Redirects
export const redirects = [
  // ℹ️ Landing redirect. Role is only used to pick the entry screen; real access
  // control is enforced by CASL abilities in guards.js.
  {
    path: '/',
    name: 'index',
    redirect: to => {
      const userData = useCookie('userData')
      const accessToken = useCookie('accessToken')
      const refreshToken = useCookie('refreshToken')

      // If there is no active or refreshable session, always go to login
      const isLoggedIn = !!(userData.value && (accessToken.value || refreshToken.value))
      if (!isLoggedIn)
        return { name: 'login', query: to.query }

      const userRole = userData.value?.role?.toLowerCase()

      if (['admin', 'sales_manager', 'sales_rep', 'warehouse_manager'].includes(userRole))
        return { name: 'dashboards-analytics' }

      return { name: 'login', query: to.query }
    },
  },
]

// ℹ️ Every application page under src/pages is registered automatically by
// unplugin-vue-router, and its definePage() block owns the route meta.
//
// ⚠️ Do NOT add a manual route for a page that IS auto-generated (e.g.
// /products, /visits, /tracking, /apps/territory/list, /apps/customer/list,
// /routes, /demand-orders). A manual duplicate with the same name creates two
// route records, which makes the <Suspense> wrapper fail with "slots expect a
// single root node" and renders the page blank on hard refresh.
//
// Only add an entry here when the auto-generated route is genuinely missing
// (verify with a "No match for {name:...}" error after a dev-server restart).
export const routes = []
