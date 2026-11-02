import { APPROVAL, defineApprovalEntity, type ApproverResolver } from '@elvine-sk/platform-approval'
import { getAudit } from '@elvine-sk/platform-audit'
import { AppError, type FieldMap } from '@elvine-sk/platform-core'
import { currentDb, inTransaction, sql, updateVersioned, uuidBin, writeHistory } from '@elvine-sk/platform-db'
import { NOTIFICATIONS } from '@elvine-sk/platform-notifications'
import { z, type ModuleContext } from '@elvine-sk/platform-server'
import { todayHrm } from '../../shared/dates.ts'
import { branchRoleUsers } from '../agreements/approval.ts'
import { membersOf } from '../agreements/queries.ts'
import { HEAD_OFFICE_BRANCH } from '../agreements/types.ts'
import { linkedUserId } from '../auth-hrm/users.ts'
import { groupAmount } from '../travel-master/money.ts'
import { settlementHistory, transition } from './procedures.ts'
import { assertLinesValid, candidatesOf, findSettlement, linesOf, notDraft, totalsOfRow } from './queries.ts'
import { maySeeSettlement } from './scope.ts'

/** Steps 2–5 of ກ19 (step 1, a member, is the submission). At a branch, office–IT holds the finance roles (§12). */
export const settlementResolvers: Record<string, ApproverResolver> = {
  'settlement.leader': async ({ facts }) => {
    const userId = facts.leaderEid ? await linkedUserId(String(facts.leaderEid)) : null
    return userId ? [userId] : []
  },
  'settlement.finance_officer': async ({ facts }) => branchRoleUsers('finance_officer', String(facts.branchCode)),
  'settlement.finance_section_head': async ({ facts }) =>
    branchRoleUsers('finance_section_head', String(facts.branchCode)),
  'settlement.final': async ({ facts }) =>
    facts.headOffice
      ? branchRoleUsers('finance_department_head', HEAD_OFFICE_BRANCH)
      : branchRoleUsers('management', String(facts.branchCode)),
}

const factFields: FieldMap = {
  branchCode: { type: 'string' },
  headOffice: { type: 'boolean' },
  hasLeaderStep: { type: 'boolean' },
}

const unprocessable = (code: string, message: string, path?: string) =>
  new AppError(code, message, { status: 422, details: path ? [{ path, code, message }] : undefined })

/**
 * What a submission needs (spec §10): a case that matches the totals, lines unless nothing was used, every line
 * still valid (a receipt may have been deleted since), and a reason when late. Throws 422.
 */
export async function assertSubmittable(id: string): Promise<void> {
  const row = await findSettlement(id)
  if (!row) throw AppError.notFound()
  const lines = await linesOf(id)
  await assertLinesValid(row, lines)
  const totals = totalsOfRow(row, lines)
  if (!row.caseKind) throw unprocessable('settlements.case_required', 'Choose the case of the settlement', 'caseKind')
  if (row.caseKind !== totals.caseKind)
    throw unprocessable('settlements.case_mismatch', `The totals make this case "${totals.caseKind}"`, 'caseKind')
  if (todayHrm() > row.dueDate && !row.lateReason)
    throw unprocessable('settlements.late_reason_required', 'The settlement is late: give the reason', 'lateReason')
}

/**
 * Step 2 and lateness of a submission by `submitterEid` (spec §10, §17 assumption 1): the leader or a deputy, not the
 * submitter, who has an account in the app; none when the submitter is the only leader or deputy. Stores them with
 * the submitter as filer, then submits (or resubmits a returned request), in one transaction.
 */
export async function submitSettlement(
  ctx: ModuleContext,
  id: string,
  input: { version: number; leaderEid?: string; lateReason?: string; workflow?: string },
  submitter: { userId: string; eid: string },
): Promise<void> {
  await inTransaction(async () => {
    const row = await findSettlement(id)
    if (!row) throw AppError.notFound()
    if (row.status !== 'draft') throw notDraft()
    const members = await membersOf(row.agreementId)
    const candidates = candidatesOf(members, submitter.eid)
    const leaderEid = input.leaderEid ?? null
    if (leaderEid !== null) {
      if (leaderEid === submitter.eid)
        throw unprocessable('settlements.own_eid', 'Step 2 is taken by someone other than you', 'leaderEid')
      if (!candidates.some((m) => m.eid === leaderEid))
        throw unprocessable('settlements.not_leader', 'Not the leader or a deputy of this agreement', 'leaderEid')
      if (!(await linkedUserId(leaderEid)))
        throw unprocessable(
          'settlements.leader_no_account',
          'This leader or deputy has not signed in to the app yet, so the step cannot reach them',
          'leaderEid',
        )
    } else if (candidates.length)
      throw unprocessable('settlements.leader_required', 'Choose the leader or deputy who checks it', 'leaderEid')

    const lateReason = input.lateReason ?? row.lateReason
    const next = await updateVersioned(
      'settlements',
      id,
      input.version,
      { leaderEid, lateReason, filedByEid: submitter.eid },
      { softDelete: false },
    )
    await writeHistory(settlementHistory, {
      entityId: id,
      version: next,
      action: 'update',
      before: { leaderEid: row.leaderEid, lateReason: row.lateReason },
      after: { leaderEid, lateReason },
    })
    const approval = ctx.services.get(APPROVAL)
    const open = await approval.openRequestOf('settlement', id)
    if (open?.status === 'returned' && (await submittedBy(open.id, submitter.userId)))
      await approval.resubmit(open.id, submitter.userId)
    else {
      // Any member may file (ກ13), but the platform lets only the requester resubmit: another member closes the
      // returned request and starts a new one.
      if (open?.status === 'returned')
        await approval.cancel(open.id, submitter.userId, 'Submitted again by another member of the trip', true)
      await approval.submit('settlement', id, submitter.userId, { workflow: input.workflow })
    }
    if (todayHrm() > row.dueDate)
      await getAudit(ctx).record({
        action: 'settlements.submitted_late',
        targetType: 'settlement',
        targetId: id,
        details: { ref: row.ref, dueDate: row.dueDate, lateReason },
      })
  })
}

/** Whether `userId` submitted the approval request (the platform's own table; it exposes no reader for it). */
async function submittedBy(requestId: string, userId: string): Promise<boolean> {
  const { rows } = await sql<{ id: string }>`SELECT id FROM approval_requests
    WHERE id = ${uuidBin(requestId)} AND submitted_by = ${uuidBin(userId)}`.execute(currentDb())
  return rows.length > 0
}

/** "Approve an advance settlement": statuses follow the request (spec §10). */
export const settlementApproval = (ctx: () => ModuleContext) =>
  defineApprovalEntity({
    type: 'settlement',
    // `ref`, `total` and `leaderEid` are for the approver to read (the request page lists the facts).
    facts: z.object({
      ref: z.string(),
      total: z.string(),
      branchCode: z.string(),
      headOffice: z.boolean(),
      hasLeaderStep: z.boolean(),
      leaderEid: z.string(),
    }),
    fields: factFields,
    display: { label: 'settlements.entity', icon: 'i-lucide-receipt', link: '/settlements/:id' },
    async loadFacts(id) {
      const row = await findSettlement(id)
      if (!row) throw new Error(`settlement ${id} not found`)
      return {
        ref: row.ref,
        total: `${groupAmount(row.total)} ${row.currency}`,
        branchCode: row.branchCode,
        headOffice: row.branchCode === HEAD_OFFICE_BRANCH,
        hasLeaderStep: row.leaderEid !== null,
        leaderEid: row.leaderEid ?? '',
      }
    },
    async canView(c, id) {
      const row = await findSettlement(id)
      return row ? maySeeSettlement(ctx(), c, row) : false
    },
    async onStatusChange(id, status) {
      const row = await findSettlement(id)
      if (!row) return
      const notify = ctx().services.get(NOTIFICATIONS)
      if (status === 'pending') {
        // Submitted or resubmitted: the checks run here, so every way in gets them.
        if (row.status !== 'draft') return
        await assertSubmittable(id)
        await transition(id, row.version, 'in_approval')
        return
      }
      if (row.status !== 'in_approval') return
      if (status === 'approved') {
        await transition(id, row.version, 'approved')
        await notify.notify({
          userIds: await branchRoleUsers('finance_officer', row.branchCode),
          type: 'settlements.approved',
          params: { ref: row.ref },
          link: `/settlements/${id}`,
          subject: { type: 'settlement', id },
        })
        return
      }
      // Returned, rejected or withdrawn: back to draft, for the members to correct and submit again.
      await transition(id, row.version, 'draft')
      const filer = await linkedUserId(row.filedByEid)
      if (filer)
        await notify.notify({
          userIds: [filer],
          type: 'settlements.returned',
          params: { ref: row.ref },
          link: `/settlements/${id}`,
          subject: { type: 'settlement', id },
        })
    },
  })
