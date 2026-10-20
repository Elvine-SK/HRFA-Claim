<script setup lang="ts">
import type { DataTableColumn } from '../../../components/platform/DataTable.vue'
import type { StatItem } from '../../../components/platform/StatStrip.vue'
import type {
  ApprovalEntities,
  WorkflowDetail,
  WorkflowsOverview,
  WorkflowSummary,
} from '../../../types/approval'

definePageMeta({ title: 'admin.nav.workflows', permission: 'approval_workflow.read' })

const { t } = useI18n()
const { relative, dateTime } = useDates()
const notify = useNotify()
const action = useAdminAction()
const entityNames = useApprovalEntityRegistry()

useHead({ title: () => t('admin.nav.workflows') })

const list = useListQuery({ defaults: { sort: [{ field: 'name', dir: 'asc' }] } })
const workflows = useApiList<WorkflowSummary>(ADMIN_KEY, '/approval/workflows', list)
const entities = useApiItem<ApprovalEntities>(ADMIN_KEY, '/approval/entities', { staleTime: 5 * 60_000 })
const overview = useApiItem<WorkflowsOverview>(ADMIN_KEY, '/approval/workflows/overview')
// "Live" and "Not active" filter the list by whether a workflow has a live version; again removes it.
const liveStat = (live: boolean) => {
  const value = list.filterValue('activeVersionId', 'isNull')
  const active = value !== undefined && String(value) === String(!live)
  return {
    active,
    onClick: () => void list.setFilter('activeVersionId', 'isNull', active ? undefined : !live),
  }
}
const stats = computed<StatItem[]>(() => {
  const o = overview.data.value
  return [
    { label: t('admin.workflows.stats.workflows'), value: o?.workflows, icon: 'i-lucide-git-fork' },
    {
      label: t('admin.workflows.stats.live'),
      value: o?.live,
      icon: 'i-lucide-circle-play',
      tone: 'success',
      hint: t('admin.workflows.stats.liveHint'),
      ...liveStat(true),
    },
    {
      label: t('admin.workflows.stats.inactive'),
      value: o?.inactive,
      icon: 'i-lucide-circle-pause',
      tone: 'neutral',
      hint: t('admin.workflows.stats.inactiveHint'),
      ...liveStat(false),
    },
    {
      label: t('admin.workflows.stats.open'),
      value: o?.openRequests,
      icon: 'i-lucide-hourglass',
      tone: 'info',
      hint: t('admin.workflows.stats.openHint'),
    },
    {
      label: t('admin.workflows.stats.noWorkflow'),
      value: o?.typesWithoutWorkflow,
      icon: 'i-lucide-triangle-alert',
      tone: o?.typesWithoutWorkflow ? 'warning' : 'neutral',
      hint: o ? t('admin.workflows.stats.ofTypes', { n: o.recordTypes }, o.recordTypes) : undefined,
    },
  ]
})
const columns = computed<DataTableColumn<WorkflowSummary>[]>(() => [
  { key: 'name', label: t('admin.workflows.name'), sortable: true, locked: true, primary: true },
  { key: 'key', label: t('admin.roles.key'), sortable: true, mono: true, card: true },
  { key: 'entityType', label: t('admin.workflows.entityType'), sortable: true, card: true },
  { key: 'activeVersionId', label: t('admin.workflows.state'), card: true },
  { key: 'updatedAt', label: t('admin.groups.updated'), sortable: true, align: 'end', card: true },
])
const filterLabels = computed(() => ({
  name: t('admin.workflows.name'),
  key: t('admin.roles.key'),
  entityType: t('admin.workflows.entityType'),
  isDefault: t('admin.workflows.default'),
  activeVersionId: t('admin.workflows.liveVersion'),
  updatedAt: t('admin.groups.updated'),
}))

const createOpen = ref(false)
const created = reactive({ key: '', name: '', entityType: '' })
const createErrors = useFormErrors<'key' | 'name' | 'entityType'>()
const entityItems = computed(() =>
  (entities.data.value?.entities ?? []).map((e) => ({
    value: e.type,
    label: entityNames.label(e.type),
    description: e.type,
  })),
)
function openCreate() {
  Object.assign(created, { key: '', name: '', entityType: entityItems.value[0]?.value ?? '' })
  createErrors.clear()
  createOpen.value = true
}
watch(
  () => created.name,
  (name, prev) => {
    const slug = (s: string) =>
      s
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64)
    if (!created.key || created.key === slug(prev ?? '')) created.key = slug(name)
  },
)
async function create() {
  createErrors.clear()
  if (!/^[a-z][a-z0-9_-]{1,63}$/.test(created.key)) createErrors.fields.key = t('admin.workflows.keyInvalid')
  if (!created.name.trim()) createErrors.fields.name = t('auth.errors.nameRequired')
  if (!created.entityType) createErrors.fields.entityType = t('admin.workflows.entityRequired')
  if (createErrors.fields.key || createErrors.fields.name || createErrors.fields.entityType) return
  try {
    const wf = (await action.mutateAsync({
      path: '/approval/workflows',
      body: { key: created.key, name: created.name.trim(), entityType: created.entityType },
    })) as WorkflowDetail
    createOpen.value = false
    notify.success(t('platform.toast.created'))
    await navigateTo(`/admin/workflows/${wf.id}`)
  } catch (error) {
    createErrors.apply(error, ['key', 'name', 'entityType'])
  }
}
</script>

<template>
  <div>
    <PlatformPageHeader
      :eyebrow="t('admin.nav.group')"
      :title="t('admin.workflows.title')"
      :subtitle="t('admin.workflows.subtitle')"
    >
      <template #actions>
        <UButton v-can="'approval_workflow.manage'" icon="i-lucide-plus" @click="openCreate">
          {{ t('admin.workflows.new') }}
        </UButton>
      </template>
    </PlatformPageHeader>

    <PlatformStatStrip :items="stats" :loading="overview.isPending.value" />

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <PlatformDataTable
        id="admin-workflows"
        :rows="workflows.data.value?.data ?? []"
        :total="workflows.data.value?.meta.total ?? 0"
        :columns="columns"
        :list="list"
        list-key="workflows"
        :filter-labels="filterLabels"
        :loading="workflows.isPending.value"
        :fetching="workflows.isFetching.value"
        :error="workflows.error.value"
        :entities="t('admin.workflows.entities')"
        :caption="t('admin.workflows.title')"
        @select="(w) => navigateTo(`/admin/workflows/${w.id}`)"
        @retry="workflows.refetch()"
      >
        <template #cell-name="{ row, q }">
          <span class="inline-flex min-w-0 items-start gap-2">
            <UIcon name="i-lucide-git-fork" class="mt-0.5 size-4 shrink-0 text-[var(--app-accent)]" />
            <span class="min-w-0">
              <span class="flex items-center gap-2">
                <span class="truncate font-medium"><PlatformHighlight :text="row.name" :query="q" /></span>
                <UBadge v-if="row.isDefault" color="primary" variant="subtle" size="sm">
                  {{ t('admin.workflows.default') }}
                </UBadge>
              </span>
              <span v-if="row.description" class="muted block truncate text-[12.5px]">{{
                row.description
              }}</span>
            </span>
          </span>
        </template>
        <template #cell-entityType="{ row }">
          <span class="inline-flex items-center gap-1.5">
            <UIcon :name="entityNames.icon(row.entityType)" class="size-3.5 text-[var(--app-muted)]" />
            {{ entityNames.label(row.entityType) }}
          </span>
        </template>
        <template #cell-activeVersionId="{ row }">
          <PlatformStatusBadge
            :tone="row.activeVersionId ? 'success' : 'neutral'"
            :label="row.activeVersionId ? t('admin.workflows.live') : t('admin.workflows.inactive')"
          />
        </template>
        <template #cell-updatedAt="{ row }">
          <UTooltip :text="dateTime(row.updatedAt)">
            <time :datetime="row.updatedAt">{{ relative(row.updatedAt) }}</time>
          </UTooltip>
        </template>
      </PlatformDataTable>
    </UCard>

    <UModal
      v-model:open="createOpen"
      :title="t('admin.workflows.new')"
      :description="t('admin.workflows.newHint')"
    >
      <template #body>
        <form id="workflow-form" class="grid gap-4" novalidate @submit.prevent="create">
          <UAlert
            v-if="createErrors.message.value"
            color="error"
            variant="subtle"
            :description="createErrors.message.value"
          />
          <UFormField :label="t('admin.workflows.name')" :error="createErrors.fields.name" required>
            <UInput v-model="created.name" class="w-full" autofocus />
          </UFormField>
          <UFormField
            :label="t('admin.roles.key')"
            :hint="t('admin.workflows.keyHint')"
            :error="createErrors.fields.key"
            required
          >
            <UInput v-model="created.key" class="w-full" :ui="{ base: 'font-mono' }" />
          </UFormField>
          <UFormField
            :label="t('admin.workflows.entityType')"
            :error="createErrors.fields.entityType"
            required
          >
            <USelect
              v-model="created.entityType"
              :items="entityItems"
              class="w-full"
              :loading="entities.isPending.value"
            />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="createOpen = false">{{
            t('platform.actions.cancel')
          }}</UButton>
          <UButton type="submit" form="workflow-form" :loading="action.isPending.value">{{
            t('platform.actions.create')
          }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
