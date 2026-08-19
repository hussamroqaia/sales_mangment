import { useStorage } from '@vueuse/core'
import { useTheme } from 'vuetify'
import { useConfigStore } from '@core/stores/config'
import { namespaceConfig } from '@layouts/stores/config'
import { APP_LOCALE } from '@/plugins/i18n'

const _syncAppLocale = () => {
  const configStore = useConfigStore()

  // Arabic only: there is nothing to negotiate or persist. We just stamp the
  // document so `lang`/`dir` match what Vuetify and the layout already assume.
  configStore.isAppRTL = true

  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', APP_LOCALE)
    document.documentElement.setAttribute('dir', 'rtl')
  }
}

const _handleSkinChanges = () => {
  const { themes } = useTheme()
  const configStore = useConfigStore()


  // Create skin default color so that we can revert back to original (default skin) color when switch to default skin from bordered skin
  Object.values(themes.value).forEach(t => {
    t.colors['skin-default-background'] = t.colors.background
    t.colors['skin-default-surface'] = t.colors.surface
  })
  watch(() => configStore.skin, val => {
    Object.values(themes.value).forEach(t => {
      t.colors.background = t.colors[`skin-${val}-background`]
      t.colors.surface = t.colors[`skin-${val}-surface`]
    })
  }, { immediate: true })
}


/*
    ℹ️ Set current theme's surface color in localStorage

    Why? Because when initial loader is shown (before vue is ready) we need to what's the current theme's surface color.
    We will use color stored in localStorage to set the initial loader's background color.

    With this we will be able to show correct background color for the initial loader even before vue identify the current theme.
  */
const _syncInitialLoaderTheme = () => {
  const vuetifyTheme = useTheme()

  watch(() => useConfigStore().theme, () => {
    // ℹ️ We are not using theme.current.colors.surface because watcher is independent and when this watcher is ran `theme` computed is not updated
    useStorage(namespaceConfig('initial-loader-bg'), null).value = vuetifyTheme.current.value.colors.surface
    useStorage(namespaceConfig('initial-loader-color'), null).value = vuetifyTheme.current.value.colors.primary
  }, { immediate: true })
}

const initCore = () => {
  _syncInitialLoaderTheme()
  _handleSkinChanges()

  _syncAppLocale()
}

export default initCore
