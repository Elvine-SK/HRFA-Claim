<script setup lang="ts">
import type { DataResponse, ListResponse } from '@elvine-sk/platform-core'
import { useQueries, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { Policy, RoleDetail } from '../../types/platform'

definePageMeta({ title: 'admin.nav.roles', permission: 'role.read' })

const { t } = useI18n()
const api = useApi()
const notify = useNotify()
const confirm = useConfirm()
const access = useAccess()
const action = useAdminAction()
const client = useQueryClient()
const { relative } = useDates()

useHead({ title: () => t('admin.nav.roles') })

const catalog = useAuthzCatalog()
const roleList = useAllRoles()
const details = useQueries({
  queries: computed(() =>
    (roleList.data.value ?? []).map((role) => ({
      queryKey: [ADMIN_KEY, `/authz/roles/${role.id}`],
      queryFn: async () => (await api<DataResponse<RoleDetail>>(`/authz/roles/${role.id}`)).data,
    })),
  ),
})
const roles = computed(() => details.value.map((q) => q.data).filter((r): r is RoleDetail => !!r))
const loading = computed(
  () => roleList.isPending.value || catalog.isPending.value || details.value.some((q) => q.isPending),
)
const editable = computed(() => access.can('role.manage'))

const draft = ref<Record<string, string[]>>({})
const baseline = new Map<string, number>()
watch(
  roles,
  (list) => {
    const next: Record<string, string[]> = {}
    for (const r of list) {
      const fresh = baseline.get(r.id) !== r.version
      next[r.id] = fresh || !draft.value[r.id] ? [...r.permissions] : draft.value[r.id]!
      baseline.set(r.id, r.version)
    }
    draft.value = next
  },
  { immediate: true },
)
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))
const dirtyIds = computed(() =>
  roles.value
    .filter((r) => draft.value[r.id] && !sameSet(draft.value[r.id]!, r.permissions))
    .map((r) => r.id),
)
const changeCount = computed(() =>
  roles.value.reduce((n, r) => {
    const d = draft.value[r.id] ?? r.permissions
    return (
      n +
      d.filter((k) => !r.permissions.includes(k)).length +
      r.permissions.filter((k) => !d.includes(k)).length
    )
  }, 0),
)

function toggle(roleId: string, key: string) {
  const current = draft.value[roleId] ?? []
  draft.value = {
    ...draft.value,
    [roleId]: current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
  }
}
function setMany(roleId: string, keys: string[], on: boolean) {
  const current = (draft.value[roleId] ?? []).filter((k) => !keys.includes(k))
  draft.value = { ...draft.value, [roleId]: on ? [...current, ...keys] : current }
}
function discard() {
  draft.value = Object.fromEntries(roles.value.map((r) => [r.id, [...r.permissions]]))
}
const saving = ref(false)
async function saveAll() {
  saving.value = true
  const count = changeCount.value
  const roleCount = dirtyIds.value.length
  try {
    for (const id of dirtyIds.value) {
      const role = roles.value.find((r) => r.id === id)!
      await api(`/authz/roles/${id}`, {
        method: 'PATCH',
        body: { version: role.version, permissions: draft.value[id] },
      })
    }
    notify.success(t('admin.roles.saved', { n: count, roles: roleCount }, count))
    return true
  } catch (error) {
    notify.error(error)
    return false
  } finally {
    await client.invalidateQueries({ queryKey: [ADMIN_KEY] })
    saving.value = false
  }
}

const reviewing = ref(false)
async function confirmSave() {
  if (await saveAll()) reviewing.value = false
}

onBeforeRouteLeave(async () => {
  if (!changeCount.value) return true
  return confirm({
    title: t('admin.roles.leaveTitle'),
    description: t('admin.roles.leaveText'),
    confirmLabel: t('admin.roles.leave'),
    danger: true,
  })
})

// The user count needs `user.read`; without it the stat is left out.
const userCount = useQuery({
  queryKey: [ADMIN_KEY, '/users', 'count'],
  enabled: () => access.can('user.read'),
  queryFn: async () => (await api<ListResponse<unknown>>('/users?pageSize=1')).meta.total,
})
const stats = computed(() => {
  const sensitive = sensitiveGrantCount(roles.value)
  const supers = roles.value.filter((r) => r.isSuper)
  const superUsers = supers.reduce((n, r) => n + r.reach.users, 0)
  const policies = roles.value.flatMap((r) => r.policies)
  const deny = policies.filter((p) => p.effect === 'deny').length
  const permissions = catalog.data.value?.permissions ?? []
  const withSensitive = roles.value.filter((r) => sensitiveGrantCount([r])).length
  return [
    {
      label: t('admin.roles.stats.roles'),
      value: roles.value.length,
      icon: 'i-lucide-shield-check',
      hint: t('admin.roles.stats.superRoles', { n: supers.length }, supers.length),
    },
    {
      label: t('admin.roles.stats.permissions'),
      value: permissions.length,
      icon: 'i-lucide-key-round',
      hint: t('admin.roles.stats.acrossResources', { n: new Set(permissions.map((p) => p.resource)).size }),
    },
    ...(access.can('user.read')
      ? [
          {
            label: t('admin.roles.stats.users'),
            value: userCount.data.value,
            icon: 'i-lucide-users',
            hint: t('admin.roles.stats.superUsers', { n: superUsers }, superUsers),
          },
        ]
      : []),
    {
      label: t('admin.roles.stats.policies'),
      value: policies.length,
      icon: 'i-lucide-scale',
      hint: t('admin.roles.stats.policyMix', { allow: policies.length - deny, deny }),
    },
    {
      label: t('admin.roles.stats.sensitive'),
      value: sensitive,
      icon: 'i-lucide-triangle-alert',
      tone: sensitive ? ('warning' as const) : undefined,
      hint: t('admin.roles.stats.inRoles', { n: withSensitive }, withSensitive),
    },
  ]
})

const openId = useQueryParam('role')
const open = computed({
  get: () => !!openId.value,
  set: (v) => {
    if (!v) openId.value = undefined
  },
})
const current = computed(() => roles.value.find((r) => r.id === openId.value))
const meta = reactive({ name: '', description: '' })
watch(current, (r) => Object.assign(meta, { name: r?.name ?? '', description: r?.description ?? '' }), {
  immediate: true,
})

async function saveMeta() {
  if (!current.value) return
  try {
    await action.mutateAsync({
      path: `/authz/roles/${current.value.id}`,
      method: 'PATCH',
      body: {
        version: current.value.version,
        name: meta.name.trim(),
        description: meta.description.trim() || null,
      },
    })
    notify.success(t('platform.toast.saved'))
  } catch (error) {
    notify.error(error)
  }
}

async function removeRole() {
  if (!current.value) return
  const ok = await confirm({
    title: t('platform.confirm.deleteTitle', { name: current.value.name }),
    description: t('admin.roles.deleteText'),
    confirmLabel: t('platform.actions.delete'),
    danger: true,
  })
  if (!ok) return
  try {
    await action.mutateAsync({ path: `/authz/roles/${current.value.id}`, method: 'DELETE' })
    openId.value = undefined
    notify.success(t('platform.toast.deleted'))
  } catch (error) {
    notify.error(error)
  }
}

const viewParam = useQueryParam('view')
const view = computed<'matrix' | 'policies'>({
  get: () => (viewParam.value === 'policies' ? 'policies' : 'matrix'),
  set: (v) => (viewParam.value = v === 'policies' ? 'policies' : undefined),
})

const policyOpen = ref(false)
const editingPolicy = ref<Policy | null>(null)
// The role an existing policy belongs to, or the role a new one starts with.
const policyRole = ref<RoleDetail | null>(null)
const policyError = ref<string | null>(null)
function editPolicy(policy: Policy | null, role?: RoleDetail | null) {
  editingPolicy.value = policy
  policyRole.value = role ?? null
  policyError.value = null
  policyOpen.value = true
}
async function savePolicy(body: Omit<Policy, 'id' | 'version'>, roleIds: string[]) {
  policyError.value = null
  try {
    const payload = { ...body, condition: body.condition ?? undefined }
    if (editingPolicy.value)
      await action.mutateAsync({
        path: `/authz/policies/${editingPolicy.value.id}`,
        method: 'PUT',
        body: { ...payload, version: editingPolicy.value.version },
      })
    else
      for (const id of roleIds)
        await action.mutateAsync({ path: `/authz/roles/${id}/policies`, body: payload })
    policyOpen.value = false
    notify.success(
      !editingPolicy.value && roleIds.length > 1
        ? t('admin.roles.policy.savedMany', { n: roleIds.length }, roleIds.length)
        : t('platform.toast.saved'),
    )
  } catch (error) {
    policyError.value = useNotify().messageOf(error)
  }
}
async function removePolicy(policy: Policy) {
  const ok = await confirm({
    title: t('platform.confirm.deleteTitle', { name: policy.name }),
    confirmLabel: t('platform.actions.delete'),
    danger: true,
  })
  if (!ok) return
  try {
    await action.mutateAsync({ path: `/authz/policies/${policy.id}`, method: 'DELETE' })
    policyOpen.value = false
  } catch (error) {
    notify.error(error)
  }
}

const createOpen = ref(false)
const created = reactive({ key: '', name: '', description: '', copyFrom: 'none' })
const createErrors = useFormErrors<'key' | 'name'>()
function openCreate() {
  Object.assign(created, { key: '', name: '', description: '', copyFrom: 'none' })
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
async function createRole() {
  createErrors.clear()
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(created.key)) createErrors.fields.key = t('admin.roles.keyInvalid')
  if (!created.name.trim()) createErrors.fields.name = t('auth.errors.nameRequired')
  if (createErrors.fields.key || createErrors.fields.name) return
  const source = roles.value.find((r) => r.id === created.copyFrom)
  try {
    const role = (await action.mutateAsync({
      path: '/authz/roles',
      body: {
        key: created.key,
        name: created.name.trim(),
        description: created.description.trim() || undefined,
        permissions: source?.permissions ?? [],
      },
    })) as RoleDetail
    createOpen.value = false
    openId.value = role.id
    notify.success(t('platform.toast.created'))
  } catch (error) {
    createErrors.apply(error, ['key', 'name'])
  }
}
</script>

<template>
  <div class="pb-20">
    <PlatformPageHeader
      :eyebrow="t('admin.nav.group')"
      :title="t('admin.roles.title')"
      :subtitle="t('admin.roles.subtitle')"
    >
      <template #actions>
        <UButton v-can="'role.manage'" icon="i-lucide-plus" @click="openCreate">{{
          t('admin.roles.new')
        }}</UButton>
      </template>
    </PlatformPageHeader>

    <PlatformStatStrip :items="stats" class="mb-[var(--app-gap)]" />

    <PlatformSegmented
      v-model="view"
      :options="[
        { value: 'matrix', label: t('admin.roles.view.matrix'), icon: 'i-lucide-grid-3x3' },
        { value: 'policies', label: t('admin.roles.view.policies'), icon: 'i-lucide-scale' },
      ]"
      :label="t('admin.roles.view.label')"
      class="mb-3"
    />

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <div v-if="loading" class="grid gap-2 p-5">
        <USkeleton v-for="n in 8" :key="n" class="h-8 w-full" />
      </div>
      <PlatformAdminPolicyList
        v-else-if="catalog.data.value && view === 'policies'"
        :catalog="catalog.data.value"
        :roles="roles"
        :editable="editable"
        @edit="editPolicy"
        @create="editPolicy(null, null)"
      />
      <PlatformAdminAccessMatrix
        v-else-if="catalog.data.value"
        :catalog="catalog.data.value"
        :roles="roles"
        :draft="draft"
        :editable="editable"
        @toggle="toggle"
        @set-many="setMany"
        @open="(id) => (openId = id)"
      />
    </UCard>

    <Transition name="floatbar">
      <div v-if="changeCount" class="floatbar" role="region" :aria-label="t('admin.roles.unsaved')">
        <span class="flex items-center gap-2 text-[13px]">
          <UIcon name="i-lucide-circle-dot" class="size-4 text-[var(--app-accent)]" />
          {{ t('admin.roles.changes', { n: changeCount, roles: dirtyIds.length }, changeCount) }}
        </span>
        <div class="flex gap-2">
          <UButton color="neutral" variant="ghost" :disabled="saving" @click="discard">{{
            t('admin.roles.discard')
          }}</UButton>
          <UButton icon="i-lucide-check" :disabled="saving" @click="reviewing = true">{{
            t('admin.roles.reviewSave')
          }}</UButton>
        </div>
      </div>
    </Transition>

    <PlatformAdminAccessReview
      v-model:open="reviewing"
      :roles="roles"
      :draft="draft"
      :saving="saving"
      @confirm="confirmSave"
    />

    <PlatformEntityDrawer
      v-model:open="open"
      :title="current?.name ?? ''"
      :subtitle="current?.key"
      icon="i-lucide-shield-check"
      width="editor"
    >
      <template v-if="current" #badges>
        <UBadge v-if="current.isSuper" color="warning" variant="subtle" icon="i-lucide-crown">{{
          t('admin.roles.super')
        }}</UBadge>
        <UBadge v-if="current.isSystem" color="neutral" variant="outline" icon="i-lucide-lock">{{
          t('admin.roles.system')
        }}</UBadge>
        <UBadge color="neutral" variant="subtle">{{
          t('admin.roles.updated', { when: relative(current.updatedAt) })
        }}</UBadge>
      </template>
      <template v-if="current && editable && !current.isSystem" #actions>
        <UButton color="error" variant="ghost" icon="i-lucide-trash-2" class="ms-auto" @click="removeRole">
          {{ t('platform.actions.delete') }}
        </UButton>
      </template>
      <template v-if="current">
        <PlatformDrawerSection :title="t('admin.roles.details')">
          <form class="grid gap-3" @submit.prevent="saveMeta">
            <UFormField :label="t('admin.roles.name')">
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
            <div v-if="editable" class="flex justify-end">
              <UButton
                type="submit"
                size="sm"
                :disabled="meta.name === current.name && meta.description === (current.description ?? '')"
                :loading="action.isPending.value"
              >
                {{ t('platform.actions.save') }}
              </UButton>
            </div>
          </form>
        </PlatformDrawerSection>
        <PlatformDrawerSection :title="t('admin.roles.policies')">
          <p class="muted mb-3 text-[12.5px]">{{ t('admin.roles.policiesHint') }}</p>
          <ul v-if="current.policies.length" class="pol-list">
            <li v-for="p in current.policies" :key="p.id">
              <UBadge :color="p.effect === 'allow' ? 'success' : 'error'" variant="subtle" size="sm">
                {{ t(`admin.roles.policy.${p.effect}`) }}
              </UBadge>
              <div class="min-w-0 flex-1">
                <b class="block truncate text-[13.5px]">{{ p.name }}</b>
                <span class="mono block truncate text-[12px] text-[var(--app-muted)]">
                  {{ p.resource }} · {{ p.actions.join(', ')
                  }}{{ p.condition ? ' · ' + t('admin.roles.policy.conditional') : '' }}
                </span>
              </div>
              <template v-if="editable">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-pencil"
                  :aria-label="t('platform.actions.edit')"
                  @click="editPolicy(p, current)"
                />
                <UButton
                  size="xs"
                  color="error"
                  variant="ghost"
                  icon="i-lucide-trash-2"
                  :aria-label="t('platform.actions.delete')"
                  @click="removePolicy(p)"
                />
              </template>
            </li>
          </ul>
          <p v-else class="muted text-[13px]">{{ t('admin.roles.noPolicies') }}</p>
          <UButton
            v-if="editable && !current.isSuper"
            size="sm"
            color="neutral"
            variant="outline"
            icon="i-lucide-plus"
            class="mt-3"
            @click="editPolicy(null, current)"
          >
            {{ t('admin.roles.addPolicy') }}
          </UButton>
        </PlatformDrawerSection>
      </template>
    </PlatformEntityDrawer>

    <USlideover
      v-model:open="policyOpen"
      :title="editingPolicy ? t('admin.roles.editPolicy') : t('admin.roles.newPolicy')"
      :description="policyRole ? t('admin.roles.policyFor', { role: policyRole.name }) : undefined"
      :ui="{ content: 'max-w-[660px]' }"
    >
      <template #body>
        <PlatformAdminPolicyEditor
          v-if="policyOpen && catalog.data.value"
          :catalog="catalog.data.value"
          :roles="roles"
          :policy="editingPolicy"
          :role="policyRole"
          :busy="action.isPending.value"
          :error="policyError"
          @save="savePolicy"
          @remove="editingPolicy && removePolicy(editingPolicy)"
          @cancel="policyOpen = false"
        />
      </template>
    </USlideover>

    <UModal v-model:open="createOpen" :title="t('admin.roles.new')">
      <template #body>
        <form id="role-form" class="grid gap-4" novalidate @submit.prevent="createRole">
          <UAlert
            v-if="createErrors.message.value"
            color="error"
            variant="subtle"
            :description="createErrors.message.value"
          />
          <UFormField :label="t('admin.roles.name')" :error="createErrors.fields.name" required>
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
          <UFormField :label="t('admin.roles.copyFrom')">
            <USelect
              v-model="created.copyFrom"
              :items="[
                { value: 'none', label: t('admin.roles.startEmpty') },
                ...roles.filter((r) => !r.isSuper).map((r) => ({ value: r.id, label: r.name })),
              ]"
              class="w-full"
            />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="createOpen = false">{{
            t('platform.actions.cancel')
          }}</UButton>
          <UButton type="submit" form="role-form" :loading="action.isPending.value">{{
            t('platform.actions.create')
          }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.pol-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.pol-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-r-md);
}
</style>
