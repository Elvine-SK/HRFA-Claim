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
import { caller, type C } from '../agreements/scope.ts'
import {
  canFile,
  createSettlement,
  findSettlement,
  liveSettlementOf,
  loadSettlement,
  saveDraft,
  settlementRows,
  toListItem,
  type SettlementRow,
} from './queries.ts'
import {
  SettlementCreateSchema,
  SettlementDraftSchema,
  settlementFields,
  SettlementListItemSchema,
  SettlementLookupQuery,
  SettlementLookupSchema,
  SettlementSchema,
} from './schema.ts'
import { isMember, maySeeSettlement, requireMember, scopedSettlements } from './scope.ts'

const tags = ['Settlements']

export const lang = (c: C) => c.var.locale ?? 'en'

/** The settlement if the caller may read it; 404 otherwise, so other people's settlements do not leak. */
export async function readable(ctx: ModuleContext, c: C, id: string): Promise<SettlementRow> {
  const row = await findSettlement(id)
  if (!row || !(await maySeeSettlement(ctx, c, row))) throw AppError.notFound()
  return row
}

export function settlementRoutes(api: ApiRouter, ctx: ModuleContext) {
  api.openapi(
    createRoute({
      method: 'post',
      path: '/settlements',
      tags,
      summary: "File the settlement of an agreement's advance, as a member of the agreement (spec §10, ກ13)",
      request: jsonBody(SettlementCreateSchema),
      responses: { 201: jsonContent(dataOf(SettlementSchema), 'Created'), ...errorResponses(401, 404, 409, 422) },
    }),
    async (c) => {
      requireUser(c)
      const { agreementId } = c.req.valid('json')
      if (!(await findAgreement(agreementId))) throw AppError.notFound()
      const eid = await requireMember(ctx, c, agreementId)
      const id = await createSettlement(agreementId, eid)
      return c.json({ data: await loadSettlement(id, lang(c)) }, 201)
    },
  )

  api.openapi(
    createRoute({
      method: 'get',
      path: '/settlements',
      tags,
      summary: 'Settlements the caller may see (filters: status, agreementId, filedByEid; search: REF, Doc.no)',
      request: { query: ListQueryParams },
      responses: { 200: jsonContent(listOf(SettlementListItemSchema), 'Settlements'), ...errorResponses(401, 422) },
    }),
    async (c) => {
      requireUser(c)
      const query = listQueryFrom(c, settlementFields, { defaultSort: [{ field: 'createdAt', dir: 'desc' }] })
      const page = await paginate(await scopedSettlements(ctx, c, settlementRows()), query, settlementFields, {
        tieBreaker: 's.id',
      })
      return c.json({ data: (page.data as SettlementRow[]).map((r) => toListItem(r, lang(c))), meta: page.meta }, 200)
    },
  )

  // Before `/settlements/{id}`, so `lookup` is not read as an id.
  api.openapi(
    createRoute({
      method: 'get',
      path: '/settlements/lookup',
      tags,
      summary: 'Find an agreement by REF or Doc.no, with its settlement and whether the caller may file one',
      request: { query: SettlementLookupQuery },
      responses: { 200: jsonContent(dataOf(SettlementLookupSchema), 'Found'), ...errorResponses(401, 404, 422) },
    }),
    async (c) => {
      requireUser(c)
      const agreement = await findByNumber(c.req.valid('query').number)
      if (!agreement) throw AppError.notFound()
      const member = await isMember(agreement.id, (await caller(ctx, c)).eid)
      if (!member && !(await maySeeSettlement(ctx, c, { branchCode: agreement.branchCode, agreementId: agreement.id })))
        throw AppError.notFound()
      const settlementId = await liveSettlementOf(agreement.id)
      return c.json(
        {
          data: {
            agreementId: agreement.id,
            settlementId,
            canFile: member && !settlementId && (await canFile(agreement.id)),
          },
        },
        200,
      )
    },
  )

  api.openapi(
    createRoute({
      method: 'get',
      path: '/settlements/{id}',
      tags,
      summary: 'A settlement: lines, totals and case, step 2 candidates, lateness, posting batches',
      request: { params: IdParam },
      responses: { 200: jsonContent(dataOf(SettlementSchema), 'Settlement'), ...errorResponses(401, 404) },
    }),
    async (c) => {
      requireUser(c)
      const id = c.req.valid('param').id
      await readable(ctx, c, id)
      return c.json({ data: await loadSettlement(id, lang(c)) }, 200)
    },
  )

  api.openapi(
    createRoute({
      method: 'put',
      path: '/settlements/{id}',
      tags,
      summary: 'Replace the case and expense lines of a draft settlement (any member of the agreement)',
      request: { params: IdParam, ...jsonBody(SettlementDraftSchema) },
      responses: { 200: jsonContent(dataOf(SettlementSchema), 'Saved'), ...errorResponses(401, 404, 409, 422) },
    }),
    async (c) => {
      requireUser(c)
      const id = c.req.valid('param').id
      const row = await readable(ctx, c, id)
      await requireMember(ctx, c, row.agreementId)
      const { version, caseKind, lines } = c.req.valid('json')
      await saveDraft(id, version, { caseKind, lines })
      return c.json({ data: await loadSettlement(id, lang(c)) }, 200)
    },
  )
}
