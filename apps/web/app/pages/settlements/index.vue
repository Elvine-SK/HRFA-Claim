<script setup lang="ts">
import type { DataResponse } from '@elvine-sk/platform-core'
import type { DataTableColumn, DataTableStatusTab } from '../../components/platform/DataTable.vue'

definePageMeta({ title: 'settlements.nav.title' })

const { t } = useI18n()
const access = useAccess()
const notify = useNotify()
const router = useRouter()
const api = useApi()
const { dateTime, relative } = useDates()
useHead({ title: () => t('settlements.list.title') })

// Members see the settlements of their own trips; Finance (settlement.read) also has the overdue list.
const isFinance = computed(() => access.canSome('settlement.read'))
const view = useQueryParam('view', 'list')
const tabs = computed(() => [
  { label: t('settlements.list.tabList'), value: 'list' },
  ...(isFinance.value ? [{ label: t('settlements.list.tabOverdue'), value: 'overdue' }] : []),
])

const list = useListQuery({ defaults: { sort: [{ field: 'createdAt', dir: 'desc' }] } })
const settlements = useApiList<SettlementListItem>(SETTLEMENTS_KEY, '/settlements', list)
// The overdue list is short and has its own sort, so it does not share the page's list query.
const overdue = useApiItem<SettlementOverdue[]>(SETTLEMENTS_KEY, () =>
  view.value === 'overdue' && isFinance.value ? '/settlements/overdue?pageSize=100' : null,
)

const columns = computed<DataTableColumn<SettlementListItem>[]>(() => [
  { key: 'ref', label: t('agreements.field.ref'), sortable: true, mono: true, locked: true, primary: true },
  { key: 'docNo', label: t('agreements.field.docNo'), sortable: true, mono: true, card: true },
  { key: 'subject', label: t('agreements.field.subject'), card: true },
  { key: 'advance', label: t('settlements.field.advance'), align: 'end', value: (r) => formatAmount(r.advance, r.currency) },
  { key: 'total', label: t('settlements.field.total'), align: 'end', value: (r) => formatAmount(r.total, r.currency) },
  { key: 'dueDate', label: t('settlements.field.dueDate'), sortable: true, mono: true, value: (r) => formatDayFirst(r.dueDate) },
  { key: 'status', label: t('agreements.field.status'), card: true },
  { key: 'createdAt', label: t('agreements.field.createdAt'), sortable: true, align: 'end' },
])
const statusTabs = computed<DataTableStatusTab[]>(() => [
  { label: t('platform.list.all'), value: null },
  ...SETTLEMENT_STATUSES.map((s) => ({ label: t(`settlements.status.${s}`), value: s })),
])
const filterLabels = computed(() => ({ status: t('agreements.field.status'), branchCode: t('agreements.field.branch') }))
const filterValueLabels = computed(() => ({
  status: Object.fromEntries(SETTLEMENT_STATUSES.map((s) => [s, t(`settlements.status.${s}`)])),
}))

// REF or Doc.no: open the settlement, or offer a member to file it once the advance is paid.
const { lookup, create } = useSettlementMutations()
const number = ref('')
const pending = ref<Agreement | null>(null)
async function find() {
  pending.value = null
  if (!number.value.trim()) return
  try {
    const found = await lookup.mutateAsync(number.value.trim())
    if (found.settlementId) return await router.push(`/settlements/${found.settlementId}`)
    const agreement = (await api<DataResponse<Agreement>>(`/agreements/${found.agreementId}`)).data
    if (found.canFile) pending.value = agreement
    else notify.error(new Error(t('settlements.list.cannotFile', { ref: agreement.ref })))
  } catch (error) {
    notify.error(error)
  }
}
async function file() {
  if (!pending.value) return
  try {
    const settlement = await create.mutateAsync(pending.value.id)
    await router.push(`/settlements/${settlement.id}`)
  } catch (error) {
    notify.error(error)
  }
}
</script>

<template>
  <div>
    <PlatformPageHeader :title="t('settlements.list.title')" :subtitle="t('settlements.list.subtitle')" />

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
      :title="t('settlements.list.readyTitle', { ref: pending.ref })"
      :description="t('settlements.list.readyText')"
      :actions="[{ label: t('settlements.list.file'), icon: 'i-lucide-receipt', onClick: file, loading: create.isPending.value }]"
    />

    <UTabs v-if="tabs.length > 1" :model-value="view" :items="tabs" :content="false" class="mb-4" @update:model-value="(v) => (view = String(v))" />

    <UCard v-if="view === 'overdue' && isFinance" :ui="{ body: 'p-0 sm:p-0' }">
      <USkeleton v-if="overdue.isPending.value" class="h-32" />
      <UAlert v-else-if="overdue.error.value" color="error" variant="subtle" :title="overdue.error.value.message" />
      <MasterTable v-else :caption="t('settlements.list.tabOverdue')">
        <thead>
          <tr>
            <th>{{ t('agreements.field.ref') }}</th>
            <th>{{ t('agreements.field.docNo') }}</th>
            <th>{{ t('settlements.field.holder') }}</th>
            <th>{{ t('agreements.field.travelTo') }}</th>
            <th>{{ t('settlements.field.dueDate') }}</th>
            <th>{{ t('settlements.list.started') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in overdue.data.value ?? []"
            :key="r.agreementId"
            class="cursor-pointer"
            @click="router.push(r.settlementId ? `/settlements/${r.settlementId}` : `/agreements/${r.agreementId}`)"
          >
            <td class="mono">{{ r.ref }}</td>
            <td class="mono">{{ r.docNo }}</td>
            <td>{{ r.holderName }}</td>
            <td class="mono">{{ formatDayFirst(r.travelTo) }}</td>
            <td class="mono">{{ formatDayFirst(r.dueDate) }}</td>
            <td>{{ r.settlementId ? t('settlements.list.draft') : '—' }}</td>
          </tr>
          <tr v-if="!(overdue.data.value ?? []).length">
            <td colspan="6" class="text-[var(--ui-text-muted)]">{{ t('settlements.list.noneOverdue') }}</td>
          </tr>
        </tbody>
      </MasterTable>
    </UCard>

    <UCard v-else :ui="{ body: 'p-0 sm:p-0' }">
      <PlatformDataTable
        id="settlements"
        :rows="settlements.data.value?.data ?? []"
        :total="settlements.data.value?.meta.total ?? 0"
        :columns="columns"
        :list="list"
        list-key="settlements"
        :status-tabs="statusTabs"
        :filter-labels="filterLabels"
        :filter-value-labels="filterValueLabels"
        :loading="settlements.isPending.value"
        :fetching="settlements.isFetching.value"
        :error="settlements.error.value"
        :entities="t('settlements.list.entities')"
        :caption="t('settlements.list.title')"
        @select="(s) => router.push(`/settlements/${s.id}`)"
        @retry="settlements.refetch()"
      >
        <template #cell-status="{ row }">
          <UBadge :color="SETTLEMENT_TONE[row.status]" variant="subtle">{{ t(`settlements.status.${row.status}`) }}</UBadge>
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
