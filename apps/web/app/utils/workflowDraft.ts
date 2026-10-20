import { fromBuilder, toBuilder, type BuilderGroup } from '@elvine-sk/platform-nuxt/utils'
import type { ApproverSpec, WorkflowStep } from '../types/approval'

/** A workflow step while it is edited: the condition as a builder tree, toggles kept when switched off. */
export interface DraftStep {
  uid: number
  key: string
  approvers: ApproverSpec
  completion: 'any' | 'all'
  conditional: boolean
  tree: BuilderGroup
  dueInHours: number | null
  escalate: boolean
  escalateTo: ApproverSpec
}

let seq = 0
export const nextDraftUid = () => ++seq

export function toDraftStep(key: string, s?: WorkflowStep): DraftStep {
  return {
    uid: nextDraftUid(),
    key: s?.key ?? key,
    approvers: s?.approvers ?? { role: '' },
    completion: s?.completion ?? 'any',
    conditional: !!s?.condition,
    tree: toBuilder(s?.condition ?? null),
    dueInHours: s?.dueInHours ?? null,
    escalate: !!s?.escalateTo,
    escalateTo: s?.escalateTo ?? { role: '' },
  }
}

export function fromDraftStep(s: DraftStep): WorkflowStep {
  const step: WorkflowStep = { key: s.key, approvers: s.approvers, completion: s.completion }
  const condition = s.conditional ? fromBuilder(s.tree) : null
  if (condition) step.condition = condition
  if (s.dueInHours) step.dueInHours = s.dueInHours
  if (s.escalate && s.dueInHours && s.completion === 'any') step.escalateTo = s.escalateTo
  return step
}
