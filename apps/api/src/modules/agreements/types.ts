/** HRM's `BRANCH_CODE` of head office, which enters and sees agreements of every branch (spec §8, §12). */
export const HEAD_OFFICE_BRANCH = '888010'

/** Forms 1–4 (spec §8). */
export const FORM_TYPES = ['domestic', 'district', 'overseas', 'border'] as const
export type FormType = (typeof FORM_TYPES)[number]

/** Who pays (ກ6). */
export const POLICY_OPTIONS = [
  'bcel_all',
  'host_travel',
  'host_accommodation',
  'host_meals',
  'host_meals_accommodation',
] as const
export type PolicyOption = (typeof POLICY_OPTIONS)[number]

export const AGREEMENT_STATUSES = ['draft', 'in_approval', 'approved', 'cancelled'] as const
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number]
