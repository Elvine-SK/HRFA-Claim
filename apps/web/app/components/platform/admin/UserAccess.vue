<script setup lang="ts">
import type { Role, UserAccess } from '../../../types/platform'

const props = defineProps<{ userId: string }>()
const { t } = useI18n()
const notify = useNotify()
const access = useAccess()
const action = useAdminAction()

const detail = useApiItem<UserAccess>(ADMIN_KEY, () => `/authz/users/${props.userId}`)
const canAssign = computed(() => access.can('role.assign'))
// The user's direct roles by id, for their names.
const roles = useApiItem<Role[]>(ADMIN_KEY, () => {
  const ids = detail.data.value?.roleIds ?? []
  return ids.length && access.can('role.read')
    ? `/authz/roles?filter[id][in]=${ids.join(',')}&pageSize=100`
    : null
})
const editing = ref(false)
const picked = ref<string[]>([])

const roleName = (id: string) => roles.data.value?.find((r) => r.id === id)?.name ?? id
const grouped = computed(() => {
  const map = new Map<string, string[]>()
  for (const key of detail.data.value?.effective.permissions ?? []) {
    const { resource, action: act } = splitPermission(key)
    map.set(resource, [...(map.get(resource) ?? []), act])
  }
  return [...map].sort(([a], [b]) => a.localeCompare(b))
})

function startEdit() {
  picked.value = [...(detail.data.value?.roleIds ?? [])]
  editing.value = true
}

async function save() {
  try {
    await action.mutateAsync({
      path: `/authz/users/${props.userId}/roles`,
      method: 'PUT',
      body: { roleIds: picked.value },
    })
    editing.value = false
    notify.success(t('admin.users.rolesSaved'))
  } catch (error) {
    notify.error(error)
  }
}
</script>

<template>
  <div class="grid gap-5">
    <div v-if="detail.isPending.value" class="grid gap-2">
      <USkeleton class="h-5 w-1/2" />
      <USkeleton class="h-16 w-full" />
    </div>
    <template v-else-if="detail.data.value">
      <div>
        <div class="mb-2 flex items-center gap-2">
          <span class="eyebrow flex-1">{{ t('admin.users.directRoles') }}</span>
          <UButton
            v-if="canAssign && !editing"
            size="xs"
            color="neutral"
            variant="outline"
            icon="i-lucide-pencil"
            @click="startEdit"
          >
            {{ t('platform.actions.edit') }}
          </UButton>
        </div>
        <template v-if="editing">
          <PlatformAdminRoleGroupPicker
            v-model="picked"
            kind="role"
            by="id"
            multiple
            :placeholder="t('admin.users.pickRoles')"
            :aria-label="t('admin.users.directRoles')"
            class="mb-3"
          />
          <div class="flex gap-2">
            <UButton size="sm" :loading="action.isPending.value" @click="save">{{
              t('platform.actions.save')
            }}</UButton>
            <UButton size="sm" color="neutral" variant="ghost" @click="editing = false">
              {{ t('platform.actions.cancel') }}
            </UButton>
          </div>
        </template>
        <div v-else class="flex flex-wrap gap-1.5">
          <UBadge v-for="id in detail.data.value.roleIds" :key="id" color="primary" variant="subtle">{{
            roleName(id)
          }}</UBadge>
          <span v-if="!detail.data.value.roleIds.length" class="muted text-[13px]">{{
            t('admin.users.noRoles')
          }}</span>
        </div>
      </div>

      <div>
        <span class="eyebrow mb-2 block">{{ t('admin.users.groups') }}</span>
        <div class="flex flex-wrap gap-1.5">
          <UBadge
            v-for="g in detail.data.value.groups"
            :key="g.id"
            color="neutral"
            variant="outline"
            icon="i-lucide-user-group"
          >
            {{ g.name }}
          </UBadge>
          <span v-if="!detail.data.value.groups.length" class="muted text-[13px]">{{
            t('admin.users.noGroups')
          }}</span>
        </div>
      </div>

      <div>
        <span class="eyebrow mb-2 block">{{ t('admin.users.effective') }}</span>
        <UAlert
          v-if="detail.data.value.effective.isSuper"
          color="warning"
          variant="subtle"
          icon="i-lucide-crown"
          :description="t('admin.users.superText')"
        />
        <dl v-else-if="grouped.length" class="perm-list">
          <div v-for="[resource, actions] in grouped" :key="resource">
            <dt class="mono">{{ resource }}</dt>
            <dd>
              <span v-for="a in actions" :key="a" class="chip mono">{{ a }}</span>
            </dd>
          </div>
        </dl>
        <span v-else class="muted text-[13px]">{{ t('admin.users.noPermissions') }}</span>
        <p class="muted mt-2 text-[12px]">{{ t('admin.users.effectiveHint') }}</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.perm-list {
  display: grid;
  gap: 8px;
  margin: 0;
}
.perm-list > div {
  display: grid;
  grid-template-columns: minmax(110px, 34%) 1fr;
  gap: 10px;
  align-items: baseline;
}
.perm-list dt {
  color: var(--app-muted);
  font-size: 12.5px;
}
.perm-list dd {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
}
.chip {
  padding: 1px 7px;
  border-radius: 6px;
  background: color-mix(in oklab, var(--app-ok) 12%, transparent);
  color: color-mix(in oklab, var(--app-ok) 70%, var(--app-text));
  font-size: 11.5px;
}
</style>
