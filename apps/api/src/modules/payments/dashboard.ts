import type { FieldMap } from '@elvine-sk/platform-core'
import { defineDashboardStat } from '@elvine-sk/platform-dashboard'
import { scopedBy, sql, type SelectQueryBuilder } from '@elvine-sk/platform-db'
import { z, type ModuleContext } from '@elvine-sk/platform-server'
import { appDb } from '../../shared/db.ts'
import { formatDocNo, parseDocNo } from '../agreements/doc-no.ts'
import { callerScope, type C } from '../agreements/scope.ts'
import { FORM_TYPES } from '../agreements/types.ts'

/** Approved agreements with no live payment (`a` agreements): Finance has still to calculate them (spec §14). */
export const withoutPaymentRows = () =>
  appDb()
    .selectFrom('agreements as a')
    .select(['a.id', 'a.ref', 'a.docNo', 'a.formType', 'a.subject', 'a.travelFrom', 'a.travelTo', 'a.branchCode'])
    .where('a.status', '=', 'approved')
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom('payments as p').select('p.id').whereRef('p.agreementId', '=', 'a.id').where('p.status', '<>', 'void'),
        ),
      ),
    )

/** `withoutPaymentRows` for the caller: Finance of the document's branch (head office: all), nobody else. */
export async function scopedWithoutPayment(ctx: ModuleContext, c: C) {
  const scope = await callerScope(ctx, c, 'payment.read')
  let qb = withoutPaymentRows()
  if (scope.kind === 'branch') qb = qb.where('a.branchCode', '=', scope.branch)
  if (scope.kind === 'own') qb = qb.where(sql<boolean>`1 = 0`)
  return { scope, qb }
}

export type WithoutPaymentRow = {
  id: string
  ref: string
  docNo: string
  formType: (typeof FORM_TYPES)[number]
  subject: string
  travelFrom: string
  travelTo: string
  branchCode: string
}

export const toWithoutPaymentItem = (r: WithoutPaymentRow, lang: string) => {
  const d = parseDocNo(r.docNo)
  return { ...r, docNo: d ? formatDocNo(d, lang === 'lo' ? 'lo' : 'en') : r.docNo }
}

export const WithoutPaymentSchema = z
  .object({
    id: z.string().uuid(),
    ref: z.string(),
    docNo: z.string(),
    formType: z.enum(FORM_TYPES),
    subject: z.string(),
    travelFrom: z.string(),
    travelTo: z.string(),
    branchCode: z.string(),
  })
  .openapi('AgreementWithoutPayment')

/** Filters and sort of the list (agreements as `a`). */
export const withoutPaymentFields: FieldMap = {
  ref: { type: 'string', column: 'a.ref', sortable: true, searchable: true },
  docNo: { type: 'string', column: 'a.docNo', sortable: true, searchable: true },
  formType: { type: 'enum', column: 'a.formType', values: FORM_TYPES },
  branchCode: { type: 'string', column: 'a.branchCode' },
  travelFrom: { type: 'date', column: 'a.travelFrom', sortable: true },
}

export const scopedWithoutPaymentSelect = async (ctx: ModuleContext, c: C) =>
  scopedBy((await scopedWithoutPayment(ctx, c)).qb, 'agreements without payment: payment.read holders for their HRM branch (head office: all)')

/** The number of rows `qb` selects. */
export async function countOf(qb: SelectQueryBuilder<any, any, any>): Promise<number> {
  const row = await qb
    .clearSelect()
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .executeTakeFirst()
  return Number(row?.n ?? 0)
}

export const paymentStats = [
  defineDashboardStat({
    key: 'payments.agreements_without_payment',
    label: 'payments.stats.withoutPayment',
    icon: 'i-lucide-receipt',
    tone: 'warning',
    order: 50,
    permission: 'payment.read',
    value: async ({ ctx, c }) => countOf((await scopedWithoutPayment(ctx, c as C)).qb),
  }),
]
