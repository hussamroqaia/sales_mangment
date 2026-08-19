export const paginationMeta = (options, total) => {
  const start = (options.page - 1) * options.itemsPerPage + 1
  const end = Math.min(options.page * options.itemsPerPage, total)

  if (!total) return 'لا توجد سجلات'

  return `عرض ${start} إلى ${end} من أصل ${total} سجل`
}
