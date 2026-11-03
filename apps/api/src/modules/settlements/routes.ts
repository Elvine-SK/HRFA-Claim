import { getAudit } from '@elvine-sk/platform-audit'
import { requireUser } from '@elvine-sk/platform-auth'
import { AppError } from '@elvine-sk/platform-core'
import { inTransaction, paginate, scopedBy } from '@elvine-sk/platform-db'
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
  z,
} from '@elvine-sk/platform-server'
import { findAgreement, findByNumber } from '../agreements/queries.ts'
import { caller, callerScope, type C } from '../agreements/scope.ts'
import { linesOf as batchLines } from '../payments/batches.ts'
import { xlsxWriter } from '../payments/xlsx.ts'
import { submitSettlement } from './approval.ts'
import { batchOfKind, exportClearing, exportSettlement, markPosted } from './batches.ts'
import { transition } from './procedures.ts'
import {
  canFile,
  createSettlement,
  findSettlement,
  liveSettlementOf,
  loadSettlement,
  overdueCutoff,
  overdueOf,
  overdueRows,
  toFileOf,
  toFileRows,
  saveDraft,
  settlementRows,
  toListItem,
  type OverdueRow,
  type SettlementRow,
} from './queries.ts'
import {
  BatchFileParams,
  ClearingPostedSchema,
  overdueFields,
  OverdueSchema,
  SettlementCreateSchema,
  SettlementDraftSchema,
  settlementFields,
  SettlementListItemSchema,
  SettlementLookupQuery,
  SettlementLookupSchema,
  SettlementPostedSchema,
  SettlementSchema,
  SettlementSubmitSchema,
  SettlementVersionSchema,
  ToFileSchema,
} from './schema.ts'
import { isMember, maySeeSettlement, requireMember, requireSettlementExport, scopedSettlements } from './scope.ts'

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
      path: '/settlements/overdue',
      tags,
      summary: 'Agreements whose paid advance is past its settlement due date and not submitted yet (Finance)',
      request: { query: ListQueryParams },
      responses: { 200: jsonContent(listOf(OverdueSchema), 'Overdue'), ...errorResponses(401, 403, 422) },
    }),
    async (c) => {
      requireUser(c)
      const scope = await callerScope(ctx, c, 'settlement.read')
      if (scope.kind === 'own') throw AppError.forbidden()
      let qb = overdueRows(await overdueCutoff())
      if (scope.kind === 'branch') qb = qb.where('a.branchCode', '=', scope.branch)
      const query = listQueryFrom(c, overdueFields, { defaultSort: [{ field: 'travelTo', dir: 'asc' }] })
      const page = await paginate(scopedBy(qb, 'settlements overdue: settlement.read holders for their HRM branch (head office: all)'), query, overdueFields, {
        tieBreaker: 'a.id',
      })
      return c.json({ data: await overdueOf(page.data as OverdueRow[], lang(c)), meta: page.meta }, 200)
    },
  )

  api.openapi(
    createRoute({
      method: 'get',
      path: '/settlements/to-file',
      tags,
      summary: "The caller's agreements whose advance is paid and whose settlement is not submitted yet (dashboard)",
      request: { query: ListQueryParams },
      responses: { 200: jsonContent(listOf(ToFileSchema), 'To file'), ...errorResponses(401, 422) },
    }),
    async (c) => {
      requireUser(c)
      const { eid } = await caller(ctx, c)
      // Only the caller's own trips, whatever their role.
      const qb = toFileRows(eid ?? '')
      const query = listQueryFrom(c, overdueFields, { defaultSort: [{ field: 'travelTo', dir: 'asc' }] })
      const page = await paginate(scopedBy(qb, 'settlements to file: own trips (members) only'), query, overdueFields, {
        tieBreaker: 'a.id',
      })
      return c.json({ data: await toFileOf(page.data as OverdueRow[], lang(c)), meta: page.meta }, 200)
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

  api.openapi(
    createRoute({
      method: 'post',
      path: '/settlements/{id}/submit',
      tags,
      summary:
        'Submit a draft settlement for approval (or resubmit a returned one), naming the leader or deputy of step 2',
      request: { params: IdParam, ...jsonBody(SettlementSubmitSchema) },
      responses: { 200: jsonContent(dataOf(SettlementSchema), 'Submitted'), ...errorResponses(401, 404, 409, 422) },
    }),
    async (c) => {
      const { user } = requireUser(c)
      const id = c.req.valid('param').id
      const row = await readable(ctx, c, id)
      const eid = await requireMember(ctx, c, row.agreementId)
      await submitSettlement(ctx, id, c.req.valid('json'), { userId: user.id, eid })
      return c.json({ data: await loadSettlement(id, lang(c)) }, 200)
    },
  )

  /** Export rights on the settlement (403 without them, 404 for another branch). */
  async function exporter(c: C, id: string) {
    const row = await readable(ctx, c, id)
    await requireSettlementExport(ctx, c, row.branchCode)
    return row
  }

  api.openapi(
    createRoute({
      method: 'post',
      path: '/settlements/{id}/export',
      tags,
      summary: "Create the approved settlement's posting batch (the upload file for CORE) and mark it exported",
      request: { params: IdParam, ...jsonBody(SettlementVersionSchema) },
      responses: { 200: jsonContent(dataOf(SettlementSchema), 'Exported'), ...errorResponses(401, 403, 404, 409, 422) },
    }),
    async (c) => {
      requireUser(c)
      const id = c.req.valid('param').id
      const row = await exporter(c, id)
      // GL accounts carry the exporting Finance user's branch (spec §11).
      const { branch } = await caller(ctx, c)
      if (!branch)
        throw new AppError('payments.no_branch', 'Your HRM record has no branch, which the upload file needs', {
          status: 422,
        })
      await inTransaction(async () => {
        const { batchId, lines } = await exportSettlement(id, c.req.valid('json').version, branch)
        await getAudit(ctx).record({
          action: 'settlements.exported',
          targetType: 'settlement',
          targetId: id,
          details: { ref: row.ref, batchId, lines },
        })
      })
      return c.json({ data: await loadSettlement(id, lang(c)) }, 200)
    },
  )

  api.openapi(
    createRoute({
      method: 'post',
      path: '/settlements/{id}/posted',
      tags,
      summary:
        "Confirm the settlement file was posted in CORE, with CORE's reference and, through the holding account, its suspense number",
      request: { params: IdParam, ...jsonBody(SettlementPostedSchema) },
      responses: { 200: jsonContent(dataOf(SettlementSchema), 'Posted'), ...errorResponses(401, 403, 404, 409, 422) },
    }),
    async (c) => {
      requireUser(c)
      const id = c.req.valid('param').id
      const row = await exporter(c, id)
      const { version, coreRef, rvsNo } = c.req.valid('json')
      await inTransaction(async () => {
        await markPosted(id, version, { coreRef, rvsNo })
        await getAudit(ctx).record({
          action: 'settlements.posted',
          targetType: 'settlement',
          targetId: id,
          details: { ref: row.ref, coreRef: coreRef || null, rvsNo: rvsNo ?? null },
        })
      })
      return c.json({ data: await loadSettlement(id, lang(c)) }, 200)
    },
  )

  api.openapi(
    createRoute({
      method: 'post',
      path: '/settlements/{id}/clearing',
      tags,
      summary: 'Create the clearing file of a posted overseas settlement (holding account back to the advance account)',
      request: { params: IdParam, ...jsonBody(SettlementVersionSchema) },
      responses: { 200: jsonContent(dataOf(SettlementSchema), 'Exported'), ...errorResponses(401, 403, 404, 409, 422) },
    }),
    async (c) => {
      requireUser(c)
      const id = c.req.valid('param').id
      const row = await exporter(c, id)
      await inTransaction(async () => {
        const { batchId, lines } = await exportClearing(id, c.req.valid('json').version)
        await getAudit(ctx).record({
          action: 'settlements.clearing_exported',
          targetType: 'settlement',
          targetId: id,
          details: { ref: row.ref, batchId, lines, rvsNo: row.rvsNo },
        })
      })
      return c.json({ data: await loadSettlement(id, lang(c)) }, 200)
    },
  )

  api.openapi(
    createRoute({
      method: 'post',
      path: '/settlements/{id}/clearing/posted',
      tags,
      summary: 'Confirm the clearing file was posted in CORE, with its CORE reference if known',
      request: { params: IdParam, ...jsonBody(ClearingPostedSchema) },
      responses: { 200: jsonContent(dataOf(SettlementSchema), 'Cleared'), ...errorResponses(401, 403, 404, 409, 422) },
    }),
    async (c) => {
      requireUser(c)
      const id = c.req.valid('param').id
      const row = await exporter(c, id)
      const { version, coreRef } = c.req.valid('json')
      await inTransaction(async () => {
        await transition(id, version, 'cleared', { coreRef: coreRef ?? null })
        await getAudit(ctx).record({
          action: 'settlements.cleared',
          targetType: 'settlement',
          targetId: id,
          details: { ref: row.ref, coreRef: coreRef || null },
        })
      })
      return c.json({ data: await loadSettlement(id, lang(c)) }, 200)
    },
  )

  api.openapi(
    createRoute({
      method: 'get',
      path: '/settlements/{id}/batches/{kind}/file',
      tags,
      summary: "Download a settlement's upload file for CORE (.xlsx): the settlement file or its clearing file",
      request: { params: BatchFileParams },
      responses: {
        200: {
          description: 'Upload file',
          content: { [xlsxWriter.contentType]: { schema: z.string().openapi({ format: 'binary' }) } },
        },
        ...errorResponses(401, 404),
      },
    }),
    async (c) => {
      requireUser(c)
      const { id, kind } = c.req.valid('param')
      const row = await readable(ctx, c, id)
      const batch = await batchOfKind(id, kind)
      if (!batch) throw AppError.notFound()
      const file = await xlsxWriter.write(await batchLines(batch.id))
      await getAudit(ctx).record({
        action: 'settlements.downloaded',
        targetType: 'settlement',
        targetId: id,
        details: { ref: row.ref, batchId: batch.id, kind },
      })
      return c.body(file as Uint8Array<ArrayBuffer>, 200, {
        'content-type': xlsxWriter.contentType,
        'content-disposition': `attachment; filename="${batch.fileName.replace(/[^\w.-]/g, '_')}"`,
        'content-length': String(file.byteLength),
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      })
    },
  )
}
