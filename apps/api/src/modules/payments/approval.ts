import { defineApprovalEntity, type ApproverResolver } from '@elvine-sk/platform-approval'
import type { FieldMap } from '@elvine-sk/platform-core'
import { NOTIFICATIONS } from '@elvine-sk/platform-notifications'
import { z, type ModuleContext } from '@elvine-sk/platform-server'
import { branchRoleUsers } from '../agreements/approval.ts'
import { HEAD_OFFICE_BRANCH } from '../agreements/types.ts'
import { groupAmount } from '../travel-master/money.ts'
import { transition } from './procedures.ts'
import { assertBillsComplete, assertSomethingToPay, findPayment, itemsOf, totalsOf } from './queries.ts'
import { mayReadPayment } from './scope.ts'

/** Approval step 2 of ກ18 (step 1, the finance officer, is the submission). */
export const paymentResolvers: Record<string, ApproverResolver> = {
  'payment.finance_section_head': async ({ facts }) => branchRoleUsers('finance_section_head', String(facts.branchCode)),
}

const factFields: FieldMap = {
  branchCode: { type: 'string' },
  headOffice: { type: 'boolean' },
}

/** "Approve a travel payment": statuses follow the request (spec §9). */
export const paymentApproval = (ctx: () => ModuleContext) =>
  defineApprovalEntity({
    type: 'payment',
    // `ref` and `total` are for the approver to read (the request page lists the facts); conditions use the rest.
    facts: z.object({ ref: z.string(), total: z.string(), branchCode: z.string(), headOffice: z.boolean() }),
    fields: factFields,
    display: { label: 'payments.entity', icon: 'i-lucide-banknote', link: '/payments/:id' },
    async loadFacts(id) {
      const row = await findPayment(id)
      if (!row) throw new Error(`payment ${id} not found`)
      const totals = Object.entries(totalsOf(await itemsOf(id)))
      return {
        ref: row.ref,
        total: totals.map(([ccy, amount]) => `${groupAmount(amount)} ${ccy}`).join(' + '),
        branchCode: row.branchCode,
        headOffice: row.branchCode === HEAD_OFFICE_BRANCH,
      }
    },
    async canView(c, id) {
      const row = await findPayment(id)
      return row ? mayReadPayment(ctx(), c, row) : false
    },
    async onStatusChange(id, status) {
      const row = await findPayment(id)
      if (!row) return
      if (status === 'pending') {
        // Submitted or resubmitted: the bills are checked here, so every way in gets the check.
        if (row.status !== 'calculated') return
        await assertBillsComplete(id)
        await assertSomethingToPay(id)
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
            type: 'payments.approved',
            params: { ref: row.ref },
            link: `/payments/${id}`,
            subject: { type: 'payment', id },
          })
        return
      }
      if (status === 'returned' && row.status === 'in_approval') {
        await transition(id, row.version, 'calculated')
        return
      }
      // Rejected or withdrawn: the payment is void, and the agreement may be paid again.
      if ((status === 'rejected' || status === 'cancelled') && (row.status === 'in_approval' || row.status === 'calculated'))
        await transition(id, row.version, 'void')
    },
  })
