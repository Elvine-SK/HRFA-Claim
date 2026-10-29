import type { FieldMap } from '@elvine-sk/platform-core'
import { IsoDateTime, z } from '@elvine-sk/platform-server'
import { DateOnly } from '../../shared/schema.ts'
import { AGREEMENT_STATUSES, FORM_TYPES, POLICY_OPTIONS } from './types.ts'

const Code = z.string().trim().min(1).max(16)
const Text = (max: number) => z.string().trim().min(1).max(max)

export const MemberInputSchema = z
  .object({
    eid: z.string().regex(/^\d{5}$/),
    /** Default: the agreement's travel dates. */
    departureDate: DateOnly.optional(),
    returnDate: DateOnly.optional(),
    /** Days HR takes off the calculated count by hand (ກ2). */
    daysSubtracted: z.number().int().min(0).max(366).default(0),
    isLeader: z.boolean().default(false),
    isDeputy: z.boolean().default(false),
    isAdvanceHolder: z.boolean().default(false),
    /** Meals the host provides to this member (regulation 4.6). */
    hostMeals: z.number().int().min(0).max(1098).default(0),
    /** Distance by private car, km (regulation 3.1.3, 3.1.6). */
    privateCarKm: z.number().int().min(1).max(5000).nullable().default(null),
    /** "ວ່າການ": the HRM position this member fills, which sets the rank (spec §5). */
    actingPositionCode: Code.nullable().default(null),
  })
  .openapi('AgreementMemberInput')

const header = {
  subject: Text(500),
  title: Text(500),
  reference: z.string().trim().max(200).nullable().default(null),
  /** Typed from the paper, either script, `.` or `/` (spec §8). */
  docNo: z.string().trim().min(1).max(40),
  docDate: DateOnly,
  travelFrom: DateOnly,
  travelTo: DateOnly,
  policyOption: z.enum(POLICY_OPTIONS),
  hasAdvance: z.boolean(),
  members: z.array(MemberInputSchema).min(1).max(50),
}

export const AgreementInputSchema = z
  .discriminatedUnion('formType', [
    z.object({ formType: z.literal('domestic'), ...header, fromProvinceCode: Code, toProvinceCode: Code }),
    z.object({
      formType: z.literal('district'),
      ...header,
      provinceCode: Code,
      fromDistrictCode: Code,
      toDistrictCode: Code,
      overnight: z.boolean(),
      /** Same-day trips only: 50 km or more (ກ1). */
      sameDayOver50km: z.boolean().nullable().default(null),
    }),
    z.object({ formType: z.literal('overseas'), ...header, countryIso2: z.string().trim().length(2).toUpperCase() }),
    z.object({
      formType: z.literal('border'),
      ...header,
      fromProvinceCode: Code,
      /** One of the routes, or `null` with the route typed in `borderRouteOther` (ກ7). */
      borderRouteId: z.string().uuid().nullable().default(null),
      borderRouteOther: z.string().trim().min(1).max(200).nullable().default(null),
    }),
  ])
  .openapi('AgreementInput')
export type AgreementInput = z.infer<typeof AgreementInputSchema>
export type MemberInput = z.infer<typeof MemberInputSchema>

export const AgreementUpdateSchema = z
  .intersection(AgreementInputSchema, z.object({ version: z.number().int().min(1) }))
  .openapi('AgreementUpdate')

export const MemberSchema = z
  .object({
    id: z.string().uuid(),
    eid: z.string(),
    departureDate: z.string(),
    returnDate: z.string(),
    daysSubtracted: z.number().int(),
    calculatedDays: z.number().int(),
    paidDays: z.number().int(),
    isLeader: z.boolean(),
    isDeputy: z.boolean(),
    isAdvanceHolder: z.boolean(),
    hostMeals: z.number().int(),
    privateCarKm: z.number().int().nullable(),
    actingPositionCode: z.string().nullable(),
    nameLao: z.string(),
    snameLao: z.string(),
    nameEng: z.string().nullable(),
    snameEng: z.string().nullable(),
    branchCode: z.string(),
    departmentName: z.string().nullable(),
    sectionName: z.string().nullable(),
    positionCode: z.string().nullable(),
    positionName: z.string().nullable(),
    postType: z.number().int().nullable(),
    actingPositionName: z.string().nullable(),
    rankCode: z.string().nullable(),
    accountLak: z.string().nullable(),
    accountUsd: z.string().nullable(),
  })
  .openapi('AgreementMember')

export const AgreementSchema = z
  .object({
    id: z.string().uuid(),
    ref: z.string(),
    formType: z.enum(FORM_TYPES),
    status: z.enum(AGREEMENT_STATUSES),
    subject: z.string(),
    title: z.string(),
    reference: z.string().nullable(),
    /** In the script of the request's language. */
    docNo: z.string(),
    docDate: z.string(),
    branchCode: z.string(),
    travelFrom: z.string(),
    travelTo: z.string(),
    fromProvinceCode: z.string().nullable(),
    toProvinceCode: z.string().nullable(),
    provinceCode: z.string().nullable(),
    fromDistrictCode: z.string().nullable(),
    toDistrictCode: z.string().nullable(),
    overnight: z.boolean().nullable(),
    sameDayOver50km: z.boolean().nullable(),
    countryIso2: z.string().nullable(),
    zoneCode: z.string().nullable(),
    borderRouteId: z.string().uuid().nullable(),
    borderRouteOther: z.string().nullable(),
    policyOption: z.enum(POLICY_OPTIONS),
    hasAdvance: z.boolean(),
    submittedAt: IsoDateTime.nullable(),
    cancelReason: z.string().nullable(),
    cancelledAt: IsoDateTime.nullable(),
    createdBy: z.string().uuid().nullable(),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
    version: z.number().int(),
    members: z.array(MemberSchema),
  })
  .openapi('Agreement')

export const AgreementListItemSchema = AgreementSchema.omit({ members: true }).openapi('AgreementListItem')

export const LookupQuery = z.object({ number: z.string().trim().min(1).max(40) })

/** List filters and sort (`agreements` columns). */
export const agreementFields: FieldMap = {
  ref: { type: 'string', sortable: true, searchable: true },
  docNo: { type: 'string', sortable: true, searchable: true },
  subject: { type: 'string', searchable: true },
  formType: { type: 'enum', values: FORM_TYPES },
  status: { type: 'enum', values: AGREEMENT_STATUSES },
  branchCode: { type: 'string' },
  travelFrom: { type: 'date', sortable: true },
  createdAt: { type: 'datetime', sortable: true },
  updatedAt: { type: 'datetime', sortable: true },
}

export const CancelSchema = z
  .object({ version: z.number().int().min(1), reason: z.string().trim().min(1).max(500) })
  .openapi('AgreementCancel')
