/** Settlement statuses (plan 5). Only `draft` can be changed; `posted` is final unless the settlement needs clearing. */
export const SETTLEMENT_STATUSES = [
  'draft',
  'in_approval',
  'approved',
  'exported',
  'posted',
  'clearing_exported',
  'cleared',
  'void',
  'cancelled_after_export',
] as const
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number]

/** How much of the advance was used (spec §10, regulation 3.2.3). */
export const CASE_KINDS = ['unused', 'partly_used', 'fully_used', 'overspent'] as const
export type CaseKind = (typeof CASE_KINDS)[number]

/** The expense account of a domestic or border line (spec §11): fuel 4405100001, fare 4405200001. */
export const EXPENSE_TYPES = ['fuel', 'fare'] as const
export type ExpenseType = (typeof EXPENSE_TYPES)[number]
