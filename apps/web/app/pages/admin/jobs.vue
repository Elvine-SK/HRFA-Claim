<script setup lang="ts">
import type { DataTableColumn, DataTableStatusTab } from '../../components/platform/DataTable.vue'
import type { StatItem } from '../../components/platform/StatStrip.vue'
import type { Job, JobDetail, JobsOverview, JobStatus } from '../../types/platform'

definePageMeta({ title: 'admin.nav.jobs', permission: 'job.read' })

const { t } = useI18n()
const { dateTime, relative } = useDates()
const notify = useNotify()
const action = useAdminAction()

useHead({ title: () => t('admin.nav.jobs') })

const STATUSES: JobStatus[] = ['queued', 'running', 'succeeded', 'dead']
const list = useListQuery({ defaults: { sort: [{ field: 'createdAt', dir: 'desc' }] } })
const jobs = useApiList<Job>(ADMIN_KEY, '/jobs', list, {
  refetchInterval: (query: { state: { data?: { data: Job[] } } }) =>
    query.state.data?.data.some((j) => j.status === 'running' || j.status === 'queued') ? 5000 : false,
})

const columns = computed<DataTableColumn<Job>[]>(() => [
  { key: 'name', label: t('admin.jobs.name'), sortable: true, locked: true, primary: true },
  { key: 'status', label: t('admin.jobs.status'), card: true },
  { key: 'attempts', label: t('admin.jobs.attempts'), mono: true, card: true },
  { key: 'queue', label: t('admin.jobs.queue'), sortable: true, mono: true, hiddenByDefault: true },
  { key: 'runAt', label: t('admin.jobs.runAt'), sortable: true },
  { key: 'createdAt', label: t('admin.jobs.created'), sortable: true, align: 'end' },
])
const filterLabels = computed(() => ({
  name: t('admin.jobs.name'),
  queue: t('admin.jobs.queue'),
  attempts: t('admin.jobs.attempts'),
  runAt: t('admin.jobs.runAt'),
  createdAt: t('admin.jobs.created'),
  finishedAt: t('admin.jobs.finished'),
}))
const overview = useApiItem<JobsOverview>(ADMIN_KEY, '/jobs/overview', {
  refetchInterval: livePolling(15_000),
})
const statusTabs = computed<DataTableStatusTab[]>(() => {
  const o = overview.data.value
  return [
    {
      label: t('platform.list.all'),
      value: null,
      count: o ? o.queued + o.running + o.succeeded + o.dead : undefined,
    },
    ...STATUSES.map((s) => ({ label: t(`admin.jobs.statuses.${s}`), value: s, count: o?.[s] })),
  ]
})
// A number filters the list by that status (not by its time window); clicking it again shows every job.
const statusStat = (status: JobStatus) => {
  const active = list.filterValue('status', 'eq') === status
  return { active, onClick: () => void list.setFilter('status', 'eq', active ? undefined : status) }
}
/** How long the oldest due job has waited, in the largest unit that fits. */
function waited(since: string): { value: number; unit: string } {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60_000))
  if (minutes < 60) return { value: minutes, unit: t('admin.jobs.stats.minutes') }
  if (minutes < 60 * 48) return { value: Math.floor(minutes / 60), unit: t('admin.jobs.stats.hours') }
  return { value: Math.floor(minutes / 1440), unit: t('admin.jobs.stats.days') }
}
const stats = computed<StatItem[]>(() => {
  const o = overview.data.value
  const recent = o ? t('admin.jobs.stats.lastHours', { n: o.windowHours }) : undefined
  const oldest = o?.oldestQueuedAt ? waited(o.oldestQueuedAt) : null
  return [
    {
      label: t('admin.jobs.stats.queued'),
      value: o?.queued,
      icon: 'i-lucide-list-ordered',
      tone: 'info',
      hint: t('admin.jobs.stats.queuedHint'),
      ...statusStat('queued'),
    },
    {
      label: t('admin.jobs.stats.running'),
      value: o?.running,
      icon: 'i-lucide-loader',
      tone: 'accent',
      hint: t('admin.jobs.stats.runningHint'),
      ...statusStat('running'),
    },
    {
      label: t('admin.jobs.stats.failed'),
      value: o?.failedRecently,
      icon: 'i-lucide-circle-x',
      tone: o?.failedRecently ? 'danger' : 'neutral',
      hint: recent,
      ...statusStat('dead'),
    },
    {
      label: t('admin.jobs.stats.succeeded'),
      value: o?.succeededRecently,
      icon: 'i-lucide-circle-check',
      tone: 'success',
      hint: recent,
      ...statusStat('succeeded'),
    },
    {
      label: t('admin.jobs.stats.oldest'),
      value: o ? (oldest?.value ?? '—') : undefined,
      unit: oldest?.unit,
      icon: 'i-lucide-hourglass',
      tone: oldest ? 'warning' : 'neutral',
      hint: o?.oldestQueuedAt
        ? t('admin.jobs.stats.dueSince', { when: dateTime(o.oldestQueuedAt) })
        : t('admin.jobs.stats.nothingWaiting'),
    },
  ]
})

const selectedId = useQueryParam('job')
const open = computed({
  get: () => !!selectedId.value,
  set: (v) => {
    if (!v) selectedId.value = undefined
  },
})
const detail = useApiItem<JobDetail>(ADMIN_KEY, () => (selectedId.value ? `/jobs/${selectedId.value}` : null))
const job = computed(() => detail.data.value)

async function retry(id: string) {
  try {
    await action.mutateAsync({ path: `/jobs/${id}/retry` })
    notify.success(t('admin.jobs.retried'))
  } catch (error) {
    notify.error(error)
  }
}
</script>

<template>
  <div>
    <PlatformPageHeader
      :eyebrow="t('admin.nav.group')"
      :title="t('admin.jobs.title')"
      :subtitle="t('admin.jobs.subtitle')"
    />
    <PlatformStatStrip :items="stats" :loading="overview.isPending.value" />

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <PlatformDataTable
        id="admin-jobs"
        :rows="jobs.data.value?.data ?? []"
        :total="jobs.data.value?.meta.total ?? 0"
        :columns="columns"
        :list="list"
        list-key="jobs"
        :filter-labels="filterLabels"
        :loading="jobs.isPending.value"
        :fetching="jobs.isFetching.value"
        :error="jobs.error.value"
        :status-tabs="statusTabs"
        :entities="t('admin.jobs.entities')"
        :caption="t('admin.jobs.title')"
        @select="(j) => (selectedId = j.id)"
        @retry="jobs.refetch()"
      >
        <template #cell-name="{ row, q }">
          <span class="mono truncate text-[12.5px] font-medium"
            ><PlatformHighlight :text="row.name" :query="q"
          /></span>
        </template>
        <template #cell-status="{ row }">
          <PlatformStatusBadge
            :tone="JOB_STATUS_TONES[row.status]"
            :label="t(`admin.jobs.statuses.${row.status}`)"
          />
        </template>
        <template #cell-attempts="{ row }">{{ row.attempts }} / {{ row.maxAttempts }}</template>
        <template #cell-runAt="{ row }">
          <UTooltip :text="dateTime(row.runAt)"
            ><time :datetime="row.runAt">{{ relative(row.runAt) }}</time></UTooltip
          >
        </template>
        <template #cell-createdAt="{ row }">
          <UTooltip :text="dateTime(row.createdAt)"
            ><time :datetime="row.createdAt">{{ relative(row.createdAt) }}</time></UTooltip
          >
        </template>
        <template #empty>
          <PlatformEmptyState
            kind="all-done"
            :title="t('admin.jobs.emptyTitle')"
            :text="t('admin.jobs.emptyText')"
          />
        </template>
      </PlatformDataTable>
    </UCard>

    <PlatformEntityDrawer
      v-model:open="open"
      :title="job?.name ?? ''"
      :subtitle="job?.queue"
      icon="i-lucide-list-checks"
      :loading="detail.isPending.value"
      width="editor"
    >
      <template v-if="job" #badges>
        <PlatformStatusBadge
          :tone="JOB_STATUS_TONES[job.status]"
          :label="t(`admin.jobs.statuses.${job.status}`)"
        />
        <UBadge color="neutral" variant="subtle">{{
          t('admin.jobs.attemptsOf', { n: job.attempts, max: job.maxAttempts })
        }}</UBadge>
      </template>
      <template v-if="job?.status === 'dead'" #actions>
        <UButton
          v-can.disable="'job.manage'"
          icon="i-lucide-rotate-cw"
          :loading="action.isPending.value"
          @click="retry(job.id)"
        >
          {{ t('admin.jobs.retry') }}
        </UButton>
      </template>
      <template v-if="job">
        <UAlert
          v-if="job.lastError"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="t('admin.jobs.lastError')"
          class="mx-[var(--app-pad)] mt-4"
        >
          <template #description>
            <pre class="mono err">{{ job.lastError }}</pre>
          </template>
        </UAlert>
        <PlatformDrawerSection :title="t('admin.jobs.timing')">
          <PlatformKeyValue
            :items="[
              { label: t('admin.jobs.created'), value: dateTime(job.createdAt) },
              { label: t('admin.jobs.runAt'), value: dateTime(job.runAt) },
              { label: t('admin.jobs.finished'), value: job.finishedAt ? dateTime(job.finishedAt) : null },
              { label: 'ID', value: job.id, key: 'id' },
            ]"
          >
            <template #id="{ item: kv }"
              ><span class="mono text-[12px]">{{ kv.value }}</span></template
            >
          </PlatformKeyValue>
        </PlatformDrawerSection>
        <PlatformDrawerSection :title="t('admin.jobs.payload')">
          <PlatformJsonView :value="job.payload" />
        </PlatformDrawerSection>
        <PlatformDrawerSection
          v-if="job.result !== null && job.result !== undefined"
          :title="t('admin.jobs.result')"
        >
          <PlatformJsonView :value="job.result" />
        </PlatformDrawerSection>
      </template>
    </PlatformEntityDrawer>
  </div>
</template>

<style scoped>
.err {
  max-height: 200px;
  overflow: auto;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
