/**
 * notification-text.js
 *
 * Arabic wording for backend notifications, in a form the Firebase service
 * worker can consume.
 *
 * The SW runs outside Vite and cannot import ES modules, so it pulls this file
 * in with `importScripts()` and reads `self.NOTIFICATION_TEXT`.
 *
 * ⚠️ This is a MIRROR of `src/utils/notificationText.js`, which is what the
 * running app uses. The two must be edited together — a phrase added on one
 * side and not the other means the in-app notification and the OS notification
 * for the same event disagree.
 *
 * Behaviour matches the module exactly: exact-match titles are swapped, message
 * templates are rebuilt so names and record numbers survive, and anything
 * unrecognised is passed through unchanged rather than guessed at.
 */

self.NOTIFICATION_TEXT = (() => {
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

  const MESSAGES = [
    {
      pattern: /^(.+?) submitted invoice #(\d+) for review\.?$/i,
      build: (name, id) => 'أرسل ' + name + ' الفاتورة رقم ' + id + ' للمراجعة.',
    },
    {
      pattern: /^invoice #(\d+) was approved\.?$/i,
      build: id => 'تمت الموافقة على الفاتورة رقم ' + id + '.',
    },
    {
      pattern: /^invoice #(\d+) was rejected\.?$/i,
      build: id => 'تم رفض الفاتورة رقم ' + id + '.',
    },
    {
      pattern: /^(.+?) submitted demand order #(\d+)\.?$/i,
      build: (name, id) => 'أرسل ' + name + ' طلب التزويد رقم ' + id + '.',
    },
    {
      pattern: /^demand order #(\d+) was loaded onto the van\.?$/i,
      build: id => 'تم تحميل طلب التزويد رقم ' + id + ' على المركبة.',
    },
    {
      pattern: /^(.+?) submitted return sheet #(\d+)\.?$/i,
      build: (name, id) => 'أرسل ' + name + ' كشف المرتجعات رقم ' + id + '.',
    },
    {
      pattern: /^return sheet #(\d+) was completed\.?$/i,
      build: id => 'تم إكمال كشف المرتجعات رقم ' + id + '.',
    },
    {
      pattern: /^product (.+?) is below its minimum stock level\.?$/i,
      build: name => 'المنتج ' + name + ' أقل من الحد الأدنى للمخزون.',
    },
  ]

  return {
    title: value => {
      if (!value || typeof value !== 'string') return value

      return TITLES[value.trim().toLowerCase()] || value
    },
    message: value => {
      if (!value || typeof value !== 'string') return value

      const text = value.trim()

      for (let i = 0; i < MESSAGES.length; i++) {
        const match = text.match(MESSAGES[i].pattern)

        if (match) return MESSAGES[i].build.apply(null, match.slice(1))
      }

      return value
    },
  }
})()
