/**
 * config.service.js
 *
 * Pure service layer — only Axios calls, no state, no composables.
 * The Axios instance (src/services/apiClient.js) auto-attaches the Bearer token.
 *
 * Backend contract (SystemConfigController — @RequestMapping("/api/config")):
 *   GET /config        → List<ConfigResponse>  ADMIN, SALES_MANAGER
 *   GET /config/{key}  → ConfigResponse        ADMIN, SALES_MANAGER
 *   PUT /config/{key}  → ConfigResponse        ADMIN only
 *
 * ConfigResponse: { key, value, valueType, description, updatedAt }
 * UpsertConfigRequest: { value (NotBlank, <=255), valueType (NotBlank, <=20),
 *                        description (<=500, optional) }
 *
 * Server-side validation worth knowing about, because the UI must not offer
 * anything that trips it:
 *   • `valueType` is parsed with ValueType.valueOf() → only "INT" is accepted;
 *     anything else is 400 CONFIG_UNSUPPORTED_TYPE.
 *   • An INT value must parse as an integer → else 400 CONFIG_VALUE_NOT_INT.
 *   • GET /{key} is 404 CONFIG_KEY_NOT_SET when the key was never overridden.
 *
 * NOTE: the {key} path variable is NOT validated against ConfigKey, so `upsert`
 * will create a row for any string. Nothing in the system reads an unknown key,
 * so the UI deliberately offers only the curated keys — see useSystemConfig.
 */

import apiClient from '@/services/apiClient'

const BASE = '/config'

// ─── GET /config ──────────────────────────────────────────────────────────────
/**
 * Every override currently set, ordered by key.
 *
 * Returns ONLY keys that have been overridden — a key with no row is simply
 * absent, not returned with a default. An empty array is the normal state on a
 * fresh system, not an error.
 *
 * @returns {Promise<Array<{ key, value, valueType, description, updatedAt }>>}
 */
export const fetchSystemConfig = async () => {
  const response = await apiClient.get(BASE)

  return response.data?.data ?? response.data ?? []
}

// ─── GET /config/{key} ────────────────────────────────────────────────────────
/**
 * One override. Throws with 404 CONFIG_KEY_NOT_SET when the key has never been
 * overridden — absence is a valid state, so callers should treat 404 as "not
 * set" rather than as a failure.
 *
 * @param {string} key
 */
export const fetchSystemConfigByKey = async key => {
  const response = await apiClient.get(`${BASE}/${encodeURIComponent(key)}`)

  return response.data?.data ?? response.data
}

// ─── PUT /config/{key} ────────────────────────────────────────────────────────
/**
 * Create or replace the override for one key. ADMIN only — SALES_MANAGER may
 * read config but not write it, so callers must gate on role before calling.
 *
 * PUT is idempotent here by design: the same request repeated is a no-op.
 *
 * @param {string} key
 * @param {{ value: string, valueType: string, description?: string }} payload
 */
export const upsertSystemConfig = async (key, payload) => {
  const response = await apiClient.put(`${BASE}/${encodeURIComponent(key)}`, payload)

  return response.data?.data ?? response.data
}
