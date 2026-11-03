<script setup lang="ts">
import type { WidgetSize } from '@elvine-sk/platform-nuxt/utils'
import RowsWidget, { type WidgetRow } from './RowsWidget.vue'

defineProps<{ size: WidgetSize }>()
const { t } = useI18n()
const { date } = useDates()

/** My trips whose advance is paid and whose settlement is not submitted: late in red, otherwise the due date. */
const row = (r: SettlementToFile): WidgetRow => ({
  key: r.agreementId,
  title: r.ref,
  sub: r.docNo,
  tag: r.isLate
    ? { label: t('settlements.widgets.late'), tone: 'danger' }
    : { label: t('settlements.widgets.dueOn', { date: date(r.dueDate, 'D MMM') }), tone: 'neutral' },
  to: r.settlementId ? `/settlements/${r.settlementId}` : `/agreements/${r.agreementId}`,
})
</script>

<template>
  <RowsWidget
    :size="size"
    :query-key="SETTLEMENTS_KEY"
    path="/settlements/to-file"
    :title="t('settlements.widgets.toFile.title')"
    :subtitle="t('settlements.widgets.toFile.subtitle')"
    icon="i-lucide-file-pen"
    :empty="t('settlements.widgets.toFile.empty')"
    :view-all="{ to: '/settlements', label: t('settlements.widgets.viewAll') }"
    :row="row"
  />
</template>
