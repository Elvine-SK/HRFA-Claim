import { fileURLToPath } from 'node:url'
import { NO_FLASH_SCRIPT } from '@elvine-sk/platform-nuxt/utils'

const weights = [400, 500, 600, 700, 800]
const areas = [
  '',
  'auth.',
  'admin.',
  'approval.',
  'dashboard.',
  'files.',
  'lists.',
  'live.',
  'notifications.',
  'oidc.',
  'records.',
  'tenancy.',
  'transfer.',
  'webhooks.',
  // The app's own strings (app.en.json, app.lo.json): created once by nelv, never updated.
  'app.',
]

export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxtjs/i18n', '@elvine-sk/platform-nuxt'],

  // The web app is a static SPA (spec §2); in dev, Nitro forwards /api to the API on :3335 (its PORT); the dev server runs on :3336.
  ssr: false,
  compatibilityDate: '2026-10-01',
  devtools: { enabled: true },
  nitro: {
    devProxy: { '/api': { target: 'http://localhost:3335/api', changeOrigin: true } },
  },

  devServer: {
    port: 3336,
  },

  // HRM's login page (NUXT_PUBLIC_HRM_LOGIN_URL): where the sign-in page sends users (middleware/hrm-sign-in.global.ts).
  runtimeConfig: { public: { hrmLoginUrl: '' } },

  css: [fileURLToPath(new URL('./app/assets/css/main.css', import.meta.url))],

  // The theme plugin owns `.dark` (spec §4.2: one owner of theme state).
  ui: {
    colorMode: false,
    theme: { colors: ['primary', 'secondary', 'success', 'info', 'warning', 'error'] },
  },

  fonts: {
    defaults: { weights, subsets: ['latin', 'latin-ext'] },
    families: [
      { name: 'Noto Sans Lao', provider: 'google', weights, subsets: ['lao'], global: true },
      { name: 'Plus Jakarta Sans', provider: 'google', weights, global: true },
      { name: 'Inter', provider: 'google', weights, global: true },
      { name: 'Geist', provider: 'google', weights, global: true },
      { name: 'Geist Mono', provider: 'google', weights: [400, 500, 600], global: true },
    ],
  },

  icon: {
    localApiEndpoint: '/_nuxt_icon',
    clientBundle: {
      scan: {
        globInclude: ['**/*.{vue,ts}'],
        globExclude: ['node_modules', 'dist', 'build', 'coverage', 'test', 'tests', '.*', '**/*.d.ts'],
      },
    },
  },

  app: {
    head: {
      htmlAttrs: {
        lang: 'en',
        'data-preset': 'aurora',
        'data-density': 'comfortable',
        'data-font': 'jakarta',
        'data-grad': 'on',
      },
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
      script: [{ innerHTML: NO_FLASH_SCRIPT, tagPosition: 'head' }],
    },
  },

  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'en',
    locales: [
      { code: 'en', language: 'en-US', name: 'English', files: areas.map((a) => `${a}en.json`) },
      { code: 'lo', language: 'lo-LA', name: 'ລາວ', files: areas.map((a) => `${a}lo.json`) },
    ],
    detectBrowserLanguage: { useCookie: true, cookieKey: 'nelvine_locale', fallbackLocale: 'en' },
  },
})
