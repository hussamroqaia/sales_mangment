<script setup>
/**
 * SystemConfigList.vue
 *
 * System configuration for the management web app.
 *
 *   GET /api/config        → ADMIN, SALES_MANAGER (read)
 *   PUT /api/config/{key}  → ADMIN only (write)
 *
 * SALES_MANAGER sees the same table without any edit affordance, matching the
 * backend split exactly — no write request is reachable for that role.
 *
 * Keys come from the curated catalogue, never from free text: the backend does
 * not validate the {key} path variable, so a typed key would create a row
 * nothing reads. Overrides the backend holds for keys this build does not know
 * are still shown, read-only, so the curated list cannot hide real state.
 */

import {
  useSystemConfig,
  validateConfigValue,
  formatConfigTimestamp,
} from '@/composables/useSystemConfig'

const {
  canReadConfig,
  canWriteConfig,
  settings,
  unrecognisedOverrides,
  isLoading,
  loadError,
  hasLoaded,
  loadConfig,
  isSaving,
  saveError,
  saveSetting,
  snackbar,
} = useSystemConfig()

// ── Edit dialog ───────────────────────────────────────────────────────────────
const isEditOpen     = ref(false)
const editingSetting = ref(null)
const form           = ref({ value: '', description: '' })

const openEdit = setting => {
  editingSetting.value = setting
  form.value = {
    value: setting.value ?? '',
    description: setting.description ?? '',
  }
  saveError.value = ''
  isEditOpen.value = true
}

const valueError = computed(() => {
  if (!editingSetting.value || !form.value.value) return ''

  return validateConfigValue(form.value.value, editingSetting.value.valueType)
})

const canSubmit = computed(() =>
  Boolean(form.value.value?.trim()) && !valueError.value && !isSaving.value)

const submit = async () => {
  if (!canSubmit.value) return

  const ok = await saveSetting(editingSetting.value, form.value)

  if (ok) isEditOpen.value = false
}

onMounted(loadConfig)
</script>

<template>
  <section>
    <!-- Route meta already gates this, but the component stays safe standalone. -->
    <VCard v-if="!canReadConfig">
      <VCardText class="d-flex flex-column align-center justify-center py-12 gap-3">
        <VIcon
          icon="tabler-lock"
          size="48"
          color="secondary"
        />
        <p class="text-body-1 text-medium-emphasis mb-0">
          Your account does not have access to system configuration.
        </p>
      </VCardText>
    </VCard>

    <template v-else>
      <VCard>
        <VCardItem class="pb-2">
          <VCardTitle>System Configuration</VCardTitle>
          <VCardSubtitle>
            {{ canWriteConfig
              ? 'Operational settings read by the backend at runtime'
              : 'Operational settings — read-only for your role' }}
          </VCardSubtitle>

          <template #append>
            <VBtn
              variant="tonal"
              color="secondary"
              size="small"
              prepend-icon="tabler-refresh"
              :loading="isLoading"
              @click="loadConfig"
            >
              Refresh
            </VBtn>
          </template>
        </VCardItem>

        <VAlert
          v-if="loadError"
          type="error"
          variant="tonal"
          class="mx-4 mb-4"
        >
          {{ loadError }}
        </VAlert>

        <VDivider />

        <VCardText v-if="isLoading && !hasLoaded">
          <VSkeletonLoader type="table-row@3" />
        </VCardText>

        <VTable v-else>
          <thead>
            <tr>
              <th>Setting</th>
              <th>Value</th>
              <th>Note</th>
              <th>Last updated</th>
              <th
                v-if="canWriteConfig"
                class="text-end"
              >
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="setting in settings"
              :key="setting.key"
            >
              <td>
                <div class="d-flex flex-column py-2">
                  <span class="text-body-1 font-weight-medium">{{ setting.label }}</span>
                  <span class="text-body-2 text-medium-emphasis">{{ setting.hint }}</span>
                  <code class="text-caption text-medium-emphasis mt-1">{{ setting.key }}</code>
                </div>
              </td>

              <td>
                <!--
                  "Not set" is a real backend state: the row simply does not
                  exist yet. No default is invented here. 
                -->
                <template v-if="setting.isSet">
                  <span class="text-body-1 font-weight-medium">{{ setting.value }}</span>
                  <span
                    v-if="setting.unit"
                    class="text-body-2 text-medium-emphasis ms-1"
                  >{{ setting.unit }}</span>
                </template>
                <VChip
                  v-else
                  size="small"
                  color="secondary"
                  label
                >
                  Not set
                </VChip>
              </td>

              <td>
                <span class="text-body-2 text-medium-emphasis">{{ setting.description || '—' }}</span>
              </td>

              <td>
                <span class="text-body-2">{{ formatConfigTimestamp(setting.updatedAt) }}</span>
              </td>

              <td
                v-if="canWriteConfig"
                class="text-end"
              >
                <VBtn
                  variant="tonal"
                  color="primary"
                  size="small"
                  prepend-icon="tabler-pencil"
                  @click="openEdit(setting)"
                >
                  Edit
                </VBtn>
              </td>
            </tr>
          </tbody>
        </VTable>
      </VCard>

      <!--
        Keys the backend holds that this build does not recognise. Read-only:
        the UI will not write a key it cannot describe. 
      -->
      <VCard
        v-if="unrecognisedOverrides.length"
        class="mt-6"
      >
        <VCardItem class="pb-2">
          <VCardTitle>Unrecognised settings</VCardTitle>
          <VCardSubtitle>
            Stored in the backend but not known to this version of the app — shown for visibility only.
          </VCardSubtitle>
        </VCardItem>

        <VTable>
          <thead>
            <tr>
              <th>Key</th>
              <th>Value</th>
              <th>Type</th>
              <th>Note</th>
              <th>Last updated</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in unrecognisedOverrides"
              :key="row.key"
            >
              <td><code class="text-caption">{{ row.key }}</code></td>
              <td>{{ row.value }}</td>
              <td>{{ row.valueType }}</td>
              <td class="text-medium-emphasis">
                {{ row.description || '—' }}
              </td>
              <td>{{ formatConfigTimestamp(row.updatedAt) }}</td>
            </tr>
          </tbody>
        </VTable>
      </VCard>
    </template>

    <!-- Edit dialog — key and type are fixed by the catalogue, never typed. -->
    <VDialog
      v-model="isEditOpen"
      max-width="560"
    >
      <VCard :title="`Edit ${editingSetting?.label ?? 'setting'}`">
        <VCardText>
          <p class="text-body-2 text-medium-emphasis mb-4">
            <code>{{ editingSetting?.key }}</code> · type {{ editingSetting?.valueType }}
          </p>

          <AppTextField
            v-model="form.value"
            :label="editingSetting?.unit ? `Value (${editingSetting.unit})` : 'Value'"
            :error-messages="valueError ? [valueError] : []"
            :hint="editingSetting?.hint"
            persistent-hint
          />

          <AppTextarea
            v-model="form.description"
            label="Note (optional)"
            rows="2"
            class="mt-4"
            :counter="500"
          />
        </VCardText>

        <VAlert
          v-if="saveError"
          type="error"
          variant="tonal"
          class="mx-6 mb-2"
        >
          {{ saveError }}
        </VAlert>

        <VCardActions class="justify-end">
          <VBtn
            variant="tonal"
            color="secondary"
            :disabled="isSaving"
            @click="isEditOpen = false"
          >
            Cancel
          </VBtn>
          <VBtn
            color="primary"
            :loading="isSaving"
            :disabled="!canSubmit"
            @click="submit"
          >
            Save
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <VSnackbar
      v-model="snackbar.show"
      :color="snackbar.color"
      :timeout="3500"
      location="bottom end"
    >
      <VIcon
        :icon="snackbar.color === 'success' ? 'tabler-circle-check' : 'tabler-alert-circle'"
        class="me-2"
      />
      {{ snackbar.message }}
    </VSnackbar>
  </section>
</template>
