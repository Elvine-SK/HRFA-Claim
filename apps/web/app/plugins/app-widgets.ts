import AgreementsWithoutPaymentWidget from '../components/dashboard/AgreementsWithoutPaymentWidget.vue'
import SettlementsOverdueWidget from '../components/dashboard/SettlementsOverdueWidget.vue'
import SettlementsToFileWidget from '../components/dashboard/SettlementsToFileWidget.vue'

/** The app's dashboard widgets (spec §14). Each is also a `widget.<id>` permission granted per role. */
export default defineNuxtPlugin(() => {
  const widgets = useWidgetRegistry()
  widgets.register({
    id: 'settlements_to_file',
    title: 'settlements.widgets.toFile.title',
    description: 'settlements.widgets.toFile.description',
    icon: 'i-lucide-file-pen',
    sizes: ['s', 'm', 'l'],
    defaultSize: 'm',
    order: 50,
    module: 'settlements',
    component: SettlementsToFileWidget,
  })
  widgets.register({
    id: 'settlements_overdue',
    title: 'settlements.widgets.overdue.title',
    description: 'settlements.widgets.overdue.description',
    icon: 'i-lucide-alarm-clock',
    sizes: ['s', 'm', 'l'],
    defaultSize: 'm',
    order: 60,
    module: 'settlements',
    permission: 'settlement.read',
    component: SettlementsOverdueWidget,
  })
  widgets.register({
    id: 'agreements_without_payment',
    title: 'payments.widgets.withoutPayment.title',
    description: 'payments.widgets.withoutPayment.description',
    icon: 'i-lucide-receipt',
    sizes: ['s', 'm', 'l'],
    defaultSize: 'm',
    order: 70,
    module: 'payments',
    permission: 'payment.read',
    component: AgreementsWithoutPaymentWidget,
  })
})
