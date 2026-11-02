import type { FieldMap } from '@elvine-sk/platform-core'
import { IsoDateTime, z } from '@elvine-sk/platform-server'
import { AMOUNT_PATTERN, RATE_PATTERN } from '../travel-master/money.ts'
import { CASE_KINDS, EXPENSE_TYPES, SETTLEMENT_STATUSES } from './types.ts'

const Amount = z.string().regex(AMOUNT_PATTERN)
/** A signed amount as stored, two decimals. */
const StoredAmount = z.string().openapi({ example: '1500000.00' })
const Eid = z.string().regex(/^\d{5}$/)

export const SettlementCreateSchema = z.object({ agreementId: z.string().uuid() }).openapi('SettlementCreate')

export const SettlementLineInputSchema = z
  .object({
    description: z.string().trim().min(1).max(300),
    /** Domestic and border settlements only (spec §11): the expense account of the line. */
    expenseType: z.enum(EXPENSE_TYPES).optional(),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
    amount: Amount,
    /** Only for a currency other than the settlement's: amount ÷ cross rate is the settled amount (ກ27). */
    crossRate: z.string().regex(RATE_PATTERN).optional(),
    receiptFileId: z.string().uuid().optional(),
    /** Instead of a receipt (regulation 4.4); Finance sees the line highlighted. */
    noReceiptReason: z.string().trim().min(1).max(500).optional(),
    rateProofFileId: z.string().uuid().optional(),
  })
  .openapi('SettlementLineInput')

export const SettlementDraftSchema = z
  .object({
    version: z.number().int().min(1),
    caseKind: z.enum(CASE_KINDS).nullable().optional(),
    lines: z.array(SettlementLineInputSchema).max(200),
  })
  .openapi('SettlementDraft')

export const SettlementLineSchema = z
  .object({
    id: z.string().uuid(),
    description: z.string(),
    expenseType: z.enum(EXPENSE_TYPES).nullable(),
    currency: z.string(),
    amount: StoredAmount,
    crossRate: z.string().nullable(),
    settledAmount: StoredAmount,
    receiptFileId: z.string().uuid().nullable(),
    noReceiptReason: z.string().nullable(),
    rateProofFileId: z.string().uuid().nullable(),
  })
  .openapi('SettlementLine')

export const SettlementTotalsSchema = z
  .object({
    total: StoredAmount,
    remaining: StoredAmount,
    caseKind: z.enum(CASE_KINDS),
    returned: StoredAmount,
    excess: StoredAmount,
    holding: StoredAmount,
    byType: z.object({ fuel: StoredAmount, fare: StoredAmount }),
    needsClearing: z.boolean(),
  })
  .openapi('SettlementTotals')

export const SettlementListItemSchema = z
  .object({
    id: z.string().uuid(),
    agreementId: z.string().uuid(),
    paymentId: z.string().uuid(),
    ref: z.string(),
    /** In the script of the request's language. */
    docNo: z.string(),
    subject: z.string(),
    branchCode: z.string(),
    zoneKind: z.enum(['domestic', 'border', 'overseas']),
    currency: z.enum(['LAK', 'USD']),
    advance: StoredAmount,
    total: StoredAmount,
    remaining: StoredAmount,
    holderEid: z.string(),
    filedByEid: z.string(),
    caseKind: z.enum(CASE_KINDS).nullable(),
    travelFrom: z.string(),
    travelTo: z.string(),
    dueDate: z.string(),
    status: z.enum(SETTLEMENT_STATUSES),
    leaderEid: z.string().nullable(),
    lateReason: z.string().nullable(),
    submittedAt: IsoDateTime.nullable(),
    approvedAt: IsoDateTime.nullable(),
    exportedAt: IsoDateTime.nullable(),
    postedAt: IsoDateTime.nullable(),
    coreRef: z.string().nullable(),
    rvsNo: z.string().nullable(),
    clearingExportedAt: IsoDateTime.nullable(),
    clearedAt: IsoDateTime.nullable(),
    clearingCoreRef: z.string().nullable(),
    cancelledAt: IsoDateTime.nullable(),
    createdBy: z.string().uuid().nullable(),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
    version: z.number().int(),
  })
  .openapi('SettlementListItem')

export const SettlementBatchSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(['settlement', 'clearing']),
    branchCode: z.string(),
    fileName: z.string(),
    createdAt: IsoDateTime,
    cancelledAfterExportAt: IsoDateTime.nullable(),
  })
  .openapi('SettlementBatch')

export const SettlementSchema = SettlementListItemSchema.extend({
  holderName: z.string(),
  lines: z.array(SettlementLineSchema),
  totals: SettlementTotalsSchema,
  /** Who may take approval step 2: the leader and deputies, less the filer (spec §10). Empty: step 2 is skipped. */
  candidates: z.array(z.object({ eid: z.string(), name: z.string() })),
  /** Today is past the due date: submitting needs a reason (ກ20). */
  isLate: z.boolean(),
  batches: z.array(SettlementBatchSchema),
}).openapi('Settlement')

export const BatchFileParams = z.object({
  id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' } }),
  kind: z.enum(['settlement', 'clearing']).openapi({ param: { name: 'kind', in: 'path' } }),
})

export const SettlementLookupQuery = z.object({ number: z.string().trim().min(1).max(40) })

export const SettlementLookupSchema = z
  .object({
    agreementId: z.string().uuid(),
    settlementId: z.string().uuid().nullable(),
    /** The caller is a member and the agreement's advance is paid, with no live settlement yet. */
    canFile: z.boolean(),
  })
  .openapi('SettlementLookup')

export const SettlementVersionSchema = z.object({ version: z.number().int().min(1) }).openapi('SettlementVersion')

export const SettlementSubmitSchema = z
  .object({
    version: z.number().int().min(1),
    leaderEid: Eid.optional(),
    lateReason: z.string().trim().min(1).max(500).optional(),
    workflow: z.string().optional(),
  })
  .openapi('SettlementSubmit')

export const SettlementPostedSchema = z
  .object({
    version: z.number().int().min(1),
    coreRef: z.string().trim().max(50).optional(),
    /** CORE's suspense number of the holding entry; required when the settlement needs clearing (ກ25). */
    rvsNo: z.string().trim().min(1).max(30).optional(),
  })
  .openapi('SettlementPosted')

export const ClearingPostedSchema = z
  .object({ version: z.number().int().min(1), coreRef: z.string().trim().max(50).optional() })
  .openapi('ClearingPosted')

/** List filters and sort (`settlements` as `s`, its agreement as `a`). */
export const settlementFields: FieldMap = {
  ref: { type: 'string', column: 'a.ref', sortable: true, searchable: true },
  docNo: { type: 'string', column: 'a.docNo', sortable: true, searchable: true },
  subject: { type: 'string', column: 'a.subject', searchable: true },
  agreementId: { type: 'uuid', column: 's.agreementId' },
  status: { type: 'enum', column: 's.status', values: SETTLEMENT_STATUSES },
  branchCode: { type: 'string', column: 's.branchCode' },
  filedByEid: { type: 'string', column: 's.filedByEid' },
  dueDate: { type: 'date', column: 's.dueDate', sortable: true },
  createdAt: { type: 'datetime', column: 's.createdAt', sortable: true },
  updatedAt: { type: 'datetime', column: 's.updatedAt', sortable: true },
}
