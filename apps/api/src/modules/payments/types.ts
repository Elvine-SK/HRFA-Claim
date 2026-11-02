/** Payment statuses (plan 4). One live payment per agreement; only `calculated` can be changed. */
export const PAYMENT_STATUSES = [
  'calculated',
  'in_approval',
  'approved',
  'exported',
  'posted',
  'void',
  'cancelled_after_export',
] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

/** Kinds of posting batch, one each per agreement (spec §11): the payment, the settlement and its clearing file. */
export const BATCH_KINDS = ['payment', 'settlement', 'clearing'] as const
export type BatchKind = (typeof BATCH_KINDS)[number]

/** Kinds of line in the checking table, in the order they are listed per member. */
export const COMPONENTS = [
  'daily',
  'same_day',
  'meal_deduction',
  'accommodation',
  'billed_accommodation',
  'fuel',
  'personal',
  'advance',
] as const
export type Component = (typeof COMPONENTS)[number]

/** The component an item is posted under (spec section 11). */
export type PostingComponent = 'daily' | 'accommodation' | 'fuel' | 'personal' | 'advance'

export const POSTING_COMPONENT: Record<Component, PostingComponent> = {
  daily: 'daily',
  same_day: 'daily',
  meal_deduction: 'daily',
  accommodation: 'accommodation',
  billed_accommodation: 'accommodation',
  fuel: 'fuel',
  personal: 'personal',
  advance: 'advance',
}
