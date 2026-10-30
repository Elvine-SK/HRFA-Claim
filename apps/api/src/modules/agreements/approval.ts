import { defineApprovalEntity, type ApproverResolver } from '@elvine-sk/platform-approval'
import type { FieldMap } from '@elvine-sk/platform-core'
import { NOTIFICATIONS } from '@elvine-sk/platform-notifications'
import { z, type ModuleContext } from '@elvine-sk/platform-server'
import { selectableEmployees } from '../hrm/employees.ts'
import { appDb } from '../../shared/db.ts'
import { transition } from './procedures.ts'
import { findAgreement, prepareSubmission } from './queries.ts'
import { mayReadAgreement } from './routes.ts'
import { HEAD_OFFICE_BRANCH } from './types.ts'

/**
 * Active users holding `roleKey` (directly or through a group) whose HRM branch is `branch`: approval steps and
 * notifications are scoped to the agreement's branch (spec §8, §12).
 */
export async function branchRoleUsers(roleKey: string, branch: string): Promise<string[]> {
  const direct = appDb()
    .selectFrom('userRoles as ur')
    .innerJoin('roles as r', 'r.id', 'ur.roleId')
    .select('ur.userId as userId')
    .where('r.key', '=', roleKey)
  const viaGroup = appDb()
    .selectFrom('groupMembers as gm')
    .innerJoin('groupRoles as gr', 'gr.groupId', 'gm.groupId')
    .innerJoin('roles as r', 'r.id', 'gr.roleId')
    .select('gm.userId as userId')
    .where('r.key', '=', roleKey)
  const holders = await appDb()
    .selectFrom(direct.union(viaGroup).as('h'))
    .innerJoin('hrmUserLinks as l', 'l.userId', 'h.userId')
    .innerJoin('users as u', 'u.id', 'h.userId')
    .select(['l.eid', 'l.userId'])
    .where('u.status', '=', 'active')
    .where('u.deletedAt', 'is', null)
    .execute()
  if (!holders.length) return []
  const inBranch = await selectableEmployees()
    .select('hrmEmployee.eid')
    .where(
      'hrmEmployee.eid',
      'in',
      holders.map((h) => h.eid),
    )
    .where('hrmEmployee.branchCode', '=', branch)
    .execute()
  const eids = new Set(inBranch.map((e) => e.eid))
  return [...new Set(holders.filter((h) => eids.has(h.eid)).map((h) => h.userId))]
}

/** Approval steps 2–4 of spec §8 (step 1, the preparing officer, is the submission). */
export const AGREEMENT_RESOLVERS: Record<string, string> = {
  'agreement.section_head': 'hr_section_head',
  'agreement.department_head': 'hr_department_head',
  'agreement.management': 'management',
}

export const agreementResolvers: Record<string, ApproverResolver> = Object.fromEntries(
  Object.entries(AGREEMENT_RESOLVERS).map(([name, role]) => [
    name,
    async ({ facts }) => branchRoleUsers(role, String(facts.branchCode)),
  ]),
)

const factFields: FieldMap = {
  branchCode: { type: 'string' },
  formType: { type: 'string' },
  hasAdvance: { type: 'boolean' },
  headOffice: { type: 'boolean' },
}

/** "Approve a travel agreement": statuses follow the request (spec §8). */
export const agreementApproval = (ctx: () => ModuleContext) =>
  defineApprovalEntity({
    type: 'agreement',
    // `ref` and `subject` are for the approver to read (the request page lists the facts); conditions use the rest.
    facts: z.object({
      ref: z.string(),
      subject: z.string(),
      branchCode: z.string(),
      formType: z.string(),
      hasAdvance: z.boolean(),
      headOffice: z.boolean(),
    }),
    fields: factFields,
    display: { label: 'agreements.entity', icon: 'i-lucide-plane', link: '/agreements/:id' },
    async loadFacts(id) {
      const row = await findAgreement(id)
      if (!row) throw new Error(`agreement ${id} not found`)
      return {
        ref: row.ref,
        subject: row.subject,
        branchCode: row.branchCode,
        formType: row.formType,
        hasAdvance: row.hasAdvance,
        headOffice: row.branchCode === HEAD_OFFICE_BRANCH,
      }
    },
    async canView(c, id) {
      const row = await findAgreement(id)
      return row ? mayReadAgreement(ctx(), c, row) : false
    },
    async onStatusChange(id, status) {
      const row = await findAgreement(id)
      if (!row || row.status === 'cancelled') return
      if (status === 'pending') {
        // Submitted or resubmitted: the checks and the HRM snapshot run here, so every way in gets them.
        if (row.status !== 'draft') return
        await prepareSubmission(id)
        await transition(id, row.version, 'in_approval')
        return
      }
      if (status === 'approved' && row.status === 'in_approval') {
        await transition(id, row.version, 'approved')
        const finance = await branchRoleUsers('finance_officer', row.branchCode)
        await ctx()
          .services.get(NOTIFICATIONS)
          .notify({
            userIds: finance,
            type: 'agreements.approved',
            params: { ref: row.ref },
            link: `/agreements/${id}`,
            subject: { type: 'agreement', id },
          })
        return
      }
      // Returned, rejected or withdrawn: back to draft, to be corrected and submitted again.
      if (row.status === 'in_approval') await transition(id, row.version, 'draft')
    },
  })
