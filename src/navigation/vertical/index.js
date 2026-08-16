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
  {
    // ADMIN + SALES_MANAGER only — WAREHOUSE_MANAGER has no invoice access,
    // and the SALES_REP half of the lifecycle lives in the mobile client.
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
    subject: 'Auth',
  },
  {
    title: 'Warehouse Stock',
    icon: { icon: 'tabler-building-warehouse' },
    to: 'warehouse-stock',
    action: 'manage',
    subject: 'Warehouse',
  },
  {
    // ADMIN + SALES_MANAGER + WAREHOUSE_MANAGER. Which report categories are
    // offered inside the page depends on the role, mirroring the backend's own
    // @PreAuthorize split. SALES_REP holds no `Reports` ability.
    title: 'Reports',
    icon: { icon: 'tabler-report-analytics' },
    to: 'reports',
    action: 'read',
    subject: 'Reports',
  },
  {
    title: 'Logistics',
    icon: { icon: 'tabler-truck' },
    action: 'read',
    subject: 'Auth',
    children: [
      {
        title: 'Demand Orders',
        icon: { icon: 'tabler-truck-delivery' },
        to: 'demand-orders',
        action: 'read',
        subject: 'Auth',
      },
      {
        title: 'Return Sheets',
        icon: { icon: 'tabler-truck-return' },
        to: 'return-sheets',
        action: 'read',
        subject: 'Auth',
      },
      {
        title: 'Van Inventory',
        icon: { icon: 'tabler-box-seam' },
        to: 'van-inventory',
        action: 'read',
        subject: 'Auth',
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
        subject: 'Auth',
      },
      {
        // ADMIN + SALES_MANAGER only — same ability as Routes, which is exactly
        // the role set the tracking endpoints allow.
        title: 'Tracking',
        icon: { icon: 'tabler-current-location' },
        to: 'tracking',
        action: 'manage',
        subject: 'Routes',
      },
    ],
  },
]
