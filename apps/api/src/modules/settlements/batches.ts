import { APPROVAL } from '@elvine-sk/platform-approval'
import { getAudit } from '@elvine-sk/platform-audit'
import { AppError, now, uuidv7 } from '@elvine-sk/platform-core'
import { inTransaction, uuidBin } from '@elvine-sk/platform-db'
import { NOTIFICATIONS } from '@elvine-sk/platform-notifications'
import type { ModuleContext } from '@elvine-sk/platform-server'
import { appDb } from '../../shared/db.ts'
import { branchRoleUsers } from '../agreements/approval.ts'
import { membersOf } from '../agreements/queries.ts'
import { agreementRemark, createBatch, postingMember } from '../payments/batches.ts'
import { xlsxWriter } from '../payments/xlsx.ts'
import { postingEntries } from '../travel-master/lookups.ts'
import { buildClearingLines, buildSettlementLines } from './posting.ts'
import { transition } from './procedures.ts'
import { findSettlement, linesOf, liveSettlementOf, totalsOfRow, type SettlementRow } from './queries.ts'

export const badTransition = () =>
  new AppError('settlements.bad_transition', 'The settlement cannot move to this status from its current one', {
    status: 409,
  })

const unprocessable = (code: string, message: string, path: string) =>
  new AppError(code, message, { status: 422, details: [{ path, code, message }] })

/** The settlement's batch of `kind` (`settlement` or `clearing`), if it was exported. */
export async function batchOfKind(settlementId: string, kind: 'settlement' | 'clearing') {
  const row = await appDb()
    .selectFrom('postingBatches')
    .select(['id', 'branchCode', 'fileName'])
    .where('sourceId', '=', uuidBin(settlementId))
    .where('kind', '=', kind)
    .executeTakeFirst()
  return row ?? null
}

async function loadForPosting(id: string): Promise<{ row: SettlementRow; needsClearing: boolean; holding: string }> {
  const row = await findSettlement(id)
  if (!row) throw AppError.notFound()
  const totals = totalsOfRow(row, await linesOf(id))
  return { row, needsClearing: totals.needsClearing, holding: totals.holding }
}

/**
 * The upload file of an approved settlement (spec §11, plan 5 working answers): its lines become the agreement's
 * settlement batch with GL accounts of `branch` (the exporting Finance user's), and the settlement moves to
 * `exported`, in one transaction. Returns the batch's id and its number of lines.
 */
export async function exportSettlement(
  id: string,
  version: number,
  branch: string,
): Promise<{ batchId: string; lines: number }> {
  const batchId = uuidv7()
  return inTransaction(async () => {
    const row = await findSettlement(id)
    if (!row) throw AppError.notFound()
    // Checked first, so exporting again creates nothing and answers like the transition would.
    if (row.status !== 'approved') throw badTransition()
    const members = await membersOf(row.agreementId)
    const holder = members.find((m) => m.eid === row.holderEid)
    if (!holder) throw new Error(`settlement ${id}: the advance holder ${row.holderEid} is not a member`)
    const [entries, remark, stored] = await Promise.all([
      postingEntries('settlement', row.zoneKind),
      agreementRemark(row.agreementId, members),
      linesOf(id),
    ])
    const lines = buildSettlementLines({
      zoneKind: row.zoneKind,
      currency: row.currency,
      totals: totalsOfRow(row, stored),
      holder: postingMember(holder),
      entries,
      branch,
      remark,
    })
    await createBatch({
      id: batchId,
      agreementId: row.agreementId,
      kind: 'settlement',
      sourceId: id,
      branch,
      fileName: `${row.ref}-settlement.${xlsxWriter.extension}`,
      lines,
    })
    await transition(id, version, 'exported')
    return { batchId, lines: lines.length }
  })
}

/**
 * Finance posted the settlement file in CORE. A settlement that passes through the holding account needs CORE's
 * suspense number of that entry (`RVS_NO`, ກ25) for its clearing file; any other refuses one.
 */
export async function markPosted(
  id: string,
  version: number,
  refs: { coreRef?: string; rvsNo?: string },
): Promise<SettlementRow> {
  return inTransaction(async () => {
    const { row, needsClearing } = await loadForPosting(id)
    if (row.status !== 'exported') throw badTransition()
    if (needsClearing && !refs.rvsNo)
      throw unprocessable('settlements.rvs_no_required', "Type CORE's suspense number of the holding entry", 'rvsNo')
    if (!needsClearing && refs.rvsNo)
      throw unprocessable('settlements.rvs_no_not_allowed', 'This settlement does not pass through the holding account', 'rvsNo')
    await transition(id, version, 'posted', { coreRef: refs.coreRef ?? null, rvsNo: refs.rvsNo ?? null })
    return row
  })
}

/**
 * The clearing file of a posted overseas settlement: the holding account back to the advance account, with the
 * suspense number, on the branch of the settlement file. Moves the settlement to `clearing_exported`.
 */
export async function exportClearing(id: string, version: number): Promise<{ batchId: string; lines: number }> {
  const batchId = uuidv7()
  return inTransaction(async () => {
    const { row, needsClearing, holding } = await loadForPosting(id)
    if (!needsClearing)
      throw new AppError('settlements.no_clearing', 'This settlement does not pass through the holding account', {
        status: 409,
      })
    if (row.status !== 'posted') throw badTransition()
    const first = await batchOfKind(id, 'settlement')
    if (!first || !row.rvsNo) throw new Error(`settlement ${id} is posted without its batch or suspense number`)
    const members = await membersOf(row.agreementId)
    const lines = buildClearingLines({
      currency: row.currency,
      holding,
      entries: await postingEntries('clearing', row.zoneKind),
      branch: first.branchCode,
      remark: await agreementRemark(row.agreementId, members),
      rvsNo: row.rvsNo,
    })
    await createBatch({
      id: batchId,
      agreementId: row.agreementId,
      kind: 'clearing',
      sourceId: id,
      branch: first.branchCode,
      fileName: `${row.ref}-clearing.${xlsxWriter.extension}`,
      lines,
    })
    await transition(id, version, 'clearing_exported')
    return { batchId, lines: lines.length }
  })
}


/**
 * The agreement was cancelled (spec §8, ກ16). Before export the settlement is void and its approval request is
 * cancelled; after export its files stay as they are (no reversal file), the settlement and its batches are marked
 * and Finance of its branch is told. A settlement already void or cancelled after export is left alone.
 */
export async function cancelSettlementOf(ctx: ModuleContext, agreementId: string, reason: string): Promise<void> {
  const id = await liveSettlementOf(agreementId)
  if (!id) return
  const row = await findSettlement(id)
  if (!row || row.status === 'void' || row.status === 'cancelled_after_export') return
  if (row.status === 'draft' || row.status === 'in_approval' || row.status === 'approved') {
    // Void first, so the request's own "cancelled" status change finds nothing to move.
    await transition(id, row.version, 'void')
    await ctx.services.get(APPROVAL).cancelForEntity('settlement', id)
    return
  }
  await transition(id, row.version, 'cancelled_after_export')
  await appDb()
    .updateTable('postingBatches')
    .set({ cancelledAfterExportAt: now() })
    .where('sourceId', '=', uuidBin(id))
    .where('kind', 'in', ['settlement', 'clearing'])
    .execute()
  await getAudit(ctx).record({
    action: 'settlements.cancelled_after_export',
    targetType: 'settlement',
    targetId: id,
    details: { ref: row.ref, from: row.status, reason },
  })
  await ctx.services.get(NOTIFICATIONS).notify({
    userIds: await branchRoleUsers('finance_officer', row.branchCode),
    type: 'settlements.cancelled_after_export',
    params: { ref: row.ref, reason },
    link: `/settlements/${id}`,
    subject: { type: 'settlement', id },
  })
}
