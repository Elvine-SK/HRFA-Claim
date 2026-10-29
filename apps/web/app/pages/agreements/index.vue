<script setup lang="ts">
import type { DataTableColumn } from '../../components/platform/DataTable.vue'

definePageMeta({ title: 'agreements.nav.title' })

const { t } = useI18n()
const access = useAccess()
const notify = useNotify()
const router = useRouter()
const { dateTime, relative } = useDates()
useHead({ title: () => t('agreements.list.title') })

const list = useListQuery({ defaults: { sort: [{ field: 'createdAt', dir: 'desc' }] } })
const agreements = useApiList<AgreementListItem>(AGREEMENTS_KEY, '/agreements', list)
const canCreate = computed(() => access.canSome('agreement.create'))

const columns = computed<DataTableColumn<AgreementListItem>[]>(() => [
  { key: 'ref', label: t('agreements.field.ref'), sortable: true, mono: true, locked: true, primary: true },
  { key: 'docNo', label: t('agreements.field.docNo'), sortable: true, mono: true, card: true },
  { key: 'subject', label: t('agreements.field.subject'), card: true },
  { key: 'formType', label: t('agreements.field.formType'), card: true, value: (r) => t(`agreements.formType.${r.formType}`) },
  { key: 'travelFrom', label: t('agreements.field.travelFrom'), sortable: true, mono: true, value: (r) => formatDayFirst(r.travelFrom) },
  { key: 'status', label: t('agreements.field.status'), card: true },
  { key: 'createdAt', label: t('agreements.field.createdAt'), sortable: true, align: 'end' },
])
const filterLabels = computed(() => ({
  status: t('agreements.field.status'),
  formType: t('agreements.field.formType'),
  branchCode: t('agreements.field.branch'),
  travelFrom: t('agreements.field.travelFrom'),
}))
const filterValueLabels = computed(() => ({
  status: Object.fromEntries((['draft', 'in_approval', 'approved', 'cancelled'] as const).map((s) => [s, t(`agreements.status.${s}`)])),
  formType: Object.fromEntries(FORM_TYPES.map((f) => [f, t(`agreements.formType.${f}`)])),
}))

const { lookup } = useAgreementMutations()
const number = ref('')
async function find() {
  if (!number.value.trim()) return
  try {
    const found = await lookup.mutateAsync(number.value)
    await router.push(`/agreements/${found.id}`)
  } catch (error) {
    notify.error(error)
  }
}
</script>

<template>
  <div>
    <PlatformPageHeader :title="t('agreements.list.title')" :subtitle="t('agreements.list.subtitle')">
      <template v-if="canCreate" #actions>
        <UDropdownMenu
          :items="FORM_TYPES.map((f) => ({ label: t(`agreements.formType.${f}`), to: `/agreements/new?form=${f}` }))"
        >
          <UButton icon="i-lucide-plus" trailing-icon="i-lucide-chevron-down">{{ t('agreements.list.new') }}</UButton>
        </UDropdownMenu>
      </template>
    </PlatformPageHeader>

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

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <PlatformDataTable
        id="agreements"
        :rows="agreements.data.value?.data ?? []"
        :total="agreements.data.value?.meta.total ?? 0"
        :columns="columns"
        :list="list"
        list-key="agreements"
        :filter-labels="filterLabels"
        :filter-value-labels="filterValueLabels"
        :loading="agreements.isPending.value"
        :fetching="agreements.isFetching.value"
        :error="agreements.error.value"
        :entities="t('agreements.list.entities')"
        :caption="t('agreements.list.title')"
        @select="(a) => router.push(`/agreements/${a.id}`)"
        @retry="agreements.refetch()"
      >
        <template #cell-status="{ row }">
          <UBadge :color="STATUS_TONE[row.status]" variant="subtle">{{ t(`agreements.status.${row.status}`) }}</UBadge>
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
