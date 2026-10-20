<script setup lang="ts">
import type { DueKind } from '@elvine-sk/platform-nuxt/utils'
import type { Tone } from '../../utils/tone'

/** Hover preview of the approval request a notification is about. */
const props = defineProps<{ requestId: string }>()

const { t, te } = useI18n()
const dates = useDates()
const entities = useApprovalEntityRegistry()
const detail = useApprovalRequest(() => props.requestId)
const request = computed(() => detail.data.value)

const current = computed(() => {
  const r = request.value
  return r ? approvalStages(r.steps, r.round).find((s) => s.state === 'current') : undefined
})
const stageName = (key: string) =>
  te(`approval.stages.${key}`) ? t(`approval.stages.${key}`) : key.replaceAll(/[_-]/g, ' ')
const waitingOn = computed(() =>
  (current.value?.steps ?? [])
    .flatMap((s) => s.assignments)
    .filter((a) => a.status === 'pending')
    .map((a) => a.user.displayName),
)
const due = computed(() => {
  const at = current.value?.steps
    .map((s) => s.dueAt)
    .filter(Boolean)
    .sort()[0]
  return dueInfo(at)
})
const DUE_TONES: Record<DueKind, Tone> = {
  overdue: 'danger',
  today: 'warning',
  soon: 'warning',
  later: 'neutral',
}
</script>

<template>
  <div class="pk" data-testid="notification-peek">
    <div v-if="detail.isPending.value" class="space-y-2">
      <USkeleton class="h-5 w-1/2" />
      <USkeleton class="h-4 w-3/4" />
      <USkeleton class="h-4 w-2/3" />
    </div>
    <p v-else-if="!request" class="muted text-[13px]">{{ t('approval.detail.unavailable') }}</p>
    <template v-else>
      <header class="pk-h">
        <span class="pk-tile" aria-hidden="true">
          <UIcon :name="entities.icon(request.entityType)" class="size-[18px]" />
        </span>
        <div class="min-w-0 flex-1">
          <b>
            {{ entities.label(request.entityType) }}
            <span class="muted font-mono text-[12px] font-medium">#{{ request.entityId.slice(-6) }}</span>
          </b>
          <span class="pk-sub">
            {{
              t('approval.detail.submittedBy', {
                name: request.submittedBy.displayName,
                when: dates.relative(request.submittedAt),
              })
            }}
          </span>
        </div>
      </header>
      <dl class="pk-facts">
        <div>
          <dt>{{ t('approval.columns.status') }}</dt>
          <dd>
            <PlatformStatusBadge
              :tone="REQUEST_STATUS_TONES[request.status]"
              :label="t(`approval.status.${request.status}`)"
            />
          </dd>
        </div>
        <div v-if="current">
          <dt>{{ t('approval.detail.stage') }}</dt>
          <dd class="capitalize">{{ stageName(current.key) }}</dd>
        </div>
        <div v-if="waitingOn.length">
          <dt>{{ t('notifications.peek.waitingOn') }}</dt>
          <dd>{{ waitingOn.join(', ') }}</dd>
        </div>
        <div v-if="due">
          <dt>{{ t('notifications.peek.due') }}</dt>
          <dd>
            <PlatformStatusBadge
              :tone="DUE_TONES[due.kind]"
              :dot="false"
              :label="t(`approval.due.${due.kind}`, { n: due.days }, due.days)"
            />
          </dd>
        </div>
      </dl>
    </template>
  </div>
</template>

<style scoped>
.pk {
  width: 300px;
  padding: 14px;
}
.pk-h {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.pk-tile {
  display: grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: color-mix(in oklab, var(--app-accent) 12%, var(--app-surface));
  color: var(--app-accent);
}
.pk-h b {
  display: block;
  font-size: 14px;
  font-weight: 600;
}
.pk-sub {
  display: block;
  margin-top: 2px;
  color: var(--app-muted);
  font-size: 12.5px;
}
.pk-facts {
  display: grid;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--app-border);
  font-size: 13px;
}
.pk-facts div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.pk-facts dt {
  color: var(--app-muted);
}
.pk-facts dd {
  min-width: 0;
  text-align: right;
}
</style>
