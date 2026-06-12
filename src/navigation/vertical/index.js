// Vertical navigation — clean project-specific config.
// Only User Management is exposed. All Vuexy demo nav entries are removed.

export default [
  {
    title: 'Dashboard',
    icon: { icon: 'tabler-smart-home' },
    to: 'dashboards-analytics',
    action: 'read',
    subject: 'Auth',
  },
  {
    heading: 'Management',
    action: 'manage',
    subject: 'all',
  },
  {
    title: 'User Management',
    icon: { icon: 'tabler-users' },
    to: 'apps-user-list',
    action: 'manage',
    subject: 'all',
  },
  {
    title: 'Territories',
    icon: { icon: 'tabler-map-pins' },
    to: 'apps-territory-list',
    action: 'read',
    subject: 'Auth',
  },
  {
    title: 'Customers',
    icon: { icon: 'tabler-users-group' },
    to: 'apps-customer-list',
    action: 'read',
    subject: 'Auth',
  },
]
