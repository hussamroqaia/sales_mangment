import { breakpointsVuetify } from '@vueuse/core'
import { AppContentLayoutNav, ContentWidth, FooterType, HorizontalNavType, NavbarType } from '@layouts/enums'

export const layoutConfig = {
  app: {
    title: 'my-layout',

    /*
      Prefix for cookie and localStorage keys.

      Kept separate from `title` because the title is display copy — it is
      translated, and cookie names must be US-ASCII tokens (RFC 6265), so an
      Arabic title would make every `document.cookie` write throw. Changing this
      value orphans every stored preference, so it stays stable for the life of
      the app regardless of what the UI is called.
    */
    storageNamespace: 'my-layout',
    logo: h('img', { src: '/src/assets/logo.svg' }),
    contentWidth: ContentWidth.Boxed,
    contentLayoutNav: AppContentLayoutNav.Vertical,
    overlayNavFromBreakpoint: breakpointsVuetify.md,

    // isRTL: false,
    i18n: {
      enable: true,
    },
    iconRenderer: h('div'),
  },
  navbar: {
    type: NavbarType.Sticky,
    navbarBlur: true,
  },
  footer: {
    type: FooterType.Static,
  },
  verticalNav: {
    isVerticalNavCollapsed: false,
    defaultNavItemIconProps: { icon: 'tabler-circle' },
  },
  horizontalNav: {
    type: HorizontalNavType.Sticky,
    transition: 'none',
    popoverOffset: 0,
  },
  icons: {
    chevronDown: { icon: 'tabler-chevron-down' },
    chevronRight: { icon: 'tabler-chevron-right' },
    close: { icon: 'tabler-x' },
    verticalNavPinned: { icon: 'tabler-circle-dot' },
    verticalNavUnPinned: { icon: 'tabler-circle' },
    sectionTitlePlaceholder: { icon: 'tabler-minus' },
  },
}
