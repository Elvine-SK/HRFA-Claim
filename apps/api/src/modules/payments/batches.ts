import { APPROVAL } from '@elvine-sk/platform-approval'
import { getAudit } from '@elvine-sk/platform-audit'
import { NOTIFICATIONS } from '@elvine-sk/platform-notifications'
import type { ModuleContext } from '@elvine-sk/platform-server'
import { AppError, now, uuidv7 } from '@elvine-sk/platform-core'
import { callProcedure, getContext, inTransaction, uuidArg, uuidBin } from '@elvine-sk/platform-db'
import { daysInclusive } from '../../shared/dates.ts'
import { appDb } from '../../shared/db.ts'
import { branchRoleUsers } from '../agreements/approval.ts'
import { membersOf, type MemberRow } from '../agreements/queries.ts'
import { findProvince } from '../hrm/geography.ts'
import { countryByIso2, postingEntries, zoneOf, type ZoneCode } from '../travel-master/lookups.ts'
import type { PaymentItem } from './calculate.ts'
import { buildPaymentLines, paymentRemark, type PostingMember, type UploadLine } from './posting.ts'
import { transition } from './procedures.ts'
import { findPayment, itemsOf, livePaymentOf, type PaymentRow } from './queries.ts'
import type { Component } from './types.ts'
import { xlsxWriter } from './xlsx.ts'

export const BATCH_ERRORS = {
  'posting.batch_exists': 409,
  'posting.unbalanced': 422,
}

/**
 * A posting batch with its lines, through `posting_create_batch`: one per agreement and kind, refused when it
 * exists (409 `posting.batch_exists`) or when DR and CR differ in a currency (422 `posting.unbalanced`).
 */
export async function createBatch(input: {
  id: string
  agreementId: string
  kind: 'payment' | 'settlement'
  sourceId: string
  branch: string
  fileName: string
  lines: UploadLine[]
}): Promise<void> {
  const { actor } = getContext()
  await callProcedure(
    'posting_create_batch',
    [
      uuidArg(input.id),
      uuidArg(input.agreementId),
      input.kind,
      uuidArg(input.sourceId),
      input.branch,
      input.fileName,
      JSON.stringify(input.lines),
      uuidArg(actor.type === 'user' ? actor.id : null),
      now(),
    ],
    { errors: BATCH_ERRORS },
  )
}

export interface BatchRow {
  id: string
  agreementId: string
  kind: 'payment' | 'settlement'
  sourceId: string
  branchCode: string
  fileName: string
  /** The branch of the document posted (its agreement's), which decides who may read the batch. */
  documentBranch: string
  ref: string
}

export async function findBatch(id: string): Promise<BatchRow | null> {
  const row = await appDb()
    .selectFrom('postingBatches as b')
    .innerJoin('agreements as a', 'a.id', 'b.agreementId')
    .select(['b.id', 'b.agreementId', 'b.kind', 'b.sourceId', 'b.branchCode', 'b.fileName', 'a.branchCode as documentBranch', 'a.ref'])
    .where('b.id', '=', uuidBin(id))
    .executeTakeFirst()
  return row ?? null
}

/** The lines of a batch in file order. */
export async function linesOf(batchId: string): Promise<UploadLine[]> {
  const rows = await appDb()
    .selectFrom('postingLines')
    .select(['account', 'branch', 'name', 'ccy', 'chequeNo', 'amount', 'rvsNo', 'side', 'remark'])
    .where('batchId', '=', uuidBin(batchId))
    .orderBy('lineNo')
    .execute()
  return rows
}

/** `NAME_ENG SNAME_ENG` upper-case from the member's snapshot, else the Lao name. */
function postingMember(m: MemberRow): PostingMember {
  const eng = [m.nameEng, m.snameEng].filter(Boolean).join(' ').trim()
  return {
    eid: m.eid,
    name: eng ? eng.toUpperCase() : `${m.nameLao} ${m.snameLao}`,
    branchCode: m.branchCode,
    accountLak: m.accountLak,
    accountUsd: m.accountUsd,
  }
}

/** Where the trip goes, in Lao: the province (forms 1 and 2), the country (3) or the border route (4). */
async function placeLo(agreementId: string): Promise<string> {
  const a = await appDb()
    .selectFrom('agreements')
    .select(['formType', 'toProvinceCode', 'provinceCode', 'countryIso2', 'borderRouteId', 'borderRouteOther'])
    .where('id', '=', uuidBin(agreementId))
    .executeTakeFirstOrThrow()
  switch (a.formType) {
    case 'domestic':
    case 'district': {
      const code = (a.formType === 'domestic' ? a.toProvinceCode : a.provinceCode) ?? ''
      return (await findProvince(code))?.nameLo ?? code
    }
    case 'overseas':
      return (await countryByIso2(a.countryIso2 ?? ''))?.nameLo ?? a.countryIso2 ?? ''
    case 'border': {
      if (!a.borderRouteId) return a.borderRouteOther ?? ''
      const route = await appDb()
        .selectFrom('travelBorderRoutes')
        .select('nameLo')
        .where('id', '=', uuidBin(a.borderRouteId))
        .executeTakeFirst()
      return route?.nameLo ?? ''
    }
  }
}

/** The upload lines of a payment, with GL accounts of `branch` (the Finance user's HRM branch). */
async function paymentLines(row: PaymentRow, branch: string): Promise<UploadLine[]> {
  if (!row.zoneCode) throw new Error(`agreement ${row.agreementId} has no zone`)
  const zone = await zoneOf(row.zoneCode as ZoneCode)
  const [members, items, entries, place] = await Promise.all([
    membersOf(row.agreementId),
    itemsOf(row.id),
    postingEntries('payment', zone.kind),
    placeLo(row.agreementId),
  ])
  const leader = members.find((m) => m.isLeader)
  const remark = paymentRemark({
    zoneCode: zone.code,
    leaderName: leader ? `${leader.nameLao} ${leader.snameLao}` : '',
    days: daysInclusive(row.travelFrom, row.travelTo),
    placeLo: place,
    docNo: row.docNo,
    travelFrom: row.travelFrom,
    travelTo: row.travelTo,
    ref: row.ref,
  })
  return buildPaymentLines({
    items: items.map((it): PaymentItem => ({ ...it, component: it.component as Component })),
    entries,
    members: members.map(postingMember),
    branch,
    remark,
  })
}

export const badTransition = () =>
  new AppError('payments.bad_transition', 'The payment cannot move to this status from its current one', {
    status: 409,
  })

/**
 * The upload file of an approved payment (spec §11): its lines become the agreement's payment batch, and the
 * payment moves to `exported`, in one transaction. Returns the batch's id and its number of lines.
 */
export async function exportPayment(
  id: string,
  version: number,
  branch: string,
): Promise<{ batchId: string; lines: number }> {
  const batchId = uuidv7()
  return inTransaction(async () => {
    const row = await findPayment(id)
    if (!row) throw AppError.notFound()
    // Checked first, so exporting again creates nothing and answers like the transition would.
    if (row.status !== 'approved') throw badTransition()
    const lines = await paymentLines(row, branch)
    await createBatch({
      id: batchId,
      agreementId: row.agreementId,
      kind: 'payment',
      sourceId: id,
      branch,
      fileName: `${row.ref}-payment.${xlsxWriter.extension}`,
      lines,
    })
    await transition(id, version, 'exported')
    return { batchId, lines: lines.length }
  })
}

/**
 * The agreement was cancelled (spec §8, ກ16). Before export the payment is void and its approval request is
 * cancelled; after export the file stays as it is (no reversal file), the payment is marked and Finance of its
 * branch is told. A payment already void or cancelled after export is left alone.
 */
export async function cancelPaymentOf(
  ctx: ModuleContext,
  agreementId: string,
  reason: string,
): Promise<void> {
  const id = await livePaymentOf(agreementId)
  if (!id) return
  const row = await findPayment(id)
  if (!row || row.status === 'void' || row.status === 'cancelled_after_export') return
  if (row.status === 'exported' || row.status === 'posted') {
    await transition(id, row.version, 'cancelled_after_export')
    await appDb()
      .updateTable('postingBatches')
      .set({ cancelledAfterExportAt: now() })
      .where('sourceId', '=', uuidBin(id))
      .where('kind', '=', 'payment')
      .execute()
    await getAudit(ctx).record({
      action: 'payments.cancelled_after_export',
      targetType: 'payment',
      targetId: id,
      details: { ref: row.ref, from: row.status, reason },
    })
    await ctx.services.get(NOTIFICATIONS).notify({
      userIds: await branchRoleUsers('finance_officer', row.branchCode),
      type: 'payments.cancelled_after_export',
      params: { ref: row.ref, reason },
      link: `/payments/${id}`,
      subject: { type: 'payment', id },
    })
    return
  }
  // Void first, so the request's own "cancelled" status change finds nothing to move.
  await transition(id, row.version, 'void')
  await ctx.services.get(APPROVAL).cancelForEntity('payment', id)
}
