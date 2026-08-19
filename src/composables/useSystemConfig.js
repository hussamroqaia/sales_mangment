/**
 * useSystemConfig.js
 *
 * Central composable for the System Configuration module.
 *
 * Architecture:
 *   UI → useSystemConfig (catalogue + role gating + save state) → config.service
 *
 * ─── Curated keys, deliberately ─────────────────────────────────────────────
 * PUT /config/{key} does NOT validate the key against the backend's ConfigKey
 * class, so any string creates a row — and nothing in the system ever reads an
 * unrecognised key. A free-text key field would therefore let an admin create
 * permanent invisible junk. The catalogue below mirrors ConfigKey so the UI can
 * only write keys that something actually consumes.
 *
 * This list has to track the backend: when ConfigKey gains a member, add it
 * here or the new setting stays invisible (it will still render, read-only, via
 * the unrecognised-key path below, so nothing is silently lost).
 *
 * ─── Roles ──────────────────────────────────────────────────────────────────
 *   read  (GET)  → ADMIN, SALES_MANAGER
 *   write (PUT)  → ADMIN only
 */

import {
  fetchSystemConfig,
  upsertSystemConfig,
} from '@/services/config.service'
import { useAuth } from '@/composables/useAuth'
import { INTL_LOCALE } from '@/utils/locale'

const CONFIG_READ_ROLES  = ['admin', 'sales_manager']
const CONFIG_WRITE_ROLES = ['admin']

/** The only valueType the backend's ValueType enum accepts. */
export const CONFIG_VALUE_TYPE_INT = 'INT'

/** Mirrors com.salesmanagement.systemconfig.api.ConfigKey. */
export const KNOWN_CONFIG_KEYS = [
  {
    key: 'TRACKING_ACTIVE_WINDOW_MINUTES',
    label: 'مدة اعتبار المندوب نشطًا',
    unit: 'دقيقة',
    valueType: CONFIG_VALUE_TYPE_INT,
    hint: 'أقصى مدة منذ آخر تحديث لموقع المندوب ليظل محسوبًا كنشط على خريطة التتبع المباشر.',
  },
]

// Matches the backend's Integer.parseInt(value.trim()) — nothing else is valid
// for an INT key, so the UI refuses it before the request is made.
const INTEGER_PATTERN = /^-?\d+$/

/** @returns {string} an error message, or '' when the value is acceptable */
export const validateConfigValue = (value, valueType) => {
  const trimmed = (value ?? '').trim()

  if (!trimmed) return 'A value is required.'
  if (trimmed.length > 255) return 'يجب ألّا تتجاوز القيمة 255 حرفًا.'

  if (valueType === CONFIG_VALUE_TYPE_INT && !INTEGER_PATTERN.test(trimmed))
    return 'يجب أن تكون قيمة هذا الإعداد رقمًا صحيحًا.'

  return ''
}

export const formatConfigTimestamp = value => {
  if (!value) return '—'

  const d = new Date(value)

  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat(INTL_LOCALE, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(d)
}

// ─── Composable ───────────────────────────────────────────────────────────────
export const useSystemConfig = () => {
  const { userData } = useAuth()

  const role = computed(() => userData.value?.role?.toLowerCase() ?? null)

  const canReadConfig  = computed(() => CONFIG_READ_ROLES.includes(role.value))
  const canWriteConfig = computed(() => CONFIG_WRITE_ROLES.includes(role.value))

  // ── State ───────────────────────────────────────────────────────────────────
  const overrides   = ref([])     // raw ConfigResponse rows currently set
  const isLoading   = ref(false)
  const loadError   = ref('')
  const hasLoaded   = ref(false)

  const isSaving    = ref(false)
  const saveError   = ref('')

  const snackbar = ref({ show: false, message: '', color: 'success' })

  const showSnackbar = (message, color = 'success') => {
    snackbar.value = { show: true, message, color }
  }

  const overrideByKey = computed(() =>
    new Map(overrides.value.map(row => [row.key, row])))

  /**
   * The curated settings, each joined to its override when one exists.
   * A key with no override is a valid state — the backend simply has no row —
   * so it renders as "Not set" rather than as an error or a fabricated default.
   */
  const settings = computed(() => KNOWN_CONFIG_KEYS.map(known => {
    const override = overrideByKey.value.get(known.key) ?? null

    return {
      ...known,
      isSet: Boolean(override),
      value: override?.value ?? null,
      description: override?.description ?? null,
      updatedAt: override?.updatedAt ?? null,
    }
  }))

  /**
   * Overrides the backend holds for keys this build does not recognise.
   *
   * Surfaced read-only rather than hidden: the curated list must not conceal
   * real rows that exist in the database, whether they came from an older UI,
   * a direct API call, or a backend that has moved ahead of this frontend.
   */
  const unrecognisedOverrides = computed(() => {
    const known = new Set(KNOWN_CONFIG_KEYS.map(k => k.key))

    return overrides.value.filter(row => !known.has(row.key))
  })

  // ── Load ────────────────────────────────────────────────────────────────────
  const loadConfig = async () => {
    if (!canReadConfig.value) return

    isLoading.value = true
    loadError.value = ''

    try {
      const data = await fetchSystemConfig()

      overrides.value = Array.isArray(data) ? data : []
      hasLoaded.value = true
    } catch (error) {
      overrides.value = []
      hasLoaded.value = true
      loadError.value = error?.response?.data?.message || 'تعذّر تحميل إعدادات النظام.'
    } finally {
      isLoading.value = false
    }
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  /**
   * Write one setting. The key and valueType come from the catalogue, never
   * from user input, so an unknown key can't be created from this UI.
   *
   * @param {{ key: string, valueType: string }} setting
   * @param {{ value: string, description?: string }} form
   * @returns {Promise<boolean>} true when saved
   */
  const saveSetting = async (setting, form) => {
    if (!canWriteConfig.value) return false
    if (isSaving.value) return false

    const validation = validateConfigValue(form.value, setting.valueType)

    if (validation) {
      saveError.value = validation

      return false
    }

    isSaving.value = true
    saveError.value = ''

    try {
      const saved = await upsertSystemConfig(setting.key, {
        value: form.value.trim(),
        valueType: setting.valueType,
        description: form.description?.trim() || undefined,
      })

      // Replace the row in place so the table reflects the server's response
      // (including its updatedAt) rather than an optimistic guess.
      const next = overrides.value.filter(row => row.key !== setting.key)

      overrides.value = [...next, saved].sort((a, b) => a.key.localeCompare(b.key))

      showSnackbar('تم تحديث الإعداد.')

      return true
    } catch (error) {
      saveError.value = error?.response?.data?.message || 'تعذّر تحديث هذا الإعداد.'
      showSnackbar(saveError.value, 'error')

      return false
    } finally {
      isSaving.value = false
    }
  }

  return {
    // Gating
    role,
    canReadConfig,
    canWriteConfig,

    // Data
    settings,
    unrecognisedOverrides,
    isLoading,
    loadError,
    hasLoaded,
    loadConfig,

    // Write
    isSaving,
    saveError,
    saveSetting,

    snackbar,
  }
}
