<script setup lang="ts">
/**
 * Who am I in this system: position, branch, department and section from HRM, and the roles that decide what
 * the user can do here. Shown above the user line in the sidebar; links to the full HRM profile.
 */
interface HrmMe {
  eid: string
  branchCode: string
  branchName: string | null
  departmentName: string | null
  sectionName: string | null
  positionName: string | null
}

const { t, te } = useI18n()
const session = useSession()
const hrm = useApiItem<HrmMe>('hrm-me', '/hrm/me', { staleTime: 5 * 60_000, retry: false })

const subject = computed(() => session.me.value?.subject)
/** Every signed-in HRM user is an employee: list only the roles that add something. */
const roles = computed(() => {
  const keys = (subject.value?.roles ?? []).filter((r) => r !== 'employee')
  return subject.value?.isSuper && !keys.includes('super_admin') ? ['super_admin', ...keys] : keys
})
const roleLabel = (key: string) => (te(`profile.roles.${key}`) ? t(`profile.roles.${key}`) : key)

const e = computed(() => (hrm.error.value ? null : hrm.data.value))
const branch = computed(() => {
  const v = e.value
  if (!v) return null
  return v.branchName ? `${v.branchName} (${v.branchCode})` : v.branchCode
})
const unit = computed(() => [e.value?.departmentName, e.value?.sectionName].filter(Boolean).join(' · ') || null)
</script>

<template>
  <NuxtLink to="/me" class="me-card" :aria-label="t('profile.open')">
    <USkeleton v-if="hrm.isPending.value" class="h-16" />
    <template v-else>
      <span v-if="e?.positionName" class="pos">
        <UIcon name="i-lucide-briefcase" class="size-3.5 shrink-0" />
        <span class="truncate">{{ e.positionName }}</span>
      </span>
      <span v-if="branch" class="row" :title="t('profile.branch')">
        <UIcon name="i-lucide-building-2" class="ico" />
        <span class="truncate">{{ branch }}</span>
      </span>
      <span v-if="unit" class="row" :title="t('profile.unit')">
        <UIcon name="i-lucide-layers" class="ico" />
        <span class="truncate">{{ unit }}</span>
      </span>
      <span class="roles" :aria-label="t('profile.roles.title')">
        <UBadge
          v-for="r in roles"
          :key="r"
          :label="roleLabel(r)"
          size="sm"
          variant="subtle"
          :color="r === 'super_admin' ? 'error' : 'primary'"
        />
        <UBadge v-if="!roles.length" :label="roleLabel('employee')" size="sm" variant="subtle" color="neutral" />
      </span>
    </template>
  </NuxtLink>
</template>

<style scoped>
.me-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-surface-2);
  color: var(--app-text);
  font-size: 12px;
  text-decoration: none;
  transition: border-color 0.15s;
}
.me-card:hover,
.me-card:focus-visible {
  border-color: color-mix(in oklab, var(--app-accent) 45%, var(--app-border));
}
.pos {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 5px;
  max-width: 100%;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--app-accent) 14%, var(--app-surface));
  color: color-mix(in oklab, var(--app-accent) 75%, var(--app-text));
  font-weight: 600;
}
.row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--app-muted);
}
.ico {
  width: 14px;
  height: 14px;
  flex: none;
}
.roles {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
:global(.is-rail) .me-card {
  display: none;
}
</style>
