// Horizontal navigation.
//
// The application ships with the vertical layout by default (see themeConfig),
// but the horizontal layout stays reachable through the customizer, so this
// config mirrors the vertical menu. The only structural difference is that the
// vertical menu's `heading` separators are dropped — the horizontal nav has no
// section-title item type.
//
// Ability pairs (action/subject) are identical to the vertical menu on purpose:
// they mirror the backend's @PreAuthorize split. Keep the two files in sync.
export default [
  {
    title: 'Dashboard',
    icon: { icon: 'tabler-smart-home' },
    to: 'dashboards-analytics',
    action: 'read',
    subject: 'Auth',
  },
  {
    title: 'Notifications',
    icon: { icon: 'tabler-bell' },
    to: 'notifications',
    action: 'read',
    subject: 'Auth',
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
    subject: 'Management',
  },
  {
    title: 'Customers',
    icon: { icon: 'tabler-users-group' },
    to: 'apps-customer-list',
    action: 'read',
    subject: 'Management',
  },
  {
    title: 'Invoices',
    icon: { icon: 'tabler-file-invoice' },
    to: 'apps-invoice-list',
    action: 'manage',
    subject: 'Invoices',
  },
  {
    title: 'Products',
    icon: { icon: 'tabler-packages' },
    to: 'products',
    action: 'read',
    subject: 'Management',
  },
  {
    title: 'Warehouse Stock',
    icon: { icon: 'tabler-building-warehouse' },
    to: 'warehouse-stock',
    action: 'manage',
    subject: 'Warehouse',
  },
  {
    title: 'Reports',
    icon: { icon: 'tabler-report-analytics' },
    to: 'reports',
    action: 'read',
    subject: 'Reports',
  },
  {
    title: 'System Config',
    icon: { icon: 'tabler-settings-cog' },
    to: 'config',
    action: 'read',
    subject: 'Config',
  },
  {
    title: 'Logistics',
    icon: { icon: 'tabler-truck' },
    action: 'read',
    subject: 'Management',
    children: [
      {
        title: 'Demand Orders',
        icon: { icon: 'tabler-truck-delivery' },
        to: 'demand-orders',
        action: 'read',
        subject: 'Management',
      },
      {
        title: 'Return Sheets',
        icon: { icon: 'tabler-truck-return' },
        to: 'return-sheets',
        action: 'read',
        subject: 'Management',
      },
      {
        title: 'Van Inventory',
        icon: { icon: 'tabler-box-seam' },
        to: 'van-inventory',
        action: 'read',
        subject: 'Management',
      },
      {
        title: 'Routes',
        icon: { icon: 'tabler-route' },
        to: 'routes',
        action: 'manage',
        subject: 'Routes',
      },
      {
        title: 'Visits',
        icon: { icon: 'tabler-map-pin-check' },
        to: 'visits',
        action: 'read',
        subject: 'Management',
      },
      {
        title: 'Tracking',
        icon: { icon: 'tabler-current-location' },
        to: 'tracking',
        action: 'manage',
        subject: 'Routes',
      },
    ],
  },
]
