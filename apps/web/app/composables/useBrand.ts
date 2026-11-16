import type { BrandTextField, BrandView, DataResponse } from '@elvine-sk/platform-core'
import { resolveBrand, type ResolvedBrand, type ShippedBrand } from '@elvine-sk/platform-nuxt/utils'
import config from '#brand-config'

const shipped: ShippedBrand = config

// The app's keys first, then the platform's own from before the brand existed.
const SHIPPED_KEYS: Record<BrandTextField, string[]> = {
  name: ['brand.name', 'shell.appName'],
  shortName: ['brand.shortName'],
  slogan: ['brand.slogan'],
  signInTitle: ['brand.signIn.title', 'auth.brand.title'], // i18n-check: not a key
  signInText: ['brand.signIn.text', 'auth.brand.text'], // i18n-check: not a key
  feature1: ['brand.signIn.f1', 'auth.brand.f1'], // i18n-check: not a key
  feature2: ['brand.signIn.f2', 'auth.brand.f2'], // i18n-check: not a key
  feature3: ['brand.signIn.f3', 'auth.brand.f3'], // i18n-check: not a key
}

/** The brand as this reader sees it: what an admin set (`GET /brand`) over what the app ships. */
export function useBrand() {
  const nuxtApp = useNuxtApp()
  const i18n = nuxtApp.$i18n
  const view = useState<BrandView | null>('platform:brand', () => null)
  const apiBase = useRuntimeConfig().public.platform.apiBase as string

  const shippedText = (field: BrandTextField) => {
    const [own, ...platform] = SHIPPED_KEYS[field]
    if (i18n.te(own!)) return i18n.t(own!)
    if (field === 'name' && shipped.name) return shipped.name
    const key = platform.find((k) => i18n.te(k))
    return key ? i18n.t(key) : ''
  }
  const brand = computed<ResolvedBrand>(() =>
    resolveBrand(view.value, shipped, i18n.locale.value, shippedText, apiBase),
  )

  /** Without the brand module, or when the request fails, the app shows what it ships. `false` when it failed. */
  async function reload(): Promise<boolean> {
    try {
      const api = nuxtApp.$api as <T>(path: string) => Promise<T>
      view.value = (await api<DataResponse<BrandView>>('/brand')).data
      return true
    } catch {
      view.value = null
      return false
    }
  }

  return { brand, view, reload, shipped, shippedText, apiBase }
}
