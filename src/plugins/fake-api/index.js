import { setupWorker } from 'msw/browser'

// Handlers
import { handlerAppBarSearch } from '@db/app-bar-search/index'
import { handlerAppsAcademy } from '@db/apps/academy/index'
import { handlerAppsCalendar } from '@db/apps/calendar/index'
import { handlerAppsChat } from '@db/apps/chat/index'
import { handlerAppsEcommerce } from '@db/apps/ecommerce/index'
import { handlerAppsEmail } from '@db/apps/email/index'
import { handlerAppsInvoice } from '@db/apps/invoice/index'
import { handlerAppsKanban } from '@db/apps/kanban/index'
import { handlerAppLogistics } from '@db/apps/logistics/index'
import { handlerAppsPermission } from '@db/apps/permission/index'
// handlerAppsUsers intentionally removed — /api/users/* routes are handled
// by the real backend via the Vite dev proxy (see vite.config.js server.proxy).
// handlerAuth intentionally removed — auth routes (/api/auth/*) are handled
// by the real backend via the Vite dev proxy (see vite.config.js server.proxy).
import { handlerDashboard } from '@db/dashboard/index'
import { handlerPagesDatatable } from '@db/pages/datatable/index'
import { handlerPagesFaq } from '@db/pages/faq/index'
import { handlerPagesHelpCenter } from '@db/pages/help-center/index'
import { handlerPagesProfile } from '@db/pages/profile/index'

const worker = setupWorker(...handlerAppsEcommerce, ...handlerAppsAcademy, ...handlerAppsInvoice, ...handlerAppsEmail, ...handlerAppsCalendar, ...handlerAppsChat, ...handlerAppsPermission, ...handlerPagesHelpCenter, ...handlerPagesProfile, ...handlerPagesFaq, ...handlerPagesDatatable, ...handlerAppBarSearch, ...handlerAppLogistics, ...handlerAppsKanban, ...handlerDashboard)
export default function () {
  const workerUrl = `${import.meta.env.BASE_URL ?? '/'}mockServiceWorker.js`

  worker.start({
    serviceWorker: {
      url: workerUrl,
    },
    // Silently bypass all requests that don't match a mock handler.
    // This covers Vite module requests, external tile/geocoding URLs, etc.
    onUnhandledRequest: 'bypass',
  })
}
