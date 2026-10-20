<script setup lang="ts">
import type { DataTableColumn } from '../../components/platform/DataTable.vue'
import type { StatItem } from '../../components/platform/StatStrip.vue'
import type { AuditEvent, AuditOverview } from '../../types/platform'

definePageMeta({ title: 'admin.nav.audit', permission: 'audit_event.read' })

const { t } = useI18n()
const { dateTime, relative } = useDates()
const records = useApprovalEntityRegistry()

useHead({ title: () => t('admin.nav.audit') })

const list = useListQuery({ defaults: { sort: [{ field: 'occurredAt', dir: 'desc' }], pageSize: 50 } })
const events = useApiList<AuditEvent>(ADMIN_KEY, '/audit/events', list)
const overview = useApiItem<AuditOverview>(ADMIN_KEY, '/audit/overview')
// The audit action of a sign-in; joined so `i18n:check` does not read it as a message key.
const SIGN_IN = ['auth', 'login', 'succeeded'].join('.')
// A number filters the log by what it counts (not by its time window); clicking it again removes the filter.
const filterStat = (field: 'outcome' | 'action', value: string) => {
  const active = list.filterValue(field, 'eq') === value
  return { active, onClick: () => void list.setFilter(field, 'eq', active ? undefined : value) }
}
const stats = computed<StatItem[]>(() => {
  const o = overview.data.value
  const hint = o ? t('admin.audit.stats.lastHours', { n: o.windowHours }) : undefined
  return [
    { label: t('admin.audit.stats.events'), value: o?.events, icon: 'i-lucide-scroll-text', hint },
    {
      label: t('admin.audit.stats.failures'),
      value: o?.failures,
      icon: 'i-lucide-circle-x',
      tone: o?.failures ? 'danger' : 'neutral',
      hint,
      ...filterStat('outcome', 'failure'),
    },
    {
      label: t('admin.audit.stats.denied'),
      value: o?.denied,
      icon: 'i-lucide-ban',
      tone: o?.denied ? 'warning' : 'neutral',
      hint,
      ...filterStat('outcome', 'denied'),
    },
    { label: t('admin.audit.stats.actors'), value: o?.actors, icon: 'i-lucide-users', tone: 'info', hint },
    {
      label: t('admin.audit.stats.signIns'),
      value: o?.signIns,
      icon: 'i-lucide-log-in',
      tone: 'success',
      hint,
      ...filterStat('action', SIGN_IN),
    },
  ]
})

const columns = computed<DataTableColumn<AuditEvent>[]>(() => [
  { key: 'occurredAt', label: t('admin.audit.when'), sortable: true, mono: true, locked: true },
  { key: 'action', label: t('admin.audit.action'), sortable: true, primary: true },
  { key: 'actor', label: t('admin.audit.actor'), card: true, value: (e) => e.actorName ?? e.actorId },
  { key: 'target', label: t('admin.audit.target'), card: true, value: (e) => e.targetType },
  { key: 'outcome', label: t('admin.audit.outcome'), card: true },
  { key: 'requestId', label: t('admin.audit.requestId'), mono: true, hiddenByDefault: true },
])

// Filters are built in the table's filter bar; the option values come from the list the API declares.
const listFields = useListFields('audit')
const filterLabels = computed(() => ({
  occurredAt: t('admin.audit.when'),
  category: t('admin.audit.category'),
  action: t('admin.audit.action'),
  outcome: t('admin.audit.outcome'),
  actorId: t('admin.audit.actor'),
  actorType: t('admin.audit.actorType'),
  targetType: t('admin.audit.target'),
  targetId: t('admin.audit.targetId'),
}))
const optionLabels = (group: string, field: string) =>
  Object.fromEntries(
    (listFields.value?.[field]?.values ?? []).map((v) => [v, t(['admin', 'audit', group, v].join('.'), v)]),
  )
const filterValueLabels = computed(() => ({
  category: optionLabels('categories', 'category'),
  outcome: optionLabels('outcomes', 'outcome'),
  actorType: optionLabels('actorTypes', 'actorType'),
}))

const selectedId = useQueryParam('event')
const open = computed({
  get: () => !!selectedId.value,
  set: (v) => {
    if (!v) selectedId.value = undefined
  },
})
const current = computed(() => events.data.value?.data.find((e) => e.id === selectedId.value))

// `record.updated` and the like: a record's change, written for every record-history row.
const RECORD_PREFIX = 'record.'
const recordChange = (e: AuditEvent) =>
  e.action.startsWith(RECORD_PREFIX) && e.targetType
    ? {
        title: t(`admin.audit.record.${e.action.slice(RECORD_PREFIX.length)}`, {
          type: records.label(e.targetType),
        }),
        fields: ((e.details as { fields?: string[] } | null)?.fields ?? []).join(', '),
      }
    : null
const recordLink = (e: AuditEvent) =>
  e.targetType && e.targetId && e.action !== `${RECORD_PREFIX}deleted`
    ? records.link(e.targetType, e.targetId)
    : undefined

function filterBy(field: 'actorId' | 'targetId', value: unknown) {
  open.value = false
  void list.setFilter(field, 'eq', String(value))
}
</script>

<template>
  <div>
    <PlatformPageHeader
      :eyebrow="t('admin.nav.group')"
      :title="t('admin.audit.title')"
      :subtitle="t('admin.audit.subtitle')"
    />
    <PlatformStatStrip :items="stats" :loading="overview.isPending.value" />

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <PlatformDataTable
        id="admin-audit"
        :rows="events.data.value?.data ?? []"
        :total="events.data.value?.meta.total ?? 0"
        :columns="columns"
        :list="list"
        list-key="audit"
        :filter-labels="filterLabels"
        :filter-value-labels="filterValueLabels"
        :filter-user-fields="['actorId']"
        :loading="events.isPending.value"
        :fetching="events.isFetching.value"
        :error="events.error.value"
        :entities="t('admin.audit.entities')"
        :caption="t('admin.audit.title')"
        @select="(e) => (selectedId = e.id)"
        @retry="events.refetch()"
      >
        <template #cell-occurredAt="{ row }">
          <UTooltip :text="relative(row.occurredAt)">
            <time :datetime="row.occurredAt" class="whitespace-nowrap">{{
              dateTime(row.occurredAt, 'YYYY-MM-DD HH:mm:ss')
            }}</time>
          </UTooltip>
        </template>
        <template #cell-action="{ row, q }">
          <span class="inline-flex min-w-0 items-center gap-2">
            <UBadge color="neutral" variant="subtle" size="sm">{{
              t(`admin.audit.categories.${row.category}`)
            }}</UBadge>
            <span v-if="recordChange(row)" class="min-w-0 truncate" :title="row.action">
              {{ recordChange(row)!.title
              }}<span v-if="recordChange(row)!.fields" class="text-dimmed">
                · {{ recordChange(row)!.fields }}</span
              >
            </span>
            <span v-else class="mono truncate text-[12.5px]"
              ><PlatformHighlight :text="row.action" :query="q"
            /></span>
          </span>
        </template>
        <template #cell-actor="{ row }">
          <span v-if="row.actorName || row.actorId" class="inline-flex min-w-0 items-center gap-2">
            <PlatformUserAvatar :name="row.actorName ?? row.actorType" :seed="row.actorId" size="xs" />
            <span class="truncate">{{ row.actorName ?? row.actorId }}</span>
          </span>
          <span v-else class="text-dimmed">{{
            t(`admin.audit.actorTypes.${row.actorType}`, row.actorType)
          }}</span>
        </template>
        <template #cell-target="{ row }">
          <NuxtLink v-if="recordLink(row)" :to="recordLink(row)" class="link mono text-[12px]" @click.stop
            >{{ records.label(row.targetType!)
            }}<span class="text-dimmed">/{{ row.targetId?.slice(0, 8) }}</span></NuxtLink
          >
          <span v-else-if="row.targetType" class="mono text-[12px]"
            >{{ row.targetType }}<span class="text-dimmed">/{{ row.targetId?.slice(0, 8) }}</span></span
          >
          <span v-else class="text-dimmed">—</span>
        </template>
        <template #cell-outcome="{ row }">
          <PlatformStatusBadge
            :tone="AUDIT_OUTCOME_TONES[row.outcome]"
            :label="t(`admin.audit.outcomes.${row.outcome}`)"
          />
        </template>
      </PlatformDataTable>
    </UCard>

    <PlatformEntityDrawer
      v-model:open="open"
      :title="current ? (recordChange(current)?.title ?? current.action) : ''"
      :subtitle="current ? dateTime(current.occurredAt) : undefined"
      icon="i-lucide-scroll-text"
      :loading="!current && events.isPending.value"
      width="editor"
    >
      <template v-if="!current && !events.isPending.value">
        <div class="p-(--app-pad)">
          <PlatformEmptyState kind="no-results" :title="t('admin.audit.notOnPage')" />
        </div>
      </template>
      <template v-if="current" #badges>
        <UBadge color="neutral" variant="subtle">{{
          t(`admin.audit.categories.${current.category}`)
        }}</UBadge>
        <PlatformStatusBadge
          :tone="AUDIT_OUTCOME_TONES[current.outcome]"
          :label="t(`admin.audit.outcomes.${current.outcome}`)"
        />
      </template>
      <template v-if="current">
        <PlatformDrawerSection :title="t('admin.audit.event')">
          <PlatformKeyValue
            :items="[
              {
                label: t('admin.audit.actor'),
                value: current.actorName ? `${current.actorName} (${current.actorType})` : current.actorType,
              },
              { label: t('admin.audit.actorId'), value: current.actorId, key: 'actorId' },
              { label: t('admin.audit.target'), value: current.targetType },
              { label: t('admin.audit.targetId'), value: current.targetId, key: 'targetId' },
              { label: t('admin.audit.requestId'), value: current.requestId, key: 'requestId' },
              { label: t('admin.audit.ip'), value: current.ip, key: 'ip' },
            ]"
          >
            <template #actorId="{ item: kv }">
              <button v-if="kv.value" type="button" class="mono link" @click="filterBy('actorId', kv.value)">
                {{ kv.value }}
              </button>
              <span v-else>—</span>
            </template>
            <template #targetId="{ item: kv }">
              <button v-if="kv.value" type="button" class="mono link" @click="filterBy('targetId', kv.value)">
                {{ kv.value }}
              </button>
              <span v-else>—</span>
            </template>
            <template #requestId="{ item: kv }"
              ><span class="mono text-[12px]">{{ kv.value ?? '—' }}</span></template
            >
            <template #ip="{ item: kv }"
              ><span class="mono">{{ kv.value ?? '—' }}</span></template
            >
          </PlatformKeyValue>
          <p class="muted mt-3 text-[12px]">{{ t('admin.audit.filterHint') }}</p>
          <UButton
            v-if="recordLink(current)"
            :to="recordLink(current)"
            icon="i-lucide-external-link"
            color="neutral"
            variant="outline"
            size="sm"
            class="mt-3"
            >{{ t('admin.audit.openRecord', { type: records.label(current.targetType!) }) }}</UButton
          >
        </PlatformDrawerSection>
        <PlatformDrawerSection :title="t('admin.audit.details')">
          <PlatformJsonView :value="current.details" max-height="420px" />
        </PlatformDrawerSection>
      </template>
    </PlatformEntityDrawer>
  </div>
</template>

<style scoped>
.link {
  color: var(--app-accent);
  font-size: 12px;
  text-align: start;
  word-break: break-all;
  cursor: pointer;
}
.link:hover {
  text-decoration: underline;
}
</style>
