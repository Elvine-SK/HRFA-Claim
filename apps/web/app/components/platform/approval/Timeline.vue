<script setup lang="ts">
import type { ApprovalEventType, RequestEvent, RequestStep } from '../../../types/approval'
import type { Tone } from '../../../utils/tone'

const props = defineProps<{ events: RequestEvent[]; steps?: RequestStep[] }>()
const { t, te } = useI18n()
const { relative, dateTime } = useDates()

const KINDS: Record<ApprovalEventType, { icon: string; tone: Tone }> = {
  submitted: { icon: 'i-lucide-send', tone: 'info' },
  resubmitted: { icon: 'i-lucide-rotate-cw', tone: 'info' },
  stage_started: { icon: 'i-lucide-flag', tone: 'neutral' },
  step_skipped: { icon: 'i-lucide-skip-forward', tone: 'neutral' },
  step_completed: { icon: 'i-lucide-check-check', tone: 'success' },
  approved: { icon: 'i-lucide-check', tone: 'success' },
  rejected: { icon: 'i-lucide-x', tone: 'danger' },
  returned: { icon: 'i-lucide-undo-2', tone: 'warning' },
  commented: { icon: 'i-lucide-message-square', tone: 'accent' },
  cancelled: { icon: 'i-lucide-ban', tone: 'neutral' },
  completed: { icon: 'i-lucide-flag-triangle-right', tone: 'success' },
  delegated: { icon: 'i-lucide-forward', tone: 'chart-3' },
  escalated: { icon: 'i-lucide-siren', tone: 'warning' },
}

const stepOf = (id: string | null) => (id ? props.steps?.find((s) => s.id === id) : undefined)
const stageName = (key: string) =>
  te(`approval.stages.${key}`) ? t(`approval.stages.${key}`) : key.replaceAll(/[_-]/g, ' ')
const items = computed(() =>
  [...props.events]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .map((e) => {
      const step = stepOf(e.stepId)
      const details = (e.details ?? {}) as Record<string, unknown>
      const stage = step?.stageKey ?? (typeof details.stage === 'string' ? details.stage : undefined)
      const status = typeof details.status === 'string' ? details.status : undefined
      return {
        ...e,
        kind: KINDS[e.type] ?? { icon: 'i-lucide-dot', tone: 'neutral' as Tone },
        text: t(`approval.events.${e.type}`, {
          actor: e.actor?.displayName ?? t('approval.events.system'),
          stage: stage ? stageName(stage) : '',
          status: status ? t(`approval.status.${status}`) : '',
        }),
      }
    }),
)
</script>

<template>
  <ol class="tl">
    <li v-for="e in items" :key="e.id" :style="{ '--k': toneVar(e.kind.tone) }">
      <span class="ic" aria-hidden="true"><UIcon :name="e.kind.icon" class="size-3.5" /></span>
      <div class="min-w-0">
        <p>
          {{ e.text }}
          <span v-if="e.round > 1" class="round">{{ t('approval.round', { n: e.round }) }}</span>
        </p>
        <blockquote v-if="e.comment" class="cmt">{{ e.comment }}</blockquote>
        <time :datetime="e.occurredAt" :title="dateTime(e.occurredAt)">{{ relative(e.occurredAt) }}</time>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.tl {
  position: relative;
  display: grid;
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.tl::before {
  content: '';
  position: absolute;
  top: 6px;
  bottom: 6px;
  inset-inline-start: 13px;
  width: 2px;
  background: var(--app-border);
}
.tl li {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 12px;
}
.ic {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid color-mix(in oklab, var(--k) 25%, transparent);
  border-radius: 50%;
  background: color-mix(in oklab, var(--k) 14%, var(--app-surface));
  color: var(--k);
}
p {
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.round {
  margin-inline-start: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--app-surface-2);
  color: var(--app-muted);
  font-size: 11px;
}
.cmt {
  margin: 6px 0 4px;
  padding: 8px 12px;
  border-radius: var(--app-r-sm);
  background: var(--app-surface-2);
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
time {
  color: var(--app-muted);
  font: 500 11.5px var(--app-mono);
}
</style>
