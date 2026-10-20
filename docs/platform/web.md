# Building the web app

`apps/web` is a Nuxt 4 single-page app with Nuxt UI, copied from the platform's web template. Platform
pages (sign-in, account, administration, approvals, files) and components (`components/platform/`) come with
it; your pages, components, composables and plugins are new files next to them. The platform's composables
(`useApi`, `useApiList`, `useAccess`, `useNavigation`, ...) come from `@elvine-sk/platform-nuxt` and are
auto-imported.

## A page

- One file per route under `app/pages/` (`pages/orders/index.vue`, `pages/orders/[id].vue`). Give it a title
  key: `definePageMeta({ title: 'nav.orders' })`; the shell shows it and uses it for breadcrumbs.
- Read data with TanStack Query through the platform's helpers, one composable per resource
  (`composables/useOrders.ts`):

```ts
import type { DataResponse } from '@elvine-sk/platform-core'
import type { ApiError } from '@elvine-sk/platform-nuxt/utils'
import { useMutation, useQueryClient } from '@tanstack/vue-query'

export const ORDERS_KEY = 'orders'
const orderPath = (id: string) => `/orders/${encodeURIComponent(id)}`

export const useOrder = (id: MaybeRefOrGetter<string | null | undefined>) =>
  useApiItem<Order>(ORDERS_KEY, () => (toValue(id) ? orderPath(toValue(id)!) : null))

export function useOrderMutations() {
  const api = useApi()
  const client = useQueryClient()
  const update = useMutation<Order, ApiError, { id: string; patch: OrderUpdate }>({
    mutationFn: async ({ id, patch }) =>
      (await api<DataResponse<Order>>(orderPath(id), { method: 'PATCH', body: patch })).data,
    onSuccess: () => client.invalidateQueries({ queryKey: [ORDERS_KEY] }),
  })
  return { update }
}
```

- `useApi()` sends the session cookie and CSRF token and turns error bodies into `ApiError`; don't call
  `fetch` or `$fetch` yourself. Show field errors with `useFormErrors()` and confirmations with `useConfirm()`.
- Types: `pnpm run api:types` (in `apps/web`) writes `app/types/api.d.ts` from the API's
  `openapi.json`. Take request and response types from there, so a changed route is a type error.
- Lists: `useListQuery()` keeps sort, filters, search and page in the URL, `useApiList(KEY, '/orders', list)`
  loads the page, and `PlatformDataTable` draws it (columns, status tabs, selection, phone cards). Give it
  `list-key` when the module declares the list (see [modules.md](modules.md), "Lists, filters and saved views")
  for the filter bar and saved views.
- Show or hide controls with `useAccess()`: `can('order.update', order)` with a record, `canSome('order.create')`
  without. This is for the screen only; the API checks again.

## Menu

Prefer declaring the menu item on the API module (`menus` in `defineModule`, see [modules.md](modules.md)):
it is shown only to people who hold its permission, in the manifest's order. Web-only items and groups go in
`app/plugins/navigation.ts`. `nelv create` writes it with the Overview group (the home page) and commented
examples; it is yours from then on, and `nelv update` never changes it:

```ts
// app/plugins/navigation.ts
export default defineNuxtPlugin(() => {
  const nav = useNavigation()
  nav.register({ id: 'overview', label: 'nav.overview', order: 0, items: [/* the home page */] })
  nav.register({
    id: 'reports',
    label: 'reports.nav.group',
    order: 50,
    items: [{ id: 'sales', label: 'reports.nav.sales', to: '/reports/sales', icon: 'i-lucide-chart-line' }],
  })
})
```

`register` replaces a whole group; add to an existing group (`workspace`, `admin`) with
`useNavigation().extend`.

## Strings

Every string the UI shows is a key, in English and Lao. Keep your app's keys in
`apps/web/i18n/locales/app.en.json` and `app.lo.json` (created empty by `nelv create`, yours from then on, never
touched by `nelv update`), with the same keys in both (`{ "orders": { "title": "Orders" } }`). The platform's
strings live in the other files there; don't add your keys to them.

Use them with `useI18n()` in components (`t('orders.title')`). Plugins and composables called from plugins run
before any component: read i18n there through `useNuxtApp().$i18n`. To split your strings further, add another
area (`orders.en.json`, `orders.lo.json`) and list it in `areas` in `apps/web/nuxt.config.ts`.

API error texts come from the module's `messages` (en and lo), not from the web.

## Live updates

With `events` installed, a record changed by someone else can reload lists and warn a form that is being
edited. Register the record type's API paths in a plugin, and use `useLiveRecord` on the form:

```ts
// app/plugins/live-records.ts
export default defineNuxtPlugin(() => {
  registerLiveRecord('order', ['/orders'])
})
```

Details: [modules.md](modules.md), "Events and live updates".

## Styling

- Use Nuxt UI components and the theme tokens (`app/assets/css/tokens.css`), not hard-coded colours, so light
  and dark mode and the appearance presets keep working.
- Vue applies a parent's scoped styles to a child component's root element: name page-local classes so they
  can't collide with a platform component's root class.
- Check new pages at phone width (390 px) and in dark mode.

## Checking a page

Typecheck and unit tests don't boot the app. After a change, run `pnpm run dev:api` and
`pnpm run dev:web`, open the page and confirm it renders with no error in the browser console
(in particular no `NUXT_E1005`).
