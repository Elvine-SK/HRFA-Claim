<script setup lang="ts">
import type { DataTableColumn } from '../../components/platform/DataTable.vue'
import type { StatItem } from '../../components/platform/StatStrip.vue'
import type { Group, GroupDetail, GroupsOverview } from '../../types/platform'

definePageMeta({ title: 'admin.nav.groups', permission: 'group.read' })

const { t } = useI18n()
const { relative, dateTime } = useDates()
const notify = useNotify()
const confirm = useConfirm()
const access = useAccess()
const action = useAdminAction()

useHead({ title: () => t('admin.nav.groups') })

const list = useListQuery({ defaults: { sort: [{ field: 'name', dir: 'asc' }] } })
const groups = useApiList<Group>(ADMIN_KEY, '/authz/groups', list)
const overview = useApiItem<GroupsOverview>(ADMIN_KEY, '/authz/groups/overview')
// "No members" and "No roles" filter the list by a count of zero; clicking again removes the filter.
const zeroStat = (field: 'memberCount' | 'roleCount') => {
  const value = list.filterValue(field, 'eq')
  const active = value !== undefined && Number(value) === 0
  return { active, onClick: () => void list.setFilter(field, 'eq', active ? undefined : 0) }
}
const stats = computed<StatItem[]>(() => {
  const o = overview.data.value
  return [
    { label: t('admin.groups.stats.groups'), value: o?.groups, icon: 'i-lucide-users-round' },
    {
      label: t('admin.groups.stats.members'),
      value: o?.members,
      icon: 'i-lucide-user-check',
      tone: 'info',
      hint: t('admin.groups.stats.membersHint'),
    },
    {
      label: t('admin.groups.stats.empty'),
      value: o?.empty,
      icon: 'i-lucide-user-x',
      tone: o?.empty ? 'warning' : 'neutral',
      hint: t('admin.groups.stats.emptyHint'),
      ...zeroStat('memberCount'),
    },
    {
      label: t('admin.groups.stats.withoutRoles'),
      value: o?.withoutRoles,
      icon: 'i-lucide-shield-off',
      tone: o?.withoutRoles ? 'warning' : 'neutral',
      hint: t('admin.groups.stats.withoutRolesHint'),
      ...zeroStat('roleCount'),
    },
  ]
})
const columns = computed<DataTableColumn<Group>[]>(() => [
  { key: 'name', label: t('admin.groups.name'), sortable: true, locked: true, primary: true },
  { key: 'key', label: t('admin.roles.key'), sortable: true, mono: true, card: true },
  { key: 'memberCount', label: t('admin.groups.members'), sortable: true, mono: true, card: true },
  { key: 'roleCount', label: t('admin.groups.roles'), sortable: true, mono: true, card: true },
  { key: 'updatedAt', label: t('admin.groups.updated'), sortable: true, align: 'end', card: true },
])
const filterLabels = computed(() => ({
  name: t('admin.groups.name'),
  key: t('admin.roles.key'),
  memberCount: t('admin.groups.members'),
  roleCount: t('admin.groups.roles'),
  updatedAt: t('admin.groups.updated'),
}))

const editable = computed(() => access.can('group.manage'))
const selectedId = useQueryParam('group')
const open = computed({
  get: () => !!selectedId.value,
  set: (v) => {
    if (!v) selectedId.value = undefined
  },
})
const detail = useApiItem<GroupDetail>(ADMIN_KEY, () =>
  selectedId.value ? `/authz/groups/${selectedId.value}` : null,
)
const group = computed(() => detail.data.value)

const meta = reactive({ name: '', description: '', roleIds: [] as string[] })
watch(
  group,
  (g) =>
    Object.assign(meta, {
      name: g?.name ?? '',
      description: g?.description ?? '',
      roleIds: [...(g?.roleIds ?? [])],
    }),
  {
    immediate: true,
  },
)
const metaDirty = computed(
  () =>
    !!group.value &&
    (meta.name !== group.value.name ||
      meta.description !== (group.value.description ?? '') ||
      meta.roleIds.length !== group.value.roleIds.length ||
      meta.roleIds.some((id) => !group.value!.roleIds.includes(id))),
)

async function saveMeta() {
  if (!group.value) return
  try {
    await action.mutateAsync({
      path: `/authz/groups/${group.value.id}`,
      method: 'PATCH',
      body: {
        version: group.value.version,
        name: meta.name.trim(),
        description: meta.description.trim() || null,
        roleIds: meta.roleIds,
      },
    })
    notify.success(t('platform.toast.saved'))
  } catch (error) {
    notify.error(error)
  }
}

async function removeGroup() {
  if (!group.value) return
  const ok = await confirm({
    title: t('platform.confirm.deleteTitle', { name: group.value.name }),
    description: t('admin.groups.deleteText'),
    confirmLabel: t('platform.actions.delete'),
    danger: true,
  })
  if (!ok) return
  try {
    await action.mutateAsync({ path: `/authz/groups/${group.value.id}`, method: 'DELETE' })
    selectedId.value = undefined
    notify.success(t('platform.toast.deleted'))
  } catch (error) {
    notify.error(error)
  }
}

const createOpen = ref(false)
const created = reactive({ key: '', name: '', description: '' })
const createErrors = useFormErrors<'key' | 'name'>()
function openCreate() {
  Object.assign(created, { key: '', name: '', description: '' })
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
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 64)
    if (!created.key || created.key === slug(prev ?? '')) created.key = slug(name)
  },
)
async function createGroup() {
  createErrors.clear()
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(created.key)) createErrors.fields.key = t('admin.roles.keyInvalid')
  if (!created.name.trim()) createErrors.fields.name = t('auth.errors.nameRequired')
  if (createErrors.fields.key || createErrors.fields.name) return
  try {
    const g = (await action.mutateAsync({
      path: '/authz/groups',
      body: {
        key: created.key,
        name: created.name.trim(),
        description: created.description.trim() || undefined,
        roleIds: [],
      },
    })) as Group
    createOpen.value = false
    selectedId.value = g.id
    notify.success(t('platform.toast.created'))
  } catch (error) {
    createErrors.apply(error, ['key', 'name'])
  }
}
</script>

<template>
  <div>
    <PlatformPageHeader
      :eyebrow="t('admin.nav.group')"
      :title="t('admin.groups.title')"
      :subtitle="t('admin.groups.subtitle')"
    >
      <template #actions>
        <UButton v-can="'group.manage'" icon="i-lucide-plus" @click="openCreate">{{
          t('admin.groups.new')
        }}</UButton>
      </template>
    </PlatformPageHeader>

    <PlatformStatStrip :items="stats" :loading="overview.isPending.value" />

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <PlatformDataTable
        id="admin-groups"
        :rows="groups.data.value?.data ?? []"
        :total="groups.data.value?.meta.total ?? 0"
        :columns="columns"
        :list="list"
        list-key="groups"
        :filter-labels="filterLabels"
        :loading="groups.isPending.value"
        :fetching="groups.isFetching.value"
        :error="groups.error.value"
        :entities="t('admin.groups.entities')"
        :caption="t('admin.groups.title')"
        @select="(g) => (selectedId = g.id)"
        @retry="groups.refetch()"
      >
        <template #cell-name="{ row, q }">
          <span class="inline-flex min-w-0 items-center gap-2">
            <UIcon name="i-lucide-user-group" class="size-4 shrink-0 text-[var(--app-accent)]" />
            <span class="truncate font-medium"><PlatformHighlight :text="row.name" :query="q" /></span>
          </span>
        </template>
        <template #cell-updatedAt="{ row }">
          <UTooltip :text="dateTime(row.updatedAt)">
            <time :datetime="row.updatedAt">{{ relative(row.updatedAt) }}</time>
          </UTooltip>
        </template>
      </PlatformDataTable>
    </UCard>

    <PlatformEntityDrawer
      v-model:open="open"
      :title="group?.name ?? ''"
      :subtitle="group?.key"
      icon="i-lucide-user-group"
      :loading="detail.isPending.value"
      width="editor"
    >
      <template v-if="group" #badges>
        <UBadge color="neutral" variant="subtle" icon="i-lucide-user">
          {{ t('admin.groups.memberCount', { n: group.memberCount }, group.memberCount) }}
        </UBadge>
      </template>
      <template v-if="group && editable" #actions>
        <UButton color="error" variant="ghost" icon="i-lucide-trash-2" class="ms-auto" @click="removeGroup">
          {{ t('platform.actions.delete') }}
        </UButton>
      </template>
      <template v-if="group">
        <PlatformDrawerSection :title="t('admin.groups.details')">
          <form class="grid gap-3" @submit.prevent="saveMeta">
            <UFormField :label="t('admin.groups.name')">
              <UInput v-model="meta.name" class="w-full" :disabled="!editable" />
            </UFormField>
            <UFormField :label="t('admin.roles.description')">
              <UTextarea
                v-model="meta.description"
                :rows="2"
                autoresize
                class="w-full"
                :disabled="!editable"
              />
            </UFormField>
            <UFormField :label="t('admin.groups.roles')" :description="t('admin.groups.rolesHint')">
              <PlatformAdminRoleGroupPicker
                v-model="meta.roleIds"
                kind="role"
                by="id"
                multiple
                :disabled="!editable"
                :placeholder="t('admin.users.pickRoles')"
                :aria-label="t('admin.groups.roles')"
              />
            </UFormField>
            <div v-if="editable" class="flex justify-end">
              <UButton type="submit" size="sm" :disabled="!metaDirty" :loading="action.isPending.value">
                {{ t('platform.actions.saveChanges') }}
              </UButton>
            </div>
          </form>
        </PlatformDrawerSection>
        <PlatformDrawerSection :title="t('admin.groups.members')">
          <PlatformAdminGroupMembers :group-id="group.id" :total="group.memberCount" :editable="editable" />
        </PlatformDrawerSection>
      </template>
    </PlatformEntityDrawer>

    <UModal v-model:open="createOpen" :title="t('admin.groups.new')">
      <template #body>
        <form id="group-form" class="grid gap-4" novalidate @submit.prevent="createGroup">
          <UAlert
            v-if="createErrors.message.value"
            color="error"
            variant="subtle"
            :description="createErrors.message.value"
          />
          <UFormField :label="t('admin.groups.name')" :error="createErrors.fields.name" required>
            <UInput v-model="created.name" class="w-full" autofocus />
          </UFormField>
          <UFormField
            :label="t('admin.roles.key')"
            :hint="t('admin.roles.keyHint')"
            :error="createErrors.fields.key"
            required
          >
            <UInput v-model="created.key" class="w-full" :ui="{ base: 'font-mono' }" />
          </UFormField>
          <UFormField :label="t('admin.roles.description')">
            <UTextarea v-model="created.description" :rows="2" class="w-full" />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="createOpen = false">{{
            t('platform.actions.cancel')
          }}</UButton>
          <UButton type="submit" form="group-form" :loading="action.isPending.value">{{
            t('platform.actions.create')
          }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
