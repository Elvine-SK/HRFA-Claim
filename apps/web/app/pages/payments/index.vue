<script setup lang="ts">
import type { DataResponse } from '@elvine-sk/platform-core'
import type { DataTableColumn, DataTableStatusTab } from '../../components/platform/DataTable.vue'

definePageMeta({ title: 'payments.nav.title' })

const { t } = useI18n()
const access = useAccess()
const notify = useNotify()
const router = useRouter()
const api = useApi()
const { dateTime, relative } = useDates()
useHead({ title: () => t('payments.list.title') })

const list = useListQuery({ defaults: { sort: [{ field: 'createdAt', dir: 'desc' }] } })
const payments = useApiList<PaymentListItem>(PAYMENTS_KEY, '/payments', list)
const canCalculate = computed(() => access.canSome('payment.calculate'))

const columns = computed<DataTableColumn<PaymentListItem>[]>(() => [
  { key: 'ref', label: t('agreements.field.ref'), sortable: true, mono: true, locked: true, primary: true },
  { key: 'docNo', label: t('agreements.field.docNo'), sortable: true, mono: true, card: true },
  { key: 'subject', label: t('agreements.field.subject'), card: true },
  { key: 'formType', label: t('agreements.field.formType'), card: true, value: (r) => t(`agreements.formType.${r.formType}`) },
  { key: 'travelFrom', label: t('agreements.field.travelFrom'), sortable: true, mono: true, value: (r) => formatDayFirst(r.travelFrom) },
  { key: 'status', label: t('agreements.field.status'), card: true },
  { key: 'createdAt', label: t('agreements.field.createdAt'), sortable: true, align: 'end' },
])
const statusTabs = computed<DataTableStatusTab[]>(() => [
  { label: t('platform.list.all'), value: null },
  ...PAYMENT_STATUSES.map((s) => ({ label: t(`payments.status.${s}`), value: s })),
])
const filterLabels = computed(() => ({
  status: t('agreements.field.status'),
  formType: t('agreements.field.formType'),
  branchCode: t('agreements.field.branch'),
  travelFrom: t('agreements.field.travelFrom'),
}))
const filterValueLabels = computed(() => ({
  status: Object.fromEntries(PAYMENT_STATUSES.map((s) => [s, t(`payments.status.${s}`)])),
  formType: Object.fromEntries(FORM_TYPES.map((f) => [f, t(`agreements.formType.${f}`)])),
}))

// REF or Doc.no: open the payment, or offer to calculate an approved agreement that has none.
const { lookup, create } = usePaymentMutations()
const number = ref('')
const pending = ref<Agreement | null>(null)
async function find() {
  pending.value = null
  if (!number.value.trim()) return
  try {
    const found = await lookup.mutateAsync(number.value.trim())
    if (found.paymentId) return await router.push(`/payments/${found.paymentId}`)
    const agreement = (await api<DataResponse<Agreement>>(`/agreements/${found.agreementId}`)).data
    if (agreement.status === 'approved' && canCalculate.value) pending.value = agreement
    else notify.info(t('payments.list.noPayment', { ref: agreement.ref }))
  } catch (error) {
    notify.error(error)
  }
}
async function calculate() {
  if (!pending.value) return
  try {
    const payment = await create.mutateAsync(pending.value.id)
    await router.push(`/payments/${payment.id}`)
  } catch (error) {
    notify.error(error)
  }
}
</script>

<template>
  <div>
    <PlatformPageHeader :title="t('payments.list.title')" :subtitle="t('payments.list.subtitle')" />

    <form class="mb-4 flex max-w-xl gap-2" @submit.prevent="find">
      <UInput
        v-model="number"
        class="flex-1"
        icon="i-lucide-search"
        :placeholder="t('agreements.list.lookup')"
        :aria-label="t('agreements.list.lookup')"
      />
      <UButton type="submit" variant="soft" :loading="lookup.isPending.value">{{ t('agreements.list.open') }}</UButton>
    </form>

    <UAlert
      v-if="pending"
      class="mb-4 max-w-xl"
      color="info"
      variant="subtle"
      :title="t('payments.list.readyTitle', { ref: pending.ref })"
      :description="t('payments.list.readyText')"
      :actions="[{ label: t('payments.list.calculate'), icon: 'i-lucide-calculator', onClick: calculate }]"
    />

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <PlatformDataTable
        id="payments"
        :rows="payments.data.value?.data ?? []"
        :total="payments.data.value?.meta.total ?? 0"
        :columns="columns"
        :list="list"
        list-key="payments"
        :status-tabs="statusTabs"
        :filter-labels="filterLabels"
        :filter-value-labels="filterValueLabels"
        :loading="payments.isPending.value"
        :fetching="payments.isFetching.value"
        :error="payments.error.value"
        :entities="t('payments.list.entities')"
        :caption="t('payments.list.title')"
        @select="(p) => router.push(`/payments/${p.id}`)"
        @retry="payments.refetch()"
      >
        <template #cell-status="{ row }">
          <UBadge :color="PAYMENT_TONE[row.status]" variant="subtle">{{ t(`payments.status.${row.status}`) }}</UBadge>
        </template>
        <template #cell-createdAt="{ row }">
          <UTooltip :text="dateTime(row.createdAt)">
            <time :datetime="row.createdAt">{{ relative(row.createdAt) }}</time>
          </UTooltip>
        </template>
      </PlatformDataTable>
    </UCard>
  </div>
</template>
