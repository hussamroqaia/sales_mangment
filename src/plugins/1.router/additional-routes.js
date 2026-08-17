const emailRouteComponent = () => import('@/pages/apps/email/index.vue')

// 👉 Redirects
export const redirects = [
  // ℹ️ We are redirecting to different pages based on role.
  // NOTE: Role is just for UI purposes. ACL is based on abilities.
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

      if (userRole === 'admin')
        return { name: 'dashboards-crm' }
      if (['sales_manager', 'sales_rep', 'warehouse_manager'].includes(userRole))
        return { name: 'dashboards-analytics' }

      return { name: 'login', query: to.query }
    },
  },
  {
    path: '/pages/user-profile',
    name: 'pages-user-profile',
    redirect: () => ({ name: 'pages-user-profile-tab', params: { tab: 'profile' } }),
  },
  {
    path: '/pages/account-settings',
    name: 'pages-account-settings',
    redirect: () => ({ name: 'pages-account-settings-tab', params: { tab: 'account' } }),
  },
]
export const routes = [
  // Email filter
  {
    path: '/apps/email/filter/:filter',
    name: 'apps-email-filter',
    component: emailRouteComponent,
    meta: {
      navActiveLink: 'apps-email',
      layoutWrapperClasses: 'layout-content-height-fixed',
    },
  },

  // Email label
  {
    path: '/apps/email/label/:label',
    name: 'apps-email-label',
    component: emailRouteComponent,
    meta: {
      // contentClass: 'email-application',
      navActiveLink: 'apps-email',
      layoutWrapperClasses: 'layout-content-height-fixed',
    },
  },
  {
    path: '/dashboards/logistics',
    name: 'dashboards-logistics',
    component: () => import('@/pages/apps/logistics/dashboard.vue'),
  },
  {
    path: '/dashboards/academy',
    name: 'dashboards-academy',
    component: () => import('@/pages/apps/academy/dashboard.vue'),
  },
  {
    path: '/apps/ecommerce/dashboard',
    name: 'apps-ecommerce-dashboard',
    component: () => import('@/pages/dashboards/ecommerce.vue'),
  },

  // ℹ️ /products, /visits and /visits/:id were registered here manually, from a
  // time when the parentheses in the project directory name ("مجلد جديد (2)")
  // stopped fast-glob from scanning src/pages/. The globSafePath fix in
  // vite.config.js resolved that, and all three ARE auto-generated now —
  // confirmed by reading the router's own generated module:
  //
  //   curl "http://localhost:<port>/@id/virtual:vue-router/auto-routes"
  //
  // which lists '/products', '/visits' and '/visits/:id' with their
  // definePage() meta imported. Keeping the manual copies made each of them a
  // duplicate record, which is exactly the failure the products page warns
  // about — vue-router drops the auto-generated record and the surviving one
  // renders blank on hard refresh. They are removed; definePage() now owns
  // registration and meta for all three.

  // ℹ️ /tracking is NOT listed here on purpose. The glob-escaping fix in
  // vite.config.js (globSafePath) made unplugin-vue-router scan src/pages/
  // successfully again, so src/pages/tracking/index.vue IS auto-generated and
  // its definePage() meta is applied. Adding a manual entry would register the
  // path twice — see the warning below.

  // ⚠️ Do NOT add manual routes for pages that ARE auto-generated (e.g.
  // /apps/territory/list, /apps/customer/list, /routes, /demand-orders).
  // definePage() inside the page file handles registration and meta correctly.
  // A manual duplicate with the same name creates two route records, causing
  // the <Suspense> wrapper to fail with "slots expect a single root node".
  // Only add an entry here when the auto-generated route is genuinely missing
  // (verify with a "No match for {name:...}" error after a dev-server restart).
]
