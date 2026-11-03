<script setup lang="ts">
import type { WidgetSize } from '@elvine-sk/platform-nuxt/utils'
import RowsWidget, { type WidgetRow } from './RowsWidget.vue'

defineProps<{ size: WidgetSize }>()
const { t } = useI18n()
const { date } = useDates()

const row = (r: SettlementOverdue): WidgetRow => ({
  key: r.agreementId,
  title: `${r.ref} · ${r.holderName}`,
  sub: r.docNo,
  tag: { label: t('settlements.widgets.dueOn', { date: date(r.dueDate, 'D MMM') }), tone: 'danger' },
  to: r.settlementId ? `/settlements/${r.settlementId}` : `/agreements/${r.agreementId}`,
})
</script>

<template>
  <RowsWidget
    :size="size"
    :query-key="SETTLEMENTS_KEY"
    path="/settlements/overdue"
    :title="t('settlements.widgets.overdue.title')"
    :subtitle="t('settlements.widgets.overdue.subtitle')"
    icon="i-lucide-alarm-clock"
    :empty="t('settlements.widgets.overdue.empty')"
    :view-all="{ to: '/settlements?view=overdue', label: t('settlements.widgets.viewAll') }"
    :row="row"
  />
</template>
