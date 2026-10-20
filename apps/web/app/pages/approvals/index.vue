<script setup lang="ts">
import type { ListResponse } from '@elvine-sk/platform-core'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { onKeyStroke } from '@vueuse/core'
import type { DataTableColumn, DataTableStatusTab } from '../../components/platform/DataTable.vue'
import type { Decision, InboxItem, RequestSummary } from '../../types/approval'

definePageMeta({ title: 'approval.nav' })

const { t } = useI18n()
const { relative, dateTime } = useDates()
const notify = useNotify()
const access = useAccess()
const session = useSession()
const api = useApi()
const entities = useApprovalEntityRegistry()
const { bulk } = useApprovalActions()
// Out of office: while a delegation I gave is running, new approvals go to someone else.
const delegations = useApprovalDelegations()
const away = computed(() => {
  const me = session.user.value?.id
  const at = Date.now()
  return (delegations.list.data.value ?? []).filter(
    (d) => d.user.id === me && new Date(d.startsAt).getTime() <= at && new Date(d.endsAt).getTime() > at,
  )
})

useHead({ title: () => t('approval.title') })

const viewParam = useQueryParam('view')
const view = computed({
  get: () => viewParam.value ?? 'inbox',
  set: (v: string) => (viewParam.value = v === 'inbox' ? undefined : v),
})
const views = computed(() => [
  { value: 'inbox', label: t('approval.views.inbox'), icon: 'i-lucide-inbox' },
  { value: 'mine', label: t('approval.views.mine'), icon: 'i-lucide-send' },
  ...(access.can('approval_request.read_all')
    ? [{ value: 'all', label: t('approval.views.all'), icon: 'i-lucide-list' }]
    : []),
])

const inboxParams = computed(() => new URLSearchParams({ pageSize: '100', sort: 'submittedAt' }))
const inbox = useApiList<InboxItem>(
  APPROVAL_KEY,
  '/approval/inbox',
  { params: inboxParams },
  { refetchInterval: livePolling(60_000) },
)
const items = computed(() => inbox.data.value?.data ?? [])
const selectedId = useQueryParam('request')
const showDetail = ref(false)
watch(
  items,
  (list) => {
    // Before the first load the list is empty; resetting then would drop a `?request=` deep link.
    if (view.value !== 'inbox' || !inbox.data.value) return
    if (!list.some((i) => i.requestId === selectedId.value)) selectedId.value = list[0]?.requestId
  },
  { immediate: true },
)
const index = computed(() => items.value.findIndex((i) => i.requestId === selectedId.value))
function select(id: string | undefined, reveal = true) {
  selectedId.value = id
  if (reveal) showDetail.value = true
  nextTick(() => document.querySelector(`[data-request="${id}"]`)?.scrollIntoView({ block: 'nearest' }))
}
function move(dir: 1 | -1) {
  const list = items.value
  if (!list.length) return
  const next = list[Math.min(list.length - 1, Math.max(0, index.value + dir))]
  select(next?.requestId, false)
}
function afterAct() {
  const list = items.value
  const next = list[index.value + 1] ?? list[index.value - 1]
  selectedId.value = next?.requestId
}

const view$ = useTemplateRef<{ decide: (d: Decision) => void; focus: () => void }>('requestView')
const typing = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null
  return !!el?.closest(
    'input, textarea, select, [contenteditable], [role="dialog"], [role="menu"], [role="listbox"]',
  )
}
const shortcut = (fn: () => void) => (e: KeyboardEvent) => {
  if (view.value !== 'inbox' || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return
  e.preventDefault()
  fn()
}
onKeyStroke(
  ['j', 'J'],
  shortcut(() => move(1)),
)
onKeyStroke(
  ['k', 'K'],
  shortcut(() => move(-1)),
)
onKeyStroke(
  ['a', 'A'],
  shortcut(() => view$.value?.decide('approve')),
)
onKeyStroke(
  ['r', 'R'],
  shortcut(() => view$.value?.decide('reject')),
)

const checked = ref<string[]>([])
watch(items, (list) => (checked.value = checked.value.filter((id) => list.some((i) => i.requestId === id))))
const allChecked = computed({
  get: () =>
    items.value.length && checked.value.length === items.value.length
      ? true
      : checked.value.length
        ? 'indeterminate'
        : false,
  set: (v) => (checked.value = v ? items.value.map((i) => i.requestId) : []),
})
function toggle(id: string, on: boolean | 'indeterminate') {
  checked.value = on ? [...new Set([...checked.value, id])] : checked.value.filter((x) => x !== id)
}

const bulkOpen = ref(false)
const bulkDecision = ref<Decision>('approve')
const bulkComment = ref('')
const bulkError = ref<string | null>(null)
function openBulk(decision: Decision) {
  bulkDecision.value = decision
  bulkComment.value = ''
  bulkError.value = null
  bulkOpen.value = true
}
async function runBulk() {
  if (commentRequired(bulkDecision.value) && !bulkComment.value.trim()) {
    bulkError.value = t('approval.decide.commentRequired')
    return
  }
  try {
    const results = await bulk.mutateAsync({
      requestIds: checked.value,
      decision: bulkDecision.value,
      comment: bulkComment.value,
    })
    const ok = results.filter((r) => r.ok).length
    const failed = results.filter((r) => !r.ok)
    bulkOpen.value = false
    checked.value = failed.map((r) => r.requestId)
    if (ok) notify.success(t(`approval.bulk.done.${bulkDecision.value}`, { n: ok }, ok))
    if (failed.length)
      notify.error(
        new Error(
          t(
            'approval.bulk.failed',
            { n: failed.length, reason: failed[0]!.error?.message ?? '' },
            failed.length,
          ),
        ),
      )
  } catch (error) {
    bulkError.value = notify.messageOf(error)
  }
}

const list = useListQuery({ defaults: { sort: [{ field: 'submittedAt', dir: 'desc' }] } })
const requestParams = computed(() => {
  const params = new URLSearchParams(list.params.value)
  if (view.value === 'mine' && session.user.value)
    params.set('filter[submittedBy][eq]', session.user.value.id)
  return params
})
const requests = useQuery<ListResponse<RequestSummary>, Error>({
  queryKey: [APPROVAL_KEY, 'requests', () => view.value, () => requestParams.value.toString()],
  enabled: () => view.value !== 'inbox',
  queryFn: ({ signal }) =>
    api<ListResponse<RequestSummary>>(`/approval/requests?${requestParams.value}`, { signal }),
  placeholderData: keepPreviousData,
})
const columns = computed<DataTableColumn<RequestSummary>[]>(() => [
  { key: 'entityType', label: t('approval.columns.record'), locked: true, primary: true },
  { key: 'status', label: t('approval.columns.status'), card: true },
  ...(view.value === 'all'
    ? [{ key: 'submittedBy', label: t('approval.columns.submittedBy'), card: true }]
    : []),
  { key: 'round', label: t('approval.columns.round'), mono: true, hiddenByDefault: true },
  { key: 'submittedAt', label: t('approval.columns.submitted'), sortable: true },
  { key: 'completedAt', label: t('approval.columns.completed'), align: 'end', card: true },
])
// "My requests" is already narrowed to the caller, so the submitter is offered only in "All requests".
const filterLabels = computed(() => ({
  entityType: t('approval.columns.record'),
  ...(view.value === 'all' ? { submittedBy: t('approval.columns.submittedBy') } : {}),
  submittedAt: t('approval.columns.submitted'),
}))
const statusTabs = computed<DataTableStatusTab[]>(() => [
  { label: t('platform.list.all'), value: null },
  ...(['pending', 'returned', 'approved', 'rejected', 'cancelled'] as const).map((s) => ({
    label: t(`approval.status.${s}`),
    value: s,
  })),
])

const dueTone = { overdue: 'danger', today: 'warning', soon: 'warning', later: 'neutral' } as const
</script>

<template>
  <div>
    <PlatformPageHeader
      :eyebrow="t('nav.workspace')"
      :title="t('approval.title')"
      :subtitle="t('approval.subtitle')"
    >
      <template #actions>
        <PlatformSegmented v-model="view" :options="views" :label="t('approval.views.label')" />
      </template>
    </PlatformPageHeader>

    <UAlert
      v-if="away.length"
      color="warning"
      variant="subtle"
      icon="i-lucide-forward"
      class="mb-4"
      data-testid="away-banner"
      :title="
        away.length === 1
          ? t('approval.away.one', { name: away[0]!.delegate.displayName, until: dateTime(away[0]!.endsAt) })
          : t('approval.away.many', { n: away.length })
      "
      :description="t('approval.away.text')"
      :actions="[
        {
          label: t('approval.away.manage'),
          to: '/account?tab=delegations',
          color: 'neutral',
          variant: 'outline',
        },
      ]"
    />

    <div v-if="view === 'inbox'" class="card inbox" :class="{ 'show-detail': showDetail }">
      <div class="ib-list">
        <div class="ib-tools">
          <UCheckbox v-if="items.length" v-model="allChecked" :aria-label="t('platform.list.selectPage')" />
          <b class="text-[13.5px]">{{
            t(
              'approval.inbox.count',
              { n: inbox.data.value?.meta.total ?? 0 },
              inbox.data.value?.meta.total ?? 0,
            )
          }}</b>
          <UButton
            class="ms-auto"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-refresh-cw"
            :loading="inbox.isFetching.value"
            :aria-label="t('platform.actions.reload')"
            @click="inbox.refetch()"
          />
        </div>
        <div v-if="checked.length" class="ib-bulk" role="region" :aria-label="t('approval.bulk.label')">
          <span class="me-auto">{{ t('platform.list.selected', { n: checked.length }) }}</span>
          <UButton size="xs" color="error" variant="ghost" @click="openBulk('reject')">{{
            t('approval.decide.reject')
          }}</UButton>
          <UButton size="xs" color="success" icon="i-lucide-check-check" @click="openBulk('approve')">
            {{ t('approval.bulk.approve') }}
          </UButton>
        </div>
        <div class="ib-items">
          <div v-if="inbox.isPending.value" class="grid gap-2 p-3">
            <USkeleton v-for="n in 5" :key="n" class="h-14 w-full" />
          </div>
          <PlatformEmptyState
            v-else-if="!items.length"
            kind="all-done"
            :title="t('approval.inbox.emptyTitle')"
            :text="t('approval.inbox.emptyText')"
          />
          <ul
            v-else
            role="listbox"
            :aria-label="t('approval.views.inbox')"
            :aria-activedescendant="selectedId ? `ib-${selectedId}` : undefined"
          >
            <li
              v-for="item in items"
              :id="`ib-${item.requestId}`"
              :key="item.assignmentId"
              :data-request="item.requestId"
              role="option"
              :aria-selected="item.requestId === selectedId"
              class="ib-it"
              :class="{ on: item.requestId === selectedId }"
              @click="select(item.requestId)"
            >
              <UCheckbox
                :model-value="checked.includes(item.requestId)"
                :aria-label="t('approval.inbox.selectItem', { name: item.submittedBy.displayName })"
                @click.stop
                @update:model-value="(v) => toggle(item.requestId, v)"
              />
              <PlatformUserAvatar
                :name="item.submittedBy.displayName"
                :seed="item.submittedBy.id"
                size="sm"
              />
              <div class="ib-t">
                <b>{{ entities.label(item.entityType) }} · {{ item.submittedBy.displayName }}</b>
                <small>
                  <span class="truncate capitalize">{{ item.stageKey.replaceAll(/[_-]/g, ' ') }}</span>
                  <span aria-hidden="true">·</span>
                  <time :datetime="item.submittedAt" :title="dateTime(item.submittedAt)">{{
                    relative(item.submittedAt)
                  }}</time>
                  <UTooltip
                    v-if="item.delegatedFrom"
                    :text="t('approval.inbox.delegatedFrom', { name: item.delegatedFrom.displayName })"
                  >
                    <UIcon name="i-lucide-forward" class="size-3.5 shrink-0" />
                  </UTooltip>
                </small>
              </div>
              <template v-for="due in [dueInfo(item.dueAt)]" :key="'due'">
                <PlatformStatusBadge
                  v-if="due"
                  :tone="dueTone[due.kind]"
                  :dot="false"
                  :label="t(`approval.due.${due.kind}`, { n: due.days }, due.days)"
                />
              </template>
            </li>
          </ul>
        </div>
      </div>
      <div class="ib-detail">
        <PlatformApprovalRequestView
          v-if="selectedId"
          ref="requestView"
          :id="selectedId"
          shortcuts
          back
          @acted="afterAct"
          @back="showDetail = false"
        />
        <PlatformEmptyState
          v-else
          kind="all-done"
          icon="i-lucide-stamp"
          :title="t('approval.inbox.pickTitle')"
        />
      </div>
    </div>

    <UCard v-else :ui="{ body: 'p-0 sm:p-0' }">
      <PlatformDataTable
        :id="`approval-${view}`"
        :rows="requests.data.value?.data ?? []"
        :total="requests.data.value?.meta.total ?? 0"
        :columns="columns"
        :list="list"
        list-key="approval_requests"
        view-param="saved"
        :filter-labels="filterLabels"
        :filter-user-fields="['submittedBy']"
        :loading="requests.isPending.value"
        :fetching="requests.isFetching.value"
        :error="requests.error.value"
        :status-tabs="statusTabs"
        :searchable="false"
        :entities="t('approval.entities')"
        :caption="t('approval.title')"
        @select="(r) => navigateTo(`/approvals/${r.id}`)"
        @retry="requests.refetch()"
      >
        <template #cell-entityType="{ row }">
          <span class="inline-flex min-w-0 items-center gap-2">
            <UIcon :name="entities.icon(row.entityType)" class="size-4 shrink-0 text-[var(--app-accent)]" />
            <span class="truncate font-medium">{{ entities.label(row.entityType) }}</span>
            <span class="muted font-mono text-[12px]">#{{ row.entityId.slice(-6) }}</span>
          </span>
        </template>
        <template #cell-status="{ row }">
          <PlatformStatusBadge
            :tone="REQUEST_STATUS_TONES[row.status]"
            :label="t(`approval.status.${row.status}`)"
          />
        </template>
        <template #cell-submittedBy="{ row }">
          <span class="inline-flex items-center gap-2">
            <PlatformUserAvatar :name="row.submittedBy.displayName" :seed="row.submittedBy.id" size="xs" />
            {{ row.submittedBy.displayName }}
          </span>
        </template>
        <template #cell-submittedAt="{ row }">
          <time :datetime="row.submittedAt" :title="dateTime(row.submittedAt)">{{
            relative(row.submittedAt)
          }}</time>
        </template>
        <template #cell-completedAt="{ row }">
          <time v-if="row.completedAt" :datetime="row.completedAt" :title="dateTime(row.completedAt)">{{
            relative(row.completedAt)
          }}</time>
          <span v-else class="muted">—</span>
        </template>
      </PlatformDataTable>
    </UCard>

    <UModal
      v-model:open="bulkOpen"
      :title="t(`approval.bulk.title.${bulkDecision}`, { n: checked.length }, checked.length)"
    >
      <template #body>
        <form id="bulk-form" class="grid gap-3" @submit.prevent="runBulk">
          <UFormField
            :label="t('approval.decide.comment')"
            :hint="t('platform.input.chars', { n: bulkComment.length, max: 2000 })"
            :required="commentRequired(bulkDecision)"
            :error="bulkError ?? undefined"
          >
            <UTextarea v-model="bulkComment" :rows="3" :maxlength="2000" class="w-full" autofocus />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="bulkOpen = false">{{
            t('platform.actions.cancel')
          }}</UButton>
          <UButton
            type="submit"
            form="bulk-form"
            :color="bulkDecision === 'approve' ? 'success' : 'error'"
            :loading="bulk.isPending.value"
          >
            {{ t(`approval.decide.${bulkDecision}`) }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.inbox {
  display: grid;
  grid-template-columns: minmax(300px, 390px) minmax(0, 1fr);
  height: calc(100dvh - 220px);
  min-height: 540px;
  overflow: hidden;
}
.ib-list {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-inline-end: 1px solid var(--app-border);
}
.ib-tools {
  display: flex;
  flex: none;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--app-border);
}
.ib-bulk {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  margin: 8px 12px;
  padding: 6px 6px 6px 12px;
  border: 1px solid color-mix(in oklab, var(--app-accent) 30%, transparent);
  border-radius: var(--app-r-sm);
  background: color-mix(in oklab, var(--app-accent) 9%, var(--app-surface));
  font-size: 13px;
}
.ib-items {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.ib-items ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.ib-it {
  position: relative;
  display: grid;
  grid-template-columns: auto 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  border-bottom: 1px solid var(--app-border);
  cursor: pointer;
  transition: background var(--app-dur-fast);
}
.ib-it:hover {
  background: var(--app-hover);
}
.ib-it.on {
  background: color-mix(in oklab, var(--app-accent) 9%, var(--app-surface));
}
.ib-it.on::before {
  content: '';
  position: absolute;
  top: 8px;
  bottom: 8px;
  inset-inline-start: 0;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--app-grad);
}
.ib-t {
  min-width: 0;
}
.ib-t b {
  display: block;
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ib-t small {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
  overflow: hidden;
  color: var(--app-muted);
  font-size: 12px;
  white-space: nowrap;
}
.ib-detail {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: var(--app-pad);
  overflow: auto;
}
@media (max-width: 900px) {
  .inbox {
    grid-template-columns: 1fr;
    height: auto;
    min-height: 0;
  }
  .ib-detail {
    display: none;
  }
  .inbox.show-detail .ib-list {
    display: none;
  }
  .inbox.show-detail .ib-detail {
    display: flex;
  }
}
</style>
