<script setup lang="ts">
import type { Delegation } from '../../../types/approval'

const { t } = useI18n()
const notify = useNotify()
const confirm = useConfirm()
const session = useSession()
const { dateTime } = useDates()
const entities = useApprovalEntityRegistry()
const { list, revoke } = useApprovalDelegations()
const creating = ref(false)
const editing = ref<Delegation | null>(null)
const formOpen = computed({
  get: () => creating.value || !!editing.value,
  set: (v: boolean) => {
    if (v) return
    creating.value = false
    editing.value = null
  },
})

const me = computed(() => session.user.value?.id)
const given = computed(() => (list.data.value ?? []).filter((d) => d.user.id === me.value))
const received = computed(() => (list.data.value ?? []).filter((d) => d.delegate.id === me.value))
const rows = (side: 'given' | 'received') => (side === 'given' ? given.value : received.value)
// The other person on the row: who I delegated to, or who delegated to me.
const other = (d: Delegation, side: 'given' | 'received') => (side === 'given' ? d.delegate : d.user)
const scope = (d: Delegation) =>
  d.entityType ? entities.label(d.entityType) : t('account.delegations.allTypes')
const started = (d: Delegation) => new Date(d.startsAt).getTime() <= Date.now()

async function onRevoke(d: Delegation) {
  const ok = await confirm({
    title: t('account.delegations.revokeTitle'),
    description: t('account.delegations.revokeText', { name: d.delegate.displayName }),
    confirmLabel: t('account.delegations.revoke'),
    danger: true,
  })
  if (!ok) return
  try {
    await revoke.mutateAsync(d.id)
    notify.success(t('account.delegations.revoked'))
  } catch (error) {
    notify.error(error)
  }
}
</script>

<template>
  <div class="grid gap-5">
    <section
      v-for="side in ['given', 'received'] as const"
      :key="side"
      class="card"
      :data-testid="`delegations-${side}`"
    >
      <header class="card-h">
        <div class="flex-1">
          <h2>{{ t(`account.delegations.${side}Title`) }}</h2>
          <p>{{ t(`account.delegations.${side}Text`) }}</p>
        </div>
        <UButton v-if="side === 'given'" icon="i-lucide-plus" size="sm" @click="creating = true">
          {{ t('account.delegations.new') }}
        </UButton>
      </header>
      <div v-if="list.isPending.value" class="p-4"><USkeleton class="h-16 w-full" /></div>
      <PlatformEmptyState
        v-else-if="list.isError.value"
        kind="no-results"
        icon="i-lucide-circle-alert"
        tone="danger"
        :title="notify.messageOf(list.error.value)"
      />
      <PlatformEmptyState
        v-else-if="!rows(side).length"
        kind="no-results"
        icon="i-lucide-forward"
        :title="t(`account.delegations.${side}Empty`)"
      />
      <ul v-else class="dl-list">
        <li v-for="d in rows(side)" :key="d.id" class="dl-row">
          <PlatformUserAvatar :name="other(d, side).displayName" :seed="other(d, side).id" size="sm" />
          <div class="min-w-0 flex-1">
            <b>{{ other(d, side).displayName }}</b>
            <small>
              {{ scope(d) }} · {{ dateTime(d.startsAt) }} – {{ dateTime(d.endsAt) }}
              <template v-if="d.reason"> · {{ d.reason }}</template>
            </small>
          </div>
          <PlatformStatusBadge
            :tone="started(d) ? 'success' : 'neutral'"
            :label="t(started(d) ? 'account.delegations.active' : 'account.delegations.scheduled')"
          />
          <UButton
            v-if="side === 'given'"
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-pencil"
            :aria-label="t('account.delegations.editOne', { name: d.delegate.displayName })"
            @click="editing = d"
          />
          <UButton
            v-if="side === 'given'"
            color="neutral"
            variant="ghost"
            size="sm"
            :loading="revoke.isPending.value && revoke.variables.value === d.id"
            @click="onRevoke(d)"
          >
            {{ t('account.delegations.revoke') }}
          </UButton>
        </li>
      </ul>
    </section>
    <PlatformAccountDelegationForm v-model:open="formOpen" :delegation="editing" />
  </div>
</template>

<style scoped>
.dl-list {
  display: grid;
}
.dl-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid var(--app-border);
}
.dl-row b {
  display: block;
  font-size: 14px;
  font-weight: 600;
}
.dl-row small {
  display: block;
  color: var(--app-muted);
  font-size: 12.5px;
}
</style>
