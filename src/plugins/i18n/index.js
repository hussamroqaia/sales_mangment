import { createI18n } from 'vue-i18n'
import ar from './locales/ar.json'

/**
 * i18n — Arabic only.
 *
 * The application ships in a single locale (Arabic, RTL). There is no locale
 * negotiation, no persisted `language` cookie, and no switcher UI: `ar` is the
 * locale, the fallback, and the only bundled message set.
 *
 * The instance is still a real vue-i18n instance because Vuetify's own strings
 * are served through `createVueI18nAdapter` (see plugins/vuetify/index.js) and
 * the layout's nav items resolve their titles through it.
 */
export const APP_LOCALE = 'ar'

let _i18n = null

export const getI18n = () => {
  if (_i18n === null) {
    _i18n = createI18n({
      legacy: false,
      locale: APP_LOCALE,
      fallbackLocale: APP_LOCALE,
      messages: { ar },

      // Every key that is not in ar.json is rendered as-is (already Arabic in
      // the templates), so the missing-key warnings are noise here.
      missingWarn: false,
      fallbackWarn: false,
    })
  }

  return _i18n
}

export default function (app) {
  app.use(getI18n())
}
