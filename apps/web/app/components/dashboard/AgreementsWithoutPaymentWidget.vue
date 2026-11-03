<script setup lang="ts">
import type { WidgetSize } from '@elvine-sk/platform-nuxt/utils'
import RowsWidget, { type WidgetRow } from './RowsWidget.vue'

defineProps<{ size: WidgetSize }>()
const { t } = useI18n()
const { date } = useDates()

const row = (r: AgreementWithoutPayment): WidgetRow => ({
  key: r.id,
  title: `${r.ref} · ${r.subject}`,
  sub: r.docNo,
  tag: { label: date(r.travelFrom, 'D MMM'), tone: 'neutral' },
  to: `/agreements/${r.id}`,
})
</script>

<template>
  <RowsWidget
    :size="size"
    :query-key="PAYMENTS_KEY"
    path="/payments/agreements-without-payment"
    :title="t('payments.widgets.withoutPayment.title')"
    :subtitle="t('payments.widgets.withoutPayment.subtitle')"
    icon="i-lucide-receipt"
    :empty="t('payments.widgets.withoutPayment.empty')"
    :view-all="{ to: '/payments', label: t('payments.widgets.viewAll') }"
    :row="row"
  />
</template>
