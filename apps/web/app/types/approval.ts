// API shapes come from `@elvine-sk/platform-approval/schemas`. The workflow definition below is the JSON
// the editor builds; the API stores it untyped and validates it on save.
import type { Condition } from '@elvine-sk/platform-core'

export type {
  ApprovalEntities,
  Audience,
  AvailableWorkflow,
  ApprovalEventType,
  AssignmentStatus,
  DelegateCandidate,
  Delegation,
  InboxItem,
  PersonRef,
  RequestDetail,
  RequestEvent,
  RequestStep,
  RequestSummary,
  WorkflowDetail,
  WorkflowsOverview,
  WorkflowSummary,
} from '@elvine-sk/platform-approval/schemas'

export type Decision = 'approve' | 'reject' | 'return'

export interface ApproverSpec {
  user?: string
  role?: string
  group?: string
  resolver?: string
}

export interface WorkflowStep {
  key: string
  approvers: ApproverSpec
  completion?: 'any' | 'all'
  condition?: Condition
  dueInHours?: number
  escalateTo?: ApproverSpec
}

export interface WorkflowStage {
  key: string
  steps: WorkflowStep[]
}

export interface WorkflowDefinition {
  stages: WorkflowStage[]
  rules?: { allowSelfApproval?: boolean; rejectEndsRequest?: true }
}
