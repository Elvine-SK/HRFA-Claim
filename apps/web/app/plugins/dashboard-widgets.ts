import ActivityWidget from '../components/platform/dashboard/ActivityWidget.vue'
import ApprovalsWidget from '../components/platform/dashboard/ApprovalsWidget.vue'
import QuickActionsWidget from '../components/platform/dashboard/QuickActionsWidget.vue'
import StatsWidget from '../components/platform/dashboard/StatsWidget.vue'

/** The platform's dashboard widgets (UI spec §5.13). Apps register more, or replace one by id, in their plugins. */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('platform:signing-out', flushDashboardLayout)
  const widgets = useWidgetRegistry()
  widgets.register({
    id: 'stats',
    title: 'dashboard.widgets.stats.title',
    description: 'dashboard.widgets.stats.description',
    icon: 'i-lucide-chart-no-axes-column',
    sizes: ['xl'],
    defaultSize: 'xl',
    order: 10,
    module: 'dashboard',
    component: StatsWidget,
  })
  widgets.register({
    id: 'approvals',
    title: 'dashboard.widgets.approvals.title',
    description: 'dashboard.widgets.approvals.description',
    icon: 'i-lucide-stamp',
    sizes: ['s', 'm', 'l'],
    defaultSize: 'm',
    order: 20,
    module: 'approval',
    component: ApprovalsWidget,
  })
  widgets.register({
    id: 'activity',
    title: 'dashboard.widgets.activity.title',
    description: 'dashboard.widgets.activity.description',
    icon: 'i-lucide-activity',
    sizes: ['s', 'm', 'l'],
    defaultSize: 'm',
    order: 30,
    module: 'audit',
    permission: 'audit_event.read',
    component: ActivityWidget,
  })
  widgets.register({
    id: 'quick',
    title: 'dashboard.widgets.quick.title',
    description: 'dashboard.widgets.quick.description',
    icon: 'i-lucide-zap',
    sizes: ['s', 'm'],
    defaultSize: 's',
    order: 40,
    component: QuickActionsWidget,
  })
})
