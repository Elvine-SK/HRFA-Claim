import { brandTitle } from '@elvine-sk/platform-core'

/** Loads the brand once per page load and puts it in the tab: title pattern, favicon, install manifest. */
export default defineNuxtPlugin({
  name: 'platform:brand',
  dependsOn: ['platform:api'],
  setup() {
    const { brand, reload } = useBrand()
    void reload()
    const apiBase = useRuntimeConfig().public.platform.apiBase as string
    useHead({
      titleTemplate: (page?: string | null) =>
        brandTitle(brand.value.titlePattern, page ?? undefined, brand.value.name),
      link: [{ rel: 'manifest', href: `${apiBase}/brand/manifest.webmanifest` }],
    })
    useHead(() => ({
      link: brand.value.images.favicon ? [{ rel: 'icon', href: brand.value.images.favicon }] : [],
    }))
  },
})
