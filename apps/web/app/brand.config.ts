import type { ShippedBrand } from '@elvine-sk/platform-nuxt/utils'

// The brand this app ships (yours: `nelv update` never overwrites it). Images are paths under `public/`, e.g.
// `logo: '/brand/logo.png'`; one left out shows a letter tile. Names and the slogan are `brand.*` in
// `i18n/locales/app.<locale>.json`. An admin can change all of it on Administration → Brand (capability `brand`).
export default {
  name: 'HR-FAM',
  logo: undefined,
  logoDark: undefined,
  mark: undefined,
  favicon: undefined,
  titlePattern: '{page} · {name}',
} satisfies ShippedBrand
