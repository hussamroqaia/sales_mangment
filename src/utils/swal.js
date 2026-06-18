/**
 * swal.js
 *
 * Thin wrapper around SweetAlert2, themed to match the Vuexy / Vuetify palette.
 *
 * We disable SweetAlert's own button styling (`buttonsStyling: false`) and map the
 * buttons onto Vuetify's `.v-btn` classes so confirmations look native to the app
 * in both light and dark themes.
 *
 * Usage:
 *   import { confirmAction } from '@/utils/swal'
 *   const ok = await confirmAction({ title: 'Load Van?', text: '…', confirmText: 'Load' })
 *   if (ok) { ... }
 */

import Swal from 'sweetalert2'

// Shared instance with Vuetify-flavoured classes.
const themedSwal = Swal.mixin({
  buttonsStyling: false,
  reverseButtons: true,
  customClass: {
    popup: 'v-card v-card--variant-elevated rounded-lg',
    confirmButton: 'v-btn v-btn--elevated v-theme--light bg-primary px-5 me-3',
    cancelButton: 'v-btn v-btn--variant-tonal text-secondary px-5',
    actions: 'gap-2',
  },
})

/**
 * Show a confirm dialog. Resolves to `true` if the user confirmed, else `false`.
 *
 * @param {Object}  opts
 * @param {string}  opts.title        - Dialog title
 * @param {string}  [opts.text]       - Body text
 * @param {string}  [opts.confirmText='Confirm']
 * @param {string}  [opts.cancelText='Cancel']
 * @param {'warning'|'question'|'info'|'success'|'error'} [opts.icon='warning']
 * @returns {Promise<boolean>}
 */
export const confirmAction = async ({
  title,
  text = '',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  icon = 'warning',
} = {}) => {
  const result = await themedSwal.fire({
    title,
    text,
    icon,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    focusCancel: true,
  })

  return result.isConfirmed
}

/** Lightweight success toast (top-end, auto-dismiss). */
export const toastSuccess = (title = 'Done') =>
  themedSwal.fire({
    toast: true,
    position: 'top-end',
    icon: 'success',
    title,
    showConfirmButton: false,
    timer: 2500,
    timerProgressBar: true,
  })

export default themedSwal
