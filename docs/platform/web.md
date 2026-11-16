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

## Drawer or dialog

`PlatformEntityDrawer` (side panel) is for a record's details and narrow editors, so the list stays visible
behind it. `PlatformEntityDialog` (centered) is for wide grids and editors that need room. Both take
`v-model:open`, `title`, `subtitle`, `icon`, `loading` and the `#badges`, `#actions` and default slots; the
dialog's header stays fixed while the body scrolls, and it fills the screen on a phone. The dialog's `size` is
`md` (about 640px), `lg` (about 860px, the default) or `xl` (about 1100px).

## A form in steps (wizard)

`PlatformFormWizard` splits a long create form into steps (4 to 6 work best): a stepper, help for each step,
a review step with _Edit_ links, and a side panel with a live summary and "what happens next". It shows the
steps, validates them and keeps `?step=` in the URL. Your page owns the API calls.

- `steps`: `WizardStep[]` (`key`, `label`, `caption`, `help`, `fields`). Each step owns the form fields it
  lists. The last step is the review step (`fields: []`).
- `state` (your reactive form state) and `schema` (the whole form's Zod schema). Each step validates
  `schema.pick(step.fields)`; a user can't reach a step before the ones above it pass.
- `review`: rows `{ label, value }` per step key for the review cards.
- Slots: `step-<key>` (that step's `UFormField`s), `summary`, `next`, and `actions` on the review step. It
  receives `validateAll()`; call it before you save.
- Drafts: `drafts` shows _Save draft_ and emits `save-draft` once the `draftGate` steps (default: the first)
  are valid. Put every field your create route requires on those steps. Use drafts only when the record has a
  draft status. After the first save, add the id to the URL (`?draft=<id>`) and pass `resumed` when you load
  a saved draft, so the steps it already passes are open.
- After every successful save call the exposed `markSaved()`. The wizard asks before the user leaves with
  changes not saved. Call `setServerErrors(fieldErrors)` on a `422`: it puts each error on its field and goes
  to the earliest step with one.
- To submit for approval from the review step, `useRecordSubmit('<entity>')` runs the same flow as the
  record page's _Submit for approval_. Bind its `choosing` and `choices` to `PlatformApprovalSubmitDialog`.

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

### Submenus

An item can hold `children`, up to three levels (Notes → Reports → Monthly report). A parent with `to` links to
its page and has a chevron that opens and closes it; a parent without `to` opens and closes on a click anywhere
on its row. An item the user may not open is hidden; a parent whose own permission fails but with a visible
child shows as a toggle. Open branches are remembered per browser, and landing on a child page opens its
branch. In the collapsed sidebar, clicking a parent's icon opens a menu with all its levels; Ctrl K lists child
pages as "Notes › Reports".

To hang web pages under an item the API declares, name it as `parent`; it is attached once the manifest has
loaded (an unknown parent is dropped with a warning in development):

```ts
nav.extend({
  id: 'workspace',
  label: 'nav.workspace',
  items: [
    {
      id: 'notes-reports',
      parent: 'notes',
      label: 'reports.nav.group',
      children: [{ id: 'notes-monthly', label: 'reports.nav.monthly', to: '/notes/reports/monthly' }],
    },
  ],
})
```

`nav.setCount(id, count, hot)` works on an item at any depth; a closed parent shows a dot when a child has a
hot count. Administration → Menu map shows the whole menu, where each item comes from, and what a role or a
user sees and why.

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
