<script setup lang="ts">
import type { FlowNodeState } from '@elvine-sk/platform-nuxt/utils'
import type { RequestStep } from '../../../types/approval'

const props = defineProps<{ steps: RequestStep[]; round?: number }>()
const { t, te } = useI18n()
const { relative } = useDates()

const stages = computed(() => approvalStages(props.steps, props.round))
const keyLabel = (key: string) =>
  te(`approval.stages.${key}`) ? t(`approval.stages.${key}`) : key.replaceAll(/[_-]/g, ' ')
const ICONS: Partial<Record<FlowNodeState, string>> = {
  done: 'i-lucide-check',
  rejected: 'i-lucide-x',
  returned: 'i-lucide-undo-2',
  skipped: 'i-lucide-skip-forward',
}
const ASSIGNMENT_TONES = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  returned: 'warning',
  superseded: 'neutral',
} as const
</script>

<template>
  <ol class="flow" :aria-label="t('approval.flow.label')">
    <li v-for="(stage, i) in stages" :key="stage.key" class="node" :class="`is-${stage.state}`">
      <span class="pt" aria-hidden="true">
        <UIcon v-if="ICONS[stage.state]" :name="ICONS[stage.state]!" class="size-4" />
        <template v-else>{{ i + 1 }}</template>
      </span>
      <b>{{ keyLabel(stage.key) }}</b>
      <small>{{ t(`approval.flow.state.${stage.state}`) }}</small>
      <div class="par">
        <template v-for="step in stage.steps" :key="step.id">
          <span v-if="stage.steps.length > 1" class="step-k">
            {{ keyLabel(step.stepKey) }} · {{ t(`approval.completion.${step.completion}`) }}
          </span>
          <span
            v-for="a in step.assignments"
            :key="a.id"
            class="who"
            :style="{ '--k': toneVar(ASSIGNMENT_TONES[a.status]) }"
          >
            <i aria-hidden="true" />
            <span class="truncate">{{ a.user.displayName }}</span>
            <span class="sr-only">— {{ t(`approval.assignment.${a.status}`) }}</span>
            <UTooltip v-if="a.decidedAt" :text="t(`approval.assignment.${a.status}`)">
              <time class="muted" :datetime="a.decidedAt">{{ relative(a.decidedAt) }}</time>
            </UTooltip>
          </span>
          <span v-if="!step.assignments.length && step.status === 'skipped'" class="who muted">{{
            t('approval.flow.skippedStep')
          }}</span>
        </template>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.flow {
  display: flex;
  align-items: stretch;
  margin: 0;
  padding: 0 0 4px;
  list-style: none;
  overflow-x: auto;
}
.node {
  position: relative;
  flex: 1;
  min-width: 160px;
  padding-inline-end: 18px;
  margin: 0.5rem;
}
.node::after {
  content: '';
  position: absolute;
  top: 15px;
  inset-inline: 40px 4px;
  height: 2px;
  background: var(--app-border);
}
.node.is-done::after {
  background: var(--app-ok);
}
.node:last-child::after {
  display: none;
}
.pt {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 2px solid var(--app-border);
  border-radius: 50%;
  background: var(--app-surface-2);
  color: var(--app-muted);
  font: 600 12px var(--app-mono);
}
.is-done .pt {
  border-color: var(--app-ok);
  background: var(--app-ok);
  color: #fff;
}
.is-current .pt {
  border-color: var(--app-accent);
  background: var(--app-surface);
  color: var(--app-accent);
  box-shadow: 0 0 0 4px color-mix(in oklab, var(--app-accent) 18%, transparent);
}
.is-rejected .pt {
  border-color: var(--app-bad);
  background: var(--app-bad);
  color: #fff;
}
.is-returned .pt {
  border-color: var(--app-warn);
  background: var(--app-warn);
  color: #fff;
}
.node b {
  display: block;
  margin-top: 10px;
  font-size: 13px;
  text-transform: capitalize;
}
.node small {
  display: block;
  margin-top: 2px;
  color: var(--app-muted);
  font-size: 12px;
}
.par {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}
.step-k {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--app-muted);
  text-transform: uppercase;
}
.who {
  display: flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  max-width: 100%;
  padding: 4px 8px;
  border-radius: var(--app-r-sm);
  background: var(--app-surface-2);
  font-size: 12px;
}
.who i {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: var(--k, var(--app-warn));
}
</style>
