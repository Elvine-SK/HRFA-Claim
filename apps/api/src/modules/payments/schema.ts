import type { FieldMap } from '@elvine-sk/platform-core'
import { IsoDateTime, z } from '@elvine-sk/platform-server'
import { FORM_TYPES } from '../agreements/types.ts'
import { AMOUNT_PATTERN } from '../travel-master/money.ts'
import { COMPONENTS, PAYMENT_STATUSES } from './types.ts'

const Amount = z.string().regex(AMOUNT_PATTERN)
/** A signed amount as stored, two decimals (a meal deduction is negative). */
const StoredAmount = z.string().openapi({ example: '-150000.00' })

export const PaymentCreateSchema = z.object({ agreementId: z.string().uuid() }).openapi('PaymentCreate')

export const VersionSchema = z.object({ version: z.number().int().min(1) }).openapi('PaymentVersion')

export const BillSchema = z
  .object({
    eid: z.string().regex(/^\d{5}$/),
    /** Night `n` is the night after day `n`; 8 onward. */
    night: z.number().int().min(1).max(400),
    /** What the hotel billed for the night; the payment is capped at the rate. `0` when nothing is paid. */
    amount: Amount,
  })
  .openapi('PaymentBill')

export const BillsSchema = z
  .object({ version: z.number().int().min(1), bills: z.array(BillSchema).max(2000) })
  .openapi('PaymentBills')

export const PaymentItemSchema = z
  .object({
    component: z.enum(COMPONENTS),
    currency: z.enum(['LAK', 'USD']),
    rate: StoredAmount,
    /** Litres for `fuel` (up to 3 decimals), a whole count otherwise. */
    count: z.number(),
    amount: StoredAmount,
    basis: z.string(),
  })
  .openapi('PaymentItem')

export const PaymentMemberSchema = z
  .object({
    eid: z.string(),
    nameLao: z.string(),
    snameLao: z.string(),
    nameEng: z.string().nullable(),
    snameEng: z.string().nullable(),
    branchCode: z.string(),
    rankCode: z.string().nullable(),
    accountLak: z.string().nullable(),
    accountUsd: z.string().nullable(),
    departureDate: z.string(),
    returnDate: z.string(),
    paidDays: z.number().int(),
    hostMeals: z.number().int(),
    privateCarKm: z.number().int().nullable(),
    isLeader: z.boolean(),
    isAdvanceHolder: z.boolean(),
    items: z.array(PaymentItemSchema),
  })
  .openapi('PaymentMember')

export const PaymentListItemSchema = z
  .object({
    id: z.string().uuid(),
    agreementId: z.string().uuid(),
    ref: z.string(),
    /** In the script of the request's language. */
    docNo: z.string(),
    formType: z.enum(FORM_TYPES),
    subject: z.string(),
    zoneCode: z.string().nullable(),
    branchCode: z.string(),
    travelFrom: z.string(),
    travelTo: z.string(),
    status: z.enum(PAYMENT_STATUSES),
    calculatedAt: IsoDateTime,
    submittedAt: IsoDateTime.nullable(),
    exportedAt: IsoDateTime.nullable(),
    postedAt: IsoDateTime.nullable(),
    coreRef: z.string().nullable(),
    cancelledAt: IsoDateTime.nullable(),
    createdBy: z.string().uuid().nullable(),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
    version: z.number().int(),
  })
  .openapi('PaymentListItem')

/** The posting batch of an exported payment (spec §11); its file is `GET /posting-batches/{id}/file`. */
export const PostingBatchSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(['payment', 'settlement']),
    /** The HRM branch of the Finance user who exported it (the GL accounts' prefix). */
    branchCode: z.string(),
    fileName: z.string(),
    createdAt: IsoDateTime,
    createdBy: z.string().uuid().nullable(),
    cancelledAfterExportAt: IsoDateTime.nullable(),
  })
  .openapi('PostingBatch')

export const PostedSchema = z
  .object({ version: z.number().int().min(1), coreRef: z.string().trim().max(50).optional() })
  .openapi('PaymentPosted')

/** The checking table (spec §9). */
export const PaymentSchema = PaymentListItemSchema.extend({
  members: z.array(PaymentMemberSchema),
  /** Members with nights from day 8 that take Finance's bill. */
  flags: z.array(z.object({ eid: z.string(), billedNights: z.array(z.number().int()) })),
  /** Sum of the items per currency. */
  totals: z.record(z.string(), StoredAmount),
  bills: z.array(z.object({ eid: z.string(), night: z.number().int(), amount: StoredAmount })),
  batch: PostingBatchSchema.nullable(),
}).openapi('Payment')

export const PaymentLookupQuery = z.object({ number: z.string().trim().min(1).max(40) })

export const PaymentLookupSchema = z
  .object({ agreementId: z.string().uuid(), paymentId: z.string().uuid().nullable() })
  .openapi('PaymentLookup')

/** List filters and sort (`payments` as `p`, its agreement as `a`). */
export const paymentFields: FieldMap = {
  ref: { type: 'string', column: 'a.ref', sortable: true, searchable: true },
  docNo: { type: 'string', column: 'a.docNo', sortable: true, searchable: true },
  subject: { type: 'string', column: 'a.subject', searchable: true },
  formType: { type: 'enum', column: 'a.formType', values: FORM_TYPES },
  agreementId: { type: 'uuid', column: 'p.agreementId' },
  status: { type: 'enum', column: 'p.status', values: PAYMENT_STATUSES },
  branchCode: { type: 'string', column: 'p.branchCode' },
  travelFrom: { type: 'date', column: 'a.travelFrom', sortable: true },
  createdAt: { type: 'datetime', column: 'p.createdAt', sortable: true },
  updatedAt: { type: 'datetime', column: 'p.updatedAt', sortable: true },
}
