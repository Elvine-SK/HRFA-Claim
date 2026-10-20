<script setup lang="ts">
import type { AuthzCatalog, Policy, RoleDetail } from '../../../types/platform'

const props = defineProps<{ catalog: AuthzCatalog; roles: RoleDetail[]; editable: boolean }>()
const emit = defineEmits<{ edit: [policy: Policy, role: RoleDetail]; create: [] }>()
const { t, te } = useI18n()
const sentence = usePolicySentence()

const effect = ref<'all' | 'allow' | 'deny'>('all')
const resource = ref('all')
const roleId = ref('all')

const label = (text: string) => (te(text) ? t(text) : text)
const resourceItems = computed(() => [
  { value: 'all', label: t('admin.roles.policyList.allResources') },
  ...props.catalog.resources.map((r) => ({ value: r.resource, label: label(r.label ?? r.resource) })),
])
const roleItems = computed(() => [
  { value: 'all', label: t('admin.roles.policyList.allRoles') },
  ...props.roles.filter((r) => !r.isSuper).map((r) => ({ value: r.id, label: r.name })),
])
const rows = computed(() => policyRows<Policy, RoleDetail>(props.roles))
const shown = computed(() =>
  filterPolicies(rows.value, {
    effect: effect.value === 'all' ? '' : effect.value,
    resource: resource.value === 'all' ? undefined : resource.value,
    roleId: roleId.value === 'all' ? undefined : roleId.value,
  }),
)
</script>

<template>
  <div data-testid="policy-list">
    <div class="pl-tools">
      <PlatformSegmented
        v-model="effect"
        :options="[
          { value: 'all', label: t('admin.roles.policyList.allEffects') },
          { value: 'allow', label: t('admin.roles.policy.allow') },
          { value: 'deny', label: t('admin.roles.policy.deny') },
        ]"
        :label="t('admin.roles.policy.effect')"
      />
      <USelect
        v-model="resource"
        :items="resourceItems"
        icon="i-lucide-box"
        class="min-w-[170px]"
        :aria-label="t('admin.roles.policy.resource')"
      />
      <USelect
        v-model="roleId"
        :items="roleItems"
        icon="i-lucide-shield-check"
        class="min-w-[170px]"
        :aria-label="t('admin.roles.matrix.role')"
      />
      <UButton v-if="editable" icon="i-lucide-plus" class="ms-auto" @click="emit('create')">
        {{ t('admin.roles.newPolicy') }}
      </UButton>
    </div>
    <ul v-if="shown.length" class="pl-list">
      <li v-for="row in shown" :key="row.policy.id">
        <button type="button" class="pl-row" @click="emit('edit', row.policy, row.role)">
          <UBadge :color="row.policy.effect === 'allow' ? 'success' : 'error'" variant="subtle" size="sm">
            {{ t(`admin.roles.policy.${row.policy.effect}`) }}
          </UBadge>
          <span class="min-w-0 flex-1">
            <b class="block truncate text-[13.5px]">{{ row.policy.name }}</b>
            <span class="pl-s">{{ sentence(row.policy, [row.role.name], catalog) }}</span>
            <span class="pl-r">
              <code class="mono">{{ row.policy.resource }} · {{ row.policy.actions.join(', ') }}</code>
              <UBadge color="neutral" variant="outline" size="sm" icon="i-lucide-shield-check">
                {{ row.role.name }}
              </UBadge>
            </span>
          </span>
          <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-[var(--app-muted)]" />
        </button>
      </li>
    </ul>
    <PlatformEmptyState
      v-else
      :kind="rows.length ? 'no-results' : 'first-use'"
      icon="i-lucide-scale"
      :title="rows.length ? t('admin.roles.policyList.noMatch') : t('admin.roles.noPolicies')"
      :text="rows.length ? t('admin.roles.policyList.noMatchText') : t('admin.roles.policyList.emptyText')"
      class="py-10"
    />
  </div>
</template>

<style scoped>
.pl-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 14px var(--app-pad, 20px);
  border-bottom: 1px solid var(--app-border);
}
.pl-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.pl-list li + li {
  border-top: 1px solid var(--app-border);
}
.pl-row {
  display: flex;
  width: 100%;
  align-items: flex-start;
  gap: 12px;
  padding: 12px var(--app-pad, 20px);
  text-align: start;
  cursor: pointer;
}
.pl-row:hover {
  background: color-mix(in oklab, var(--app-accent) 6%, transparent);
}
.pl-row:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: -2px;
}
.pl-s {
  display: block;
  margin-top: 2px;
  color: var(--app-muted);
  font-size: 12.5px;
}
.pl-r {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  color: var(--app-muted);
  font-size: 12px;
}
</style>
