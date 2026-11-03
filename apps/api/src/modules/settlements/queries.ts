import { AppError, uuidv7, type FieldError } from '@elvine-sk/platform-core'
import { createdStamp, inTransaction, updateVersioned, uuidBin, writeHistory } from '@elvine-sk/platform-db'
import { toIso } from '@elvine-sk/platform-server'
import { addDays, addWorkingDays, latestReturnFor, todayHrm } from '../../shared/dates.ts'
import { appDb, type SettlementLinesTable, type SettlementsTable } from '../../shared/db.ts'
import { formatDocNo, parseDocNo } from '../agreements/doc-no.ts'
import { membersOf, type MemberRow } from '../agreements/queries.ts'
import { holidaysBetween } from '../hrm/holidays.ts'
import { itemsOf, livePaymentOf, findPayment } from '../payments/queries.ts'
import { zoneOf, type Currency, type ZoneCode, type ZoneKind } from '../travel-master/lookups.ts'
import { toCents, type Amount } from '../travel-master/money.ts'
import { settlementHistory } from './procedures.ts'
import type { SettlementLineInputSchema } from './schema.ts'
import { LineError, settledAmountOf, totalsOf, type Totals } from './totals.ts'
import type { CaseKind, ExpenseType, SettlementStatus } from './types.ts'
import type { z } from '@elvine-sk/platform-server'

/** Working days after the return date by which the settlement is due (ກ20). */
export const DUE_WORKING_DAYS = 5

const SETTLEMENT_COLUMNS = [
  's.id',
  's.agreementId',
  's.paymentId',
  'a.ref',
  'a.docNo',
  'a.subject',
  's.branchCode',
  's.zoneKind',
  's.currency',
  's.advance',
  's.total',
  's.remaining',
  's.holderEid',
  's.filedByEid',
  's.caseKind',
  'a.travelFrom',
  'a.travelTo',
  's.dueDate',
  's.status',
  's.leaderEid',
  's.lateReason',
  's.submittedAt',
  's.approvedAt',
  's.exportedAt',
  's.postedAt',
  's.coreRef',
  's.rvsNo',
  's.clearingExportedAt',
  's.clearedAt',
  's.clearingCoreRef',
  's.cancelledAt',
  's.createdBy',
  's.createdAt',
  's.updatedAt',
  's.version',
] as const

export type SettlementRow = Omit<SettlementsTable, 'status' | 'total' | 'version' | 'updatedBy' | 'agreementLive'> & {
  status: SettlementStatus
  total: Amount
  version: number
  ref: string
  docNo: string
  subject: string
  travelFrom: string
  travelTo: string
}
export type LineRow = Omit<SettlementLinesTable, 'settlementId' | 'sortOrder'>
export type LineInput = z.infer<typeof SettlementLineInputSchema>

/** Settlements with their agreement's header (`s`, `a`), before scope. */
export const settlementRows = () =>
  appDb()
    .selectFrom('settlements as s')
    .innerJoin('agreements as a', 'a.id', 's.agreementId')
    .select(SETTLEMENT_COLUMNS)

export async function findSettlement(id: string): Promise<SettlementRow | null> {
  const row = await settlementRows().where('s.id', '=', uuidBin(id)).executeTakeFirst()
  return (row as SettlementRow | undefined) ?? null
}

/** The agreement's settlement that is not void, if any. */
export async function liveSettlementOf(agreementId: string): Promise<string | null> {
  const row = await appDb()
    .selectFrom('settlements')
    .select('id')
    .where('agreementId', '=', uuidBin(agreementId))
    .where('status', '<>', 'void')
    .executeTakeFirst()
  return row?.id ?? null
}

export async function linesOf(settlementId: string): Promise<LineRow[]> {
  return appDb()
    .selectFrom('settlementLines')
    .select([
      'id',
      'description',
      'expenseType',
      'currency',
      'amount',
      'crossRate',
      'settledAmount',
      'receiptFileId',
      'noReceiptReason',
      'rateProofFileId',
    ])
    .where('settlementId', '=', uuidBin(settlementId))
    .orderBy('sortOrder')
    .execute()
}

/** The totals of stored lines. */
export function totalsOfRow(row: { advance: Amount; zoneKind: ZoneKind }, lines: LineRow[]): Totals {
  return totalsOf({ advance: row.advance, zoneKind: row.zoneKind, lines })
}

const conflict = (code: string, message: string) => new AppError(code, message, { status: 409 })

/** The due date of a trip returning on `travelTo`: the 5th working day after it (spec §10, ກ20). */
export async function dueDateOf(travelTo: string): Promise<string> {
  // Five working days fit in 60 calendar days whatever HRM's holidays are.
  const until = addWorkingDays(travelTo, 60, new Set())
  return addWorkingDays(travelTo, DUE_WORKING_DAYS, await holidaysBetween(travelTo, until))
}

/** The latest return date that is overdue `today`: the overdue list and the reminders cut on it in SQL. */
export async function overdueCutoff(today = todayHrm()): Promise<string> {
  const holidays = await holidaysBetween(addDays(today, -60), today)
  return latestReturnFor(today, DUE_WORKING_DAYS, holidays)
}

/**
 * What a settlement of the agreement starts from: the agreement has an advance and its live payment is exported or
 * posted (the advance was paid). Throws 409 otherwise.
 */
async function advanceOf(agreementId: string) {
  const agreement = await appDb()
    .selectFrom('agreements')
    .select(['hasAdvance', 'branchCode', 'zoneCode', 'travelTo'])
    .where('id', '=', uuidBin(agreementId))
    .forUpdate()
    .executeTakeFirst()
  if (!agreement) throw AppError.notFound()
  if (!agreement.hasAdvance) throw conflict('settlements.no_advance', 'This agreement has no advance to settle')
  const paymentId = await livePaymentOf(agreementId)
  const payment = paymentId ? await findPayment(paymentId) : null
  if (!payment || (payment.status !== 'exported' && payment.status !== 'posted'))
    throw conflict('settlements.advance_not_paid', 'The advance is not paid yet: its payment has no upload file')
  const advance = (await itemsOf(payment.id)).find((it) => it.component === 'advance')
  if (!advance || !agreement.zoneCode)
    throw conflict('settlements.advance_not_paid', 'The payment of this agreement has no advance')
  const zone = await zoneOf(agreement.zoneCode as ZoneCode)
  return { agreement, payment, advance, zoneKind: zone.kind }
}

/** Whether a member may file a settlement of the agreement now (for the lookup). */
export async function canFile(agreementId: string): Promise<boolean> {
  if (await liveSettlementOf(agreementId)) return false
  try {
    await advanceOf(agreementId)
    return true
  } catch (err) {
    if (err instanceof AppError && err.status === 409) return false
    throw err
  }
}

/** A new draft settlement of the agreement's advance, filed by the member `filerEid` (spec §10). */
export async function createSettlement(agreementId: string, filerEid: string): Promise<string> {
  const id = uuidv7()
  return inTransaction(async () => {
    // The agreement's row lock (in `advanceOf`) serialises two members filing at once.
    const { agreement, payment, advance, zoneKind } = await advanceOf(agreementId)
    if (await liveSettlementOf(agreementId))
      throw conflict('settlements.exists', 'This agreement already has a settlement that is not void')
    const dueDate = await dueDateOf(agreement.travelTo)
    await appDb()
      .insertInto('settlements')
      .values({
        ...createdStamp(id),
        agreementId: uuidBin(agreementId),
        paymentId: uuidBin(payment.id),
        branchCode: agreement.branchCode,
        zoneKind,
        currency: advance.currency as Currency,
        advance: advance.amount,
        holderEid: advance.eid,
        filedByEid: filerEid,
        remaining: advance.amount,
        dueDate,
      })
      .execute()
    await writeHistory(settlementHistory, {
      entityId: id,
      version: 1,
      action: 'create',
      after: { agreementId, status: 'draft', caseKind: null, total: '0.00', lines: '' },
    })
    return id
  })
}

export const notDraft = () => conflict('settlements.not_draft', 'Only a draft settlement can be changed')

const invalid = (path: string, code: string, message: string): FieldError => ({ path, code, message })

const linesLine = (lines: { description: string; settledAmount: Amount }[], currency: string) =>
  lines.map((l) => `${l.description} ${l.settledAmount} ${currency}`).join('; ')

/** Ids of the files attached to the settlement and not deleted. */
async function filesOf(settlementId: string): Promise<Set<string>> {
  const rows = await appDb()
    .selectFrom('files')
    .select('id')
    .where('entityType', '=', 'settlement')
    .where('entityId', '=', uuidBin(settlementId))
    .where('deletedAt', 'is', null)
    .execute()
  return new Set(rows.map((r) => r.id))
}

/**
 * Checks the lines against the settlement (Global Constraints of plan 5) and returns them with their settled
 * amounts; every problem is a field error at `lines.<n>.<field>`.
 */
async function checkLines(
  row: { id: string; zoneKind: ZoneKind; currency: Currency },
  input: LineInput[],
): Promise<Omit<LineRow, 'id'>[]> {
  const files = await filesOf(row.id)
  const errors: FieldError[] = []
  const out: Omit<LineRow, 'id'>[] = []
  input.forEach((line, n) => {
    const at = (field: string) => `lines.${n}.${field}`
    const overseas = row.zoneKind === 'overseas'
    if (!overseas && !line.expenseType)
      errors.push(invalid(at('expenseType'), 'settlements.expense_type_required', 'Choose fuel or fare'))
    if (overseas && line.expenseType)
      errors.push(invalid(at('expenseType'), 'settlements.expense_type_not_allowed', 'Overseas lines have no expense type'))
    if (toCents(line.amount) === 0n)
      errors.push(invalid(at('amount'), 'settlements.amount_invalid', 'Enter an amount above zero'))
    const zeroRate = line.crossRate !== undefined && !/[1-9]/.test(line.crossRate)
    if (zeroRate) errors.push(invalid(at('crossRate'), 'settlements.cross_rate_invalid', 'Enter a cross rate above zero'))
    let settledAmount: Amount = '0.00'
    if (!zeroRate) {
      try {
        settledAmount = settledAmountOf(
          { currency: line.currency, amount: line.amount, crossRate: line.crossRate ?? null, expenseType: line.expenseType ?? null },
          row.currency,
        )
      } catch (err) {
        if (!(err instanceof LineError)) throw err
        errors.push(invalid(at(err.path), err.code, err.message))
      }
    }
    if (!line.receiptFileId && !line.noReceiptReason)
      errors.push(invalid(at('receiptFileId'), 'settlements.receipt_required', 'Attach the receipt or say why there is none'))
    if (line.crossRate && line.currency !== row.currency && !line.rateProofFileId)
      errors.push(invalid(at('rateProofFileId'), 'settlements.rate_proof_required', 'Attach the proof of the cross rate'))
    for (const field of ['receiptFileId', 'rateProofFileId'] as const) {
      const fileId = line[field]
      if (fileId && !files.has(fileId))
        errors.push(invalid(at(field), 'settlements.file_unknown', 'Not a file attached to this settlement'))
    }
    out.push({
      description: line.description,
      expenseType: (line.expenseType ?? null) as ExpenseType | null,
      currency: line.currency,
      amount: line.amount,
      crossRate: line.currency === row.currency ? null : (line.crossRate ?? null),
      settledAmount,
      receiptFileId: line.receiptFileId ?? null,
      noReceiptReason: line.noReceiptReason ?? null,
      rateProofFileId: line.rateProofFileId ?? null,
    })
  })
  if (errors.length) throw AppError.validation(errors)
  return out
}

/** The stored lines checked again, as at submission (a receipt may have been deleted since they were saved). */
export async function assertLinesValid(
  row: { id: string; zoneKind: ZoneKind; currency: Currency },
  lines: LineRow[],
): Promise<void> {
  await checkLines(
    row,
    lines.map((l) => ({
      description: l.description,
      expenseType: l.expenseType ?? undefined,
      currency: l.currency,
      amount: l.amount,
      crossRate: l.crossRate ?? undefined,
      receiptFileId: l.receiptFileId ?? undefined,
      noReceiptReason: l.noReceiptReason ?? undefined,
      rateProofFileId: l.rateProofFileId ?? undefined,
    })),
  )
}

/** The draft's case and lines replace the stored ones; optimistic locking on `version`. */
export async function saveDraft(
  id: string,
  version: number,
  input: { caseKind?: CaseKind | null; lines: LineInput[] },
): Promise<void> {
  await inTransaction(async () => {
    const before = await findSettlement(id)
    if (!before) throw AppError.notFound()
    if (before.status !== 'draft') throw notDraft()
    const lines = await checkLines(before, input.lines)
    const totals = totalsOf({ advance: before.advance, zoneKind: before.zoneKind, lines })
    const beforeLines = await linesOf(id)
    const caseKind = input.caseKind === undefined ? before.caseKind : input.caseKind
    const next = await updateVersioned(
      'settlements',
      id,
      version,
      { caseKind, total: totals.total, remaining: totals.remaining },
      { softDelete: false },
    )
    await appDb().deleteFrom('settlementLines').where('settlementId', '=', uuidBin(id)).execute()
    if (lines.length)
      await appDb()
        .insertInto('settlementLines')
        .values(
          lines.map((l, n) => ({
            ...l,
            id: uuidBin(uuidv7()),
            settlementId: uuidBin(id),
            sortOrder: n,
            receiptFileId: l.receiptFileId ? uuidBin(l.receiptFileId) : null,
            rateProofFileId: l.rateProofFileId ? uuidBin(l.rateProofFileId) : null,
          })),
        )
        .execute()
    await writeHistory(settlementHistory, {
      entityId: id,
      version: next,
      action: 'update',
      before: { caseKind: before.caseKind, total: before.total, lines: linesLine(beforeLines, before.currency) },
      after: { caseKind, total: totals.total, lines: linesLine(lines, before.currency) },
    })
  })
}

/** Who may take approval step 2: the leader and deputies, less the filer (spec §10, §17 assumption 1). */
export function candidatesOf(members: MemberRow[], filerEid: string): MemberRow[] {
  return members.filter((m) => (m.isLeader || m.isDeputy) && m.eid !== filerEid).sort((a, b) => Number(b.isLeader) - Number(a.isLeader))
}

export const memberName = (m: MemberRow) => `${m.nameLao} ${m.snameLao}`

// Presentation

const displayDocNo = (stored: string, lang: string) => {
  const d = parseDocNo(stored)
  return d ? formatDocNo(d, lang === 'lo' ? 'lo' : 'en') : stored
}

export function toListItem(row: SettlementRow, lang: string) {
  return {
    ...row,
    docNo: displayDocNo(row.docNo, lang),
    submittedAt: toIso(row.submittedAt),
    approvedAt: toIso(row.approvedAt),
    exportedAt: toIso(row.exportedAt),
    postedAt: toIso(row.postedAt),
    clearingExportedAt: toIso(row.clearingExportedAt),
    clearedAt: toIso(row.clearedAt),
    cancelledAt: toIso(row.cancelledAt),
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  }
}

/** The settlement's posting batches (the settlement file, then the clearing file). */
async function batchesOf(settlementId: string) {
  const rows = await appDb()
    .selectFrom('postingBatches')
    .select(['id', 'kind', 'branchCode', 'fileName', 'createdAt', 'cancelledAfterExportAt'])
    .where('sourceId', '=', uuidBin(settlementId))
    .where('kind', '<>', 'payment')
    .orderBy('createdAt')
    .execute()
  return rows.map((b) => ({
    ...b,
    kind: b.kind as 'settlement' | 'clearing',
    createdAt: toIso(b.createdAt)!,
    cancelledAfterExportAt: toIso(b.cancelledAfterExportAt),
  }))
}

/** The settlement as its form shows it: header, lines, totals, step 2 candidates, lateness and batches. */
export async function loadSettlement(id: string, lang: string) {
  const row = await findSettlement(id)
  if (!row) throw AppError.notFound()
  const [members, lines, batches] = await Promise.all([membersOf(row.agreementId), linesOf(id), batchesOf(id)])
  const holder = members.find((m) => m.eid === row.holderEid)
  return {
    ...toListItem(row, lang),
    holderName: holder ? memberName(holder) : row.holderEid,
    lines,
    totals: totalsOfRow(row, lines),
    candidates: candidatesOf(members, row.filedByEid).map((m) => ({ eid: m.eid, name: memberName(m) })),
    isLate: todayHrm() > row.dueDate,
    batches,
  }
}


/**
 * Agreements whose settlement is due and not submitted (`a` agreements, `p` payments, `m` the holder, `s` the live
 * settlement): an advance, its payment exported or posted, and no settlement or a draft one.
 */
export const dueAgreementRows = () =>
  appDb()
    .selectFrom('agreements as a')
    .innerJoin('payments as p', (j) => j.onRef('p.agreementId', '=', 'a.id').on('p.status', 'in', ['exported', 'posted']))
    .innerJoin('agreementMembers as m', (j) => j.onRef('m.agreementId', '=', 'a.id').on('m.isAdvanceHolder', '=', true))
    .leftJoin('settlements as s', (j) => j.onRef('s.agreementId', '=', 'a.id').on('s.status', '<>', 'void'))
    .select([
      'a.id as agreementId',
      'a.ref',
      'a.docNo',
      'a.travelTo',
      'a.branchCode',
      'm.eid as holderEid',
      'm.nameLao',
      'm.snameLao',
      's.id as settlementId',
    ])
    .where('a.hasAdvance', '=', true)
    .where((eb) => eb.or([eb('s.id', 'is', null), eb('s.status', '=', 'draft')]))

/** The overdue list's rows before scope: due agreements that returned on or before `cutoff` (`overdueCutoff`). */
export const overdueRows = (cutoff: string) => dueAgreementRows().where('a.travelTo', '<=', cutoff)

export interface OverdueRow {
  agreementId: string
  ref: string
  docNo: string
  travelTo: string
  branchCode: string
  holderEid: string
  nameLao: string
  snameLao: string
  settlementId: string | null
}

/** The overdue list's page (every row is overdue: the query cut on `overdueCutoff`), with each due date. */
export async function overdueOf(rows: OverdueRow[], lang: string) {
  if (!rows.length) return []
  const from = rows.reduce((m, r) => (r.travelTo < m ? r.travelTo : m), rows[0]!.travelTo)
  const until = rows.reduce((m, r) => (r.travelTo > m ? r.travelTo : m), rows[0]!.travelTo)
  const holidays = await holidaysBetween(from, addWorkingDays(until, 60, new Set()))
  return rows.map((r) => ({
    agreementId: r.agreementId,
    ref: r.ref,
    docNo: displayDocNo(r.docNo, lang),
    travelTo: r.travelTo,
    dueDate: addWorkingDays(r.travelTo, DUE_WORKING_DAYS, holidays),
    branchCode: r.branchCode,
    holderEid: r.holderEid,
    holderName: `${r.nameLao} ${r.snameLao}`,
    settlementId: r.settlementId,
  }))
}
