/**
 * Your app's menu groups. This file is yours: `nelv update` never changes it.
 *
 * Items for your API modules are better declared on the module (`menus` in `defineModule`): the API's
 * manifest adds them to the Workspace or Administration group, for people who hold the permission.
 * Register web-only groups and items here. Labels are i18n keys; put yours in `i18n/locales/app.en.json`
 * and `app.lo.json`.
 */
export default defineNuxtPlugin(() => {
  const nav = useNavigation()

  // The home page: the dashboard with `platform-dashboard` installed, else links to every section.
  nav.register({
    id: 'overview',
    label: 'nav.overview',
    order: 0,
    items: [
      { id: 'dashboard', label: 'nav.dashboard', to: '/', icon: 'i-lucide-layout-dashboard', exact: true },
    ],
  })

  // A group of your own (`register` replaces a group with the same id):
  //
  // nav.register({
  //   id: 'reports',
  //   label: 'reports.nav.group',
  //   order: 50,
  //   items: [
  //     { id: 'sales', label: 'reports.nav.sales', to: '/reports/sales', icon: 'i-lucide-chart-line', permission: 'report.read' },
  //   ],
  // })
  //
  // An item added to a group the manifest fills (`workspace`, `admin`):
  //
  // nav.extend({ id: 'workspace', label: 'nav.workspace', items: [{ id: 'help', label: 'help.nav', to: '/help', icon: 'i-lucide-life-buoy' }] })
})
