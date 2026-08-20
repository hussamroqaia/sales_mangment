/**
 * phone.js
 *
 * Syrian phone numbers are the account identifier everywhere in this app —
 * the backend's LoginRequest and CreateUserRequest both take `phoneNumber`
 * and there is no email field on a user at all.
 *
 * The wire format is E.164 without separators: `+963` followed by exactly
 * 9 digits (e.g. `+963981491713`). Forms never ask the user to type the
 * country code: the field renders `+963` as a fixed prefix and binds only
 * the 9-digit local part, so an out-of-country number cannot be entered by
 * accident. `toLocalPhone` still accepts the other shapes people paste
 * (`+963…`, `00963…`, `963…`, `0…`) and reduces them to that local part.
 *
 * Auto-imported: `src/utils` is in the AutoImport `dirs` list (vite.config.js),
 * so these are available in any component without an import statement.
 */

/** Country calling code — the only one this app accepts. */
export const SYRIA_DIAL_CODE = '+963'

/** Digits expected after the dial code. */
export const SYRIA_PHONE_LENGTH = 9

/**
 * Reduce any user-supplied form of a Syrian number to its 9-digit local part.
 * Returns '' when nothing usable is left, and never returns more than 9 digits
 * so it can be used as an input filter while typing.
 *
 * @param {string|number|null|undefined} value
 * @returns {string}
 */
export const toLocalPhone = value => {
  let digits = String(value ?? '').replace(/\D/g, '')

  // Strip an international prefix, but only when doing so still leaves
  // something — a bare "963123456" is itself a valid 9-digit local number.
  if (digits.startsWith('00963') && digits.length > 5)
    digits = digits.slice(5)
  else if (digits.startsWith('963') && digits.length > SYRIA_PHONE_LENGTH)
    digits = digits.slice(3)

  // National trunk prefix: 0981491713 → 981491713
  if (digits.startsWith('0') && digits.length > SYRIA_PHONE_LENGTH)
    digits = digits.slice(1)

  return digits.slice(0, SYRIA_PHONE_LENGTH)
}

/**
 * Build the wire format the API expects from a 9-digit local part.
 * Anything the local part is missing is passed through untouched so a
 * half-typed value never silently becomes a valid-looking number.
 *
 * @param {string} local
 * @returns {string}
 */
export const toFullPhone = local => {
  const digits = toLocalPhone(local)

  return digits.length === SYRIA_PHONE_LENGTH ? `${SYRIA_DIAL_CODE}${digits}` : ''
}

/**
 * Display form: `+963 981 491 713`. Falls back to the raw value for anything
 * that is not a Syrian number (legacy rows), and to an em dash for blanks.
 * Render inside `dir="ltr"` so the RTL layout does not reorder the groups.
 *
 * @param {string|null|undefined} value
 * @returns {string}
 */
export const formatPhoneNumber = value => {
  const raw = String(value ?? '').trim()

  if (!raw) return '—'

  const local = toLocalPhone(raw)

  if (local.length !== SYRIA_PHONE_LENGTH) return raw

  return `${SYRIA_DIAL_CODE} ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`
}

/**
 * Vuetify rule for a field bound to the 9-digit local part (the `+963` is
 * supplied by the input's prefix, not by the user).
 */
export const localPhoneValidator = value => {
  const local = String(value ?? '').trim()

  if (!local) return 'رقم الهاتف مطلوب'

  if (!/^\d+$/.test(local)) return 'يجب أن يتكوّن رقم الهاتف من أرقام فقط'

  if (local.length !== SYRIA_PHONE_LENGTH)
    return `يجب أن يتكوّن رقم الهاتف من ${SYRIA_PHONE_LENGTH} أرقام بعد ${SYRIA_DIAL_CODE}`

  return true
}
