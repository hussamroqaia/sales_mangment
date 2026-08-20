/**
 * locale.js
 *
 * Single source of truth for how the app renders dates, times and numbers.
 *
 * The UI is Arabic/RTL, but the digits stay Latin (`-u-nu-latn`): invoice
 * numbers, quantities, prices and IDs are read alongside data that comes
 * straight from the API, and mixing Arabic-Indic digits into those columns
 * makes them hard to scan and impossible to copy back into a search box.
 * Month names, day names and the overall date order are Arabic.
 *
 * Every `Intl.*` call in the app passes `INTL_LOCALE`, so changing the digit
 * system or the region is a one-line edit here.
 *
 * ⚠️ Display only. Values sent to the backend keep their wire format
 * (`YYYY-MM-DD` for calendar dates, ISO-8601 for instants) — never feed a
 * formatted string back into a request.
 *
 * ℹ️ Names here must not collide with the module-specific formatters in
 * `src/composables/*` or `@core/utils/formatters`: everything is auto-imported,
 * and a duplicate export name would silently shadow one of them.
 */

/** BCP-47 tag used for every Intl call in the app. */
export const INTL_LOCALE = 'ar-u-nu-latn'

const formatCount = value => new Intl.NumberFormat(INTL_LOCALE).format(Number(value))

/**
 * Arabic plural picker.
 *
 * Arabic has six plural categories; the four that matter for counted nouns in
 * this UI are singular (1), dual (2), few (3–10) and many (11+). Passing the
 * count through `Intl.PluralRules` keeps the choice correct for 100+ as well.
 *
 * @example pluralAr(n, { one: 'محاولة', two: 'محاولتان', few: 'محاولات', many: 'محاولة' })
 */
export const pluralAr = (count, forms) => {
  const rule = new Intl.PluralRules('ar').select(Number(count))

  return forms[rule] ?? forms.other ?? forms.many ?? forms.one ?? ''
}

/** `3 محاولات` — the count and the correctly inflected noun. */
export const countAr = (count, forms) => `${formatCount(count)} ${pluralAr(count, forms)}`

// Largest-first so the loop below picks the biggest unit the gap still fills.
const RELATIVE_UNITS = [
  { unit: 'second', ms: 1000 },
  { unit: 'minute', ms: 60 * 1000 },
  { unit: 'hour', ms: 60 * 60 * 1000 },
  { unit: 'day', ms: 24 * 60 * 60 * 1000 },
  { unit: 'week', ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
]

/**
 * Relative time in Arabic — "قبل 5 دقائق", "خلال ساعتين".
 *
 * `Intl.RelativeTimeFormat` handles the dual and plural forms, which a manual
 * `${n} دقيقة` template gets wrong for 2 and for 3–10.
 */
export const formatRelativeArabic = value => {
  if (value === null || value === undefined || value === '') return ''

  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''

  const diff = d.getTime() - Date.now()
  const abs = Math.abs(diff)

  if (abs < 45 * 1000) return 'الآن'

  let chosen = RELATIVE_UNITS[0]
  for (const step of RELATIVE_UNITS) {
    if (abs >= step.ms) chosen = step
  }

  return new Intl.RelativeTimeFormat(INTL_LOCALE, { numeric: 'auto' })
    .format(Math.round(diff / chosen.ms), chosen.unit)
}

/**
 * A money-like amount: grouped, always two decimals, and NO currency symbol.
 *
 * No DTO in the API and no entry in `/api/config` declares a currency, so the
 * app must not print one. The products list used to format prices as
 * `style: 'currency', currency: 'USD'` and render "US$ 1,500.00" for a figure
 * the backend never said was in dollars — an invented fact on screen, and out
 * of step with the dashboard and the invoice tables beside it.
 *
 * `null`/`undefined` become '—'; 0 does not — a zero price is real data.
 */
export const formatMoney = value => {
  if (value === null || value === undefined || value === '') return '\u2014'

  const n = Number(value)

  return Number.isNaN(n)
    ? String(value)
    : n.toLocaleString(INTL_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
