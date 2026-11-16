<script setup lang="ts">
import type { DataResponse } from '@elvine-sk/platform-core'
import type { MenuAccessResult, MenuMapRow } from '@elvine-sk/platform-nuxt/utils'
import { useQuery } from '@tanstack/vue-query'
import { useLocalStorage } from '@vueuse/core'

definePageMeta({ title: 'admin.nav.menuMap', permission: 'role.read' })

const { t } = useI18n()
const api = useApi()
const nav = useNavigation()
const access = useAccess()

useHead({ title: () => t('admin.nav.menuMap') })

// Read-only: what a role or a user sees in the menu, judged by the server with the menu's own check.
const kind = ref<'role' | 'user'>('role')
const roleId = ref<string | undefined>()
const userId = ref<string | undefined>()
const view = useLocalStorage<'table' | 'diagram'>('nelvine:menu-map-view', 'table')
const onlyHidden = ref(false)
const selected = ref<string | undefined>()

const subject = computed(() =>
  kind.value === 'role' ? roleId.value && { roleId: roleId.value } : userId.value && { userId: userId.value },
)
const keys = computed(() => permissionKeys(nav.groups.value))

const result = useQuery({
  queryKey: computed(() => [ADMIN_KEY, '/authz/menu-access', subject.value, keys.value]),
  enabled: computed(() => !!subject.value && keys.value.length > 0),
  queryFn: async () =>
    (
      await api<DataResponse<MenuAccessResult>>('/authz/menu-access', {
        method: 'POST',
        body: { ...subject.value, permissions: keys.value },
      })
    ).data,
})

const everyone: MenuAccessResult = { allowed: {}, grantedBy: {}, otherRoles: {} }
const rows = computed<MenuMapRow[]>(() =>
  buildMenuMap(
    nav.groups.value,
    result.data.value ?? {
      ...everyone,
      allowed: Object.fromEntries(keys.value.map((k) => [k, true])),
    },
  ),
)
const judged = computed(() => !!subject.value && !!result.data.value)
const groupLabels = computed(() => Object.fromEntries(nav.groups.value.map((g) => [g.id, g.label])))
const detail = computed(() => rows.value.find((r) => r.item.id === selected.value))

watch(kind, () => (selected.value = undefined))
</script>

<template>
  <div>
    <PlatformPageHeader
      :eyebrow="t('admin.nav.group')"
      :title="t('admin.menuMap.title')"
      :subtitle="t('admin.menuMap.subtitle')"
    />

    <div class="mm-bar">
      <span class="mm-label">{{ t('admin.menuMap.viewAs') }}</span>
      <UFieldGroup>
        <UButton
          :color="kind === 'role' ? 'primary' : 'neutral'"
          :variant="kind === 'role' ? 'soft' : 'outline'"
          @click="kind = 'role'"
          >{{ t('admin.menuMap.role') }}</UButton
        >
        <UButton
          :color="kind === 'user' ? 'primary' : 'neutral'"
          :variant="kind === 'user' ? 'soft' : 'outline'"
          :disabled="!access.can('user.read')"
          @click="kind = 'user'"
          >{{ t('admin.menuMap.user') }}</UButton
        >
      </UFieldGroup>
      <div class="mm-pick">
        <PlatformAdminRoleGroupPicker
          v-if="kind === 'role'"
          v-model="roleId"
          kind="role"
          by="id"
          :placeholder="t('admin.menuMap.pickRole')"
        />
        <PlatformUserPicker v-else v-model="userId" :placeholder="t('admin.menuMap.pickUser')" />
      </div>
      <UButton
        v-if="kind === 'role' && roleId"
        variant="link"
        icon="i-lucide-shield-check"
        :to="`/admin/roles?role=${roleId}`"
        >{{ t('admin.menuMap.openRoles') }}</UButton
      >
      <span class="mm-grow" />
      <UCheckbox v-if="view === 'table'" v-model="onlyHidden" :label="t('admin.menuMap.onlyHidden')" />
      <UFieldGroup>
        <UButton
          icon="i-lucide-table-2"
          :color="view === 'table' ? 'primary' : 'neutral'"
          :variant="view === 'table' ? 'soft' : 'outline'"
          @click="view = 'table'"
          >{{ t('admin.menuMap.table') }}</UButton
        >
        <UButton
          icon="i-lucide-network"
          :color="view === 'diagram' ? 'primary' : 'neutral'"
          :variant="view === 'diagram' ? 'soft' : 'outline'"
          @click="view = 'diagram'"
          >{{ t('admin.menuMap.diagram') }}</UButton
        >
      </UFieldGroup>
    </div>

    <p v-if="!subject" class="mm-hint">{{ t('admin.menuMap.pickHint') }}</p>

    <PlatformMenuMapTable
      v-if="view === 'table'"
      :rows="rows"
      :group-labels="groupLabels"
      :judged="judged"
      :only-hidden="onlyHidden"
    />
    <template v-else>
      <PlatformMenuMapDiagram
        :rows="rows"
        :group-labels="groupLabels"
        :judged="judged"
        :selected="selected"
        @select="selected = $event"
      />
      <PlatformMenuMapTable
        v-if="detail"
        :rows="[detail]"
        :group-labels="groupLabels"
        :judged="judged"
        flat
        class="mm-detail"
      />
    </template>
  </div>
</template>

<style scoped>
.mm-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.mm-label {
  color: var(--app-muted);
  font-size: 13px;
}
.mm-pick {
  width: 260px;
  max-width: 100%;
}
.mm-grow {
  flex: 1;
}
.mm-hint {
  margin-bottom: 10px;
  color: var(--app-muted);
  font-size: 13px;
}
.mm-detail {
  margin-top: 12px;
}
</style>
