import { requireUser } from '@elvine-sk/platform-auth'
import { AppError } from '@elvine-sk/platform-core'
import { paginate } from '@elvine-sk/platform-db'
import {
  createRoute,
  dataOf,
  errorResponses,
  IdParam,
  jsonBody,
  jsonContent,
  listOf,
  listQueryFrom,
  ListQueryParams,
  type ApiRouter,
  type ModuleContext,
} from '@elvine-sk/platform-server'
import { findAgreement, findByNumber } from '../agreements/queries.ts'
import type { C } from '../agreements/scope.ts'
import {
  createPayment,
  findPayment,
  livePaymentOf,
  loadPayment,
  paymentRows,
  recalculatePayment,
  saveBills,
  toListItem,
  type PaymentRow,
} from './queries.ts'
import {
  BillsSchema,
  PaymentCreateSchema,
  paymentFields,
  PaymentListItemSchema,
  PaymentLookupQuery,
  PaymentLookupSchema,
  PaymentSchema,
  VersionSchema,
} from './schema.ts'
import { mayReadPayment, requireCalculate, scopedPayments } from './scope.ts'

const tags = ['Payments']

const lang = (c: C) => c.var.locale ?? 'en'

/** The payment if the caller may read it; 404 otherwise, so other branches' payments do not leak. */
async function readable(ctx: ModuleContext, c: C, id: string): Promise<PaymentRow> {
  const row = await findPayment(id)
  if (!row || !(await mayReadPayment(ctx, c, row))) throw AppError.notFound()
  return row
}

export function paymentRoutes(api: ApiRouter, ctx: ModuleContext) {
  api.openapi(
    createRoute({
      method: 'post',
      path: '/payments',
      tags,
      summary: 'Calculate an approved agreement into its payment (the checking table, spec §9)',
      request: jsonBody(PaymentCreateSchema),
      responses: { 201: jsonContent(dataOf(PaymentSchema), 'Created'), ...errorResponses(401, 403, 404, 409, 422) },
    }),
    async (c) => {
      requireUser(c)
      const { agreementId } = c.req.valid('json')
      const agreement = await findAgreement(agreementId)
      if (!agreement) throw AppError.notFound()
      await requireCalculate(ctx, c, agreement.branchCode)
      const id = await createPayment(agreementId)
      return c.json({ data: await loadPayment(id, lang(c)) }, 201)
    },
  )

  api.openapi(
    createRoute({
      method: 'get',
      path: '/payments',
      tags,
      summary: 'Payments the caller may see (filters: status, agreementId, formType, branchCode; search: REF, Doc.no)',
      request: { query: ListQueryParams },
      responses: { 200: jsonContent(listOf(PaymentListItemSchema), 'Payments'), ...errorResponses(401, 422) },
    }),
    async (c) => {
      requireUser(c)
      const query = listQueryFrom(c, paymentFields, { defaultSort: [{ field: 'createdAt', dir: 'desc' }] })
      const page = await paginate(await scopedPayments(ctx, c, paymentRows()), query, paymentFields, {
        tieBreaker: 'p.id',
      })
      return c.json({ data: (page.data as PaymentRow[]).map((r) => toListItem(r, lang(c))), meta: page.meta }, 200)
    },
  )

  // Before `/payments/{id}`, so `lookup` is not read as an id.
  api.openapi(
    createRoute({
      method: 'get',
      path: '/payments/lookup',
      tags,
      summary: "Find an agreement by REF or Doc.no for Finance, with its payment if it has one",
      request: { query: PaymentLookupQuery },
      responses: { 200: jsonContent(dataOf(PaymentLookupSchema), 'Found'), ...errorResponses(401, 404, 422) },
    }),
    async (c) => {
      requireUser(c)
      const agreement = await findByNumber(c.req.valid('query').number)
      if (!agreement || !(await mayReadPayment(ctx, c, agreement))) throw AppError.notFound()
      return c.json({ data: { agreementId: agreement.id, paymentId: await livePaymentOf(agreement.id) } }, 200)
    },
  )

  api.openapi(
    createRoute({
      method: 'get',
      path: '/payments/{id}',
      tags,
      summary: 'A payment: members with their items, day-8 flags, totals per currency, bills',
      request: { params: IdParam },
      responses: { 200: jsonContent(dataOf(PaymentSchema), 'Payment'), ...errorResponses(401, 404) },
    }),
    async (c) => {
      requireUser(c)
      const id = c.req.valid('param').id
      await readable(ctx, c, id)
      return c.json({ data: await loadPayment(id, lang(c)) }, 200)
    },
  )

  api.openapi(
    createRoute({
      method: 'post',
      path: '/payments/{id}/recalculate',
      tags,
      summary: 'Calculate a payment again from the current rates (calculated status only)',
      request: { params: IdParam, ...jsonBody(VersionSchema) },
      responses: { 200: jsonContent(dataOf(PaymentSchema), 'Recalculated'), ...errorResponses(401, 403, 404, 409, 422) },
    }),
    async (c) => {
      requireUser(c)
      const id = c.req.valid('param').id
      const row = await readable(ctx, c, id)
      await requireCalculate(ctx, c, row.branchCode)
      await recalculatePayment(id, c.req.valid('json').version)
      return c.json({ data: await loadPayment(id, lang(c)) }, 200)
    },
  )

  api.openapi(
    createRoute({
      method: 'put',
      path: '/payments/{id}/bills',
      tags,
      summary: "Replace Finance's bills for nights from day 8 and recalculate (calculated status only)",
      request: { params: IdParam, ...jsonBody(BillsSchema) },
      responses: { 200: jsonContent(dataOf(PaymentSchema), 'Saved'), ...errorResponses(401, 403, 404, 409, 422) },
    }),
    async (c) => {
      requireUser(c)
      const id = c.req.valid('param').id
      const row = await readable(ctx, c, id)
      await requireCalculate(ctx, c, row.branchCode)
      const { version, bills } = c.req.valid('json')
      await saveBills(id, version, bills)
      return c.json({ data: await loadPayment(id, lang(c)) }, 200)
    },
  )
}
