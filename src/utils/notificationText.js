/**
 * notificationText.js
 *
 * Arabic presentation for backend notifications.
 *
 * Notifications are composed server-side and arrive in English:
 *
 *   { type: 'INVOICE',
 *     title: 'Invoice awaiting review',
 *     message: 'hasan submitted invoice #15 for review.',
 *     referenceId: 15 }
 *
 * The backend is not ours to change, so the text is translated here — but only
 * where the translation is lossless:
 *
 *   TITLES   are fixed phrases with no embedded data, so they are matched
 *            exactly and swapped for an Arabic equivalent.
 *
 *   MESSAGES carry dynamic parts (a representative's name, a record number).
 *            Each pattern captures those parts and rebuilds the sentence in
 *            Arabic, so nothing the user needs is dropped.
 *
 * Anything that does not match is returned untouched. That is deliberate: a
 * wording change on the server, or a notification type added after this file
 * was written, degrades to English rather than to a wrong or empty message.
 * Add the new phrasing here when that happens.
 */

/** Exact English titles → Arabic. Keys are compared lower-cased and trimmed. */
const TITLES = {
  'invoice awaiting review': 'فاتورة بانتظار المراجعة',
  'invoice approved': 'تمت الموافقة على الفاتورة',
  'invoice rejected': 'تم رفض الفاتورة',
  'demand order submitted': 'طلب تزويد جديد',
  'demand order loaded': 'تم تحميل طلب التزويد',
  'return sheet submitted': 'كشف مرتجعات جديد',
  'return sheet completed': 'تم إكمال كشف المرتجعات',
  'low stock alert': 'تنبيه انخفاض المخزون',
  'stock below minimum': 'المخزون أقل من الحد الأدنى',
  'route assigned': 'تم إسناد مسار',
  'visit missed': 'زيارة فائتة',
}

/**
 * Message templates. Each entry rebuilds the sentence in Arabic from the
 * captured groups, so names and record numbers survive the translation.
 */
const MESSAGES = [
  {
    // "hasan submitted invoice #15 for review."
    pattern: /^(.+?) submitted invoice #(\d+) for review\.?$/i,
    build: (name, id) => `أرسل ${name} الفاتورة رقم ${id} للمراجعة.`,
  },
  {
    // "Invoice #15 was approved."
    pattern: /^invoice #(\d+) was approved\.?$/i,
    build: id => `تمت الموافقة على الفاتورة رقم ${id}.`,
  },
  {
    // "Invoice #15 was rejected."
    pattern: /^invoice #(\d+) was rejected\.?$/i,
    build: id => `تم رفض الفاتورة رقم ${id}.`,
  },
  {
    // "hasan submitted demand order #7."
    pattern: /^(.+?) submitted demand order #(\d+)\.?$/i,
    build: (name, id) => `أرسل ${name} طلب التزويد رقم ${id}.`,
  },
  {
    // "Demand order #7 was loaded onto the van."
    pattern: /^demand order #(\d+) was loaded onto the van\.?$/i,
    build: id => `تم تحميل طلب التزويد رقم ${id} على المركبة.`,
  },
  {
    // "hasan submitted return sheet #4."
    pattern: /^(.+?) submitted return sheet #(\d+)\.?$/i,
    build: (name, id) => `أرسل ${name} كشف المرتجعات رقم ${id}.`,
  },
  {
    // "Return sheet #4 was completed."
    pattern: /^return sheet #(\d+) was completed\.?$/i,
    build: id => `تم إكمال كشف المرتجعات رقم ${id}.`,
  },
  {
    // "Product Mineral Water 500ml is below its minimum stock level."
    pattern: /^product (.+?) is below its minimum stock level\.?$/i,
    build: name => `المنتج ${name} أقل من الحد الأدنى للمخزون.`,
  },
]

/** @returns {string} the Arabic title, or the original when unrecognised. */
export const translateNotificationTitle = title => {
  if (!title || typeof title !== 'string') return title

  return TITLES[title.trim().toLowerCase()] ?? title
}

/** @returns {string} the Arabic message, or the original when unrecognised. */
export const translateNotificationMessage = message => {
  if (!message || typeof message !== 'string') return message

  const text = message.trim()

  for (const { pattern, build } of MESSAGES) {
    const match = text.match(pattern)

    if (match) return build(...match.slice(1))
  }

  return message
}
