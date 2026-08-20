/**
 * apiErrors.js
 *
 * Turns an Axios failure into an Arabic message for the user.
 *
 * The backend is a separate Spring service that answers in English, and it is
 * not ours to change. Rather than discarding what it says — some of its
 * messages carry information the UI cannot reconstruct, such as which product
 * ran out of stock — this module works in three steps:
 *
 *   1. an exact/known-phrase lookup for the messages the backend repeats often,
 *   2. a status-code fallback covering the generic HTTP failures,
 *   3. the caller's own fallback text for anything unrecognised.
 *
 * When the server sends a message we do not recognise it is still shown, so a
 * meaningful server-side explanation is never swallowed by a vague "حدث خطأ".
 * Those are the only strings in the UI that can surface in English, and only
 * for failures the backend words itself.
 */

/** Known backend phrases → Arabic. Keys are matched case-insensitively. */
const KNOWN_MESSAGES = {
  'bad credentials': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  'invalid email or password': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  'user not found': 'لم يتم العثور على المستخدم.',
  'access denied': 'ليس لديك صلاحية لتنفيذ هذا الإجراء.',
  'unauthorized': 'انتهت الجلسة. الرجاء تسجيل الدخول من جديد.',
  'forbidden': 'ليس لديك صلاحية للوصول إلى هذا المحتوى.',
  'token expired': 'انتهت صلاحية الجلسة. الرجاء تسجيل الدخول من جديد.',
  'invalid token': 'انتهت صلاحية الجلسة. الرجاء تسجيل الدخول من جديد.',
  'current password is incorrect': 'كلمة المرور الحالية غير صحيحة.',
  'email already exists': 'هذا البريد الإلكتروني مسجّل مسبقًا.',
  'insufficient stock': 'الكمية المتوفرة في المخزون غير كافية.',
  'internal server error': 'حدث خطأ في الخادم. الرجاء المحاولة لاحقًا.',

  // The backend's own catch-all for an unhandled 500. It is long enough that
  // the `looksGeneric` heuristic below would keep it verbatim, which put an
  // English sentence on an otherwise Arabic screen (seen on the Routes report
  // endpoints); matching it exactly here is the documented way to fix that.
  'an unexpected error occurred. please try again later.':
    'حدث خطأ في الخادم. الرجاء المحاولة لاحقًا.',
}

/** HTTP status → Arabic, used when the body carries nothing usable. */
const STATUS_MESSAGES = {
  400: 'البيانات المُرسلة غير صحيحة. الرجاء مراجعة الحقول والمحاولة مرة أخرى.',
  401: 'انتهت الجلسة. الرجاء تسجيل الدخول من جديد.',
  403: 'ليس لديك صلاحية لتنفيذ هذا الإجراء.',
  404: 'العنصر المطلوب غير موجود.',
  409: 'تعذّر تنفيذ الإجراء بسبب تعارض في حالة السجل. الرجاء تحديث الصفحة والمحاولة مرة أخرى.',
  413: 'حجم الملف كبير جدًا.',
  422: 'البيانات المُرسلة غير مكتملة أو غير صحيحة.',
  429: 'عدد المحاولات كبير. الرجاء الانتظار قليلًا ثم المحاولة مرة أخرى.',
  500: 'حدث خطأ في الخادم. الرجاء المحاولة لاحقًا.',
  502: 'الخادم غير متاح حاليًا. الرجاء المحاولة لاحقًا.',
  503: 'الخدمة غير متاحة حاليًا. الرجاء المحاولة لاحقًا.',
  504: 'استغرق الخادم وقتًا طويلًا للرد. الرجاء المحاولة مرة أخرى.',
}

/** Translate a raw backend string, or return it unchanged when unknown. */
export const translateBackendMessage = message => {
  if (!message || typeof message !== 'string') return ''

  return KNOWN_MESSAGES[message.trim().toLowerCase()] ?? message.trim()
}

/**
 * @param {unknown} error    the rejected Axios error
 * @param {string}  fallback Arabic text describing the failed operation
 * @returns {string} an Arabic message, or the server's own text when it said
 *                   something specific we do not have a translation for
 */
export const resolveApiError = (error, fallback = 'حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.') => {
  // The request never reached the server.
  if (error?.code === 'ERR_NETWORK' || (!error?.response && error?.request))
    return 'تعذّر الاتصال بالخادم. تحقّق من اتصالك بالإنترنت ثم حاول مرة أخرى.'

  if (error?.code === 'ECONNABORTED')
    return 'استغرق الطلب وقتًا طويلًا. الرجاء المحاولة مرة أخرى.'

  const status = error?.response?.status
  const raw = error?.response?.data?.message || error?.response?.data?.error

  const translated = translateBackendMessage(raw)

  // A phrase we know beats everything else.
  if (translated && translated !== raw) return translated

  // Otherwise prefer the status-specific Arabic text over an English body for
  // the generic failures, and keep the body when it is genuinely specific.
  if (status && STATUS_MESSAGES[status]) {
    const looksGeneric = !raw || raw.length < 12

    return looksGeneric ? STATUS_MESSAGES[status] : raw
  }

  return raw || fallback
}
