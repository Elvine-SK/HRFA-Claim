import { APPROVAL } from '@elvine-sk/platform-approval'
import { SubmitBody } from '@elvine-sk/platform-approval/schemas'
import { getAudit } from '@elvine-sk/platform-audit'
import { requireUser } from '@elvine-sk/platform-auth'
import { AppError } from '@elvine-sk/platform-core'
import { NOTIFICATIONS } from '@elvine-sk/platform-notifications'
import { inTransaction, paginate } from '@elvine-sk/platform-db'
import {
  createRoute,
  dataOf,
  ErrorSchema,
  errorResponses,
  IdParam,
  jsonBody,
  jsonContent,
  listOf,
  listQueryFrom,
  ListQueryParams,
  z,
  type ApiRouter,
  type ModuleContext,
} from '@elvine-sk/platform-server'
import {
  agreementRows,
  createDraft,
  docNoOf,
  findByNumber,
  historyOfAgreement,
  loadAgreement,
  membersOf,
  notDraft,
  toAgreement,
  toListItem,
  updateDraft,
  type AgreementRow,
  type MemberRow,
} from './queries.ts'
import {
  agreementFields,
  AgreementInputSchema,
  AgreementListItemSchema,
  AgreementSchema,
  AgreementUpdateSchema,
  CancelSchema,
  LookupQuery,
} from './schema.ts'
import { todayHrm } from '../../shared/dates.ts'
import { agreementPrintModel, printPlace } from '../print/agreement.ts'
import { pdfHeaders, renderPdf } from '../print/pdf.ts'
import { signersOf } from '../print/signers.ts'
import { agreementCancelled } from './events.ts'
import { transition } from './procedures.ts'
import { caller, mayCreateFor, mayRead, scopedAgreements, type C } from './scope.ts'

const tags = ['Agreements']
const unavailable = { 503: jsonContent(ErrorSchema, 'HRM is unavailable') }

const HistoryEntrySchema = z
  .object({
    id: z.string().uuid(),
    version: z.number().int(),
    action: z.enum(['create', 'update', 'delete', 'restore']),
    changes: z.record(z.string(), z.tuple([z.unknown(), z.unknown()])),
    changedBy: z.string().uuid().nullable(),
    changedAt: z.string(),
  })
  .openapi('AgreementHistoryEntry')

const lang = (c: C) => c.var.locale ?? 'en'

/** Whether the caller may read this agreement; the members decide for employees. */
export async function mayReadAgreement(ctx: ModuleContext, c: C, row: AgreementRow, members?: MemberRow[]) {
  const eids = (members ?? (await membersOf(row.id))).map((m) => m.eid)
  return mayRead(ctx, c, { branchCode: row.branchCode, createdBy: row.createdBy, memberEids: eids })
}

/** The agreement if the caller may read it; 404 otherwise, so other branches' numbers do not leak. */
export async function readable(ctx: ModuleContext, c: C, id: string) {
  const found = await loadAgreement(id)
  if (!(await mayReadAgreement(ctx, c, found.row, found.members))) throw AppError.notFound()
  return found
}

/** Who may change a draft: its creator, or an `agreement.create` holder for its branch. */
export async function mayEdit(ctx: ModuleContext, c: C, row: AgreementRow) {
  const me = await caller(ctx, c)
  return row.createdBy === me.userId || (await mayCreateFor(ctx, c, row.branchCode))
}

export function agreementRoutes(api: ApiRouter, ctx: ModuleContext) {
  api.openapi(
    createRoute({
      method: 'post',
      path: '/agreements',
      tags,
      summary: 'Save a new draft agreement (forms 1–4); the system issues its REF',
      request: jsonBody(AgreementInputSchema),
      responses: {
        201: jsonContent(dataOf(AgreementSchema), 'Created'),
        ...errorResponses(401, 403, 409, 422),
        ...unavailable,
      },
    }),
    async (c) => {
      requireUser(c)
      const input = c.req.valid('json')
      const docNo = docNoOf(input)
      if (!(await mayCreateFor(ctx, c, docNo.branch))) throw AppError.forbidden()
      const { row, members } = await createDraft(input, docNo)
      return c.json({ data: toAgreement(row, members, lang(c)) }, 201)
    },
  )

  api.openapi(
    createRoute({
      method: 'get',
      path: '/agreements',
      tags,
      summary: 'Agreements the caller may see (filters: status, formType, branchCode; search: REF, Doc.no, subject)',
      request: { query: ListQueryParams },
      responses: { 200: jsonContent(listOf(AgreementListItemSchema), 'Agreements'), ...errorResponses(401, 422) },
    }),
    async (c) => {
      requireUser(c)
      const query = listQueryFrom(c, agreementFields, { defaultSort: [{ field: 'createdAt', dir: 'desc' }] })
      const page = await paginate(await scopedAgreements(ctx, c, agreementRows()), query, agreementFields)
      return c.json({ data: (page.data as AgreementRow[]).map((r) => toListItem(r, lang(c))), meta: page.meta }, 200)
    },
  )

  // Before `/agreements/{id}`, so `lookup` is not read as an id.
  api.openapi(
    createRoute({
      method: 'get',
      path: '/agreements/lookup',
      tags,
      summary: 'Find an agreement by REF or Doc.no (either script, . or /)',
      request: { query: LookupQuery },
      responses: { 200: jsonContent(dataOf(AgreementSchema), 'Agreement'), ...errorResponses(401, 404, 422) },
    }),
    async (c) => {
      requireUser(c)
      const row = await findByNumber(c.req.valid('query').number)
      if (!row) throw AppError.notFound()
      const { members } = await readable(ctx, c, row.id)
      return c.json({ data: toAgreement(row, members, lang(c)) }, 200)
    },
  )

  api.openapi(
    createRoute({
      method: 'get',
      path: '/agreements/{id}',
      tags,
      summary: 'An agreement with its members',
      request: { params: IdParam },
      responses: { 200: jsonContent(dataOf(AgreementSchema), 'Agreement'), ...errorResponses(401, 404) },
    }),
    async (c) => {
      requireUser(c)
      const { row, members } = await readable(ctx, c, c.req.valid('param').id)
      return c.json({ data: toAgreement(row, members, lang(c)) }, 200)
    },
  )

  api.openapi(
    createRoute({
      method: 'get',
      path: '/agreements/{id}/pdf',
      tags,
      summary: 'The agreement as a PDF laid out like the paper form (forms 1–4), with its signers',
      request: { params: IdParam },
      responses: {
        200: { description: 'PDF', content: { 'application/pdf': { schema: z.string().openapi({ format: 'binary' }) } } },
        ...errorResponses(401, 404),
      },
    }),
    async (c) => {
      requireUser(c)
      const { row, members } = await readable(ctx, c, c.req.valid('param').id)
      const pdf = await renderPdf(
        agreementPrintModel({
          agreement: row,
          members,
          place: await printPlace(row),
          signers: await signersOf('agreement', row.id),
          today: todayHrm(),
        }),
      )
      await getAudit(ctx).record({
        action: 'agreements.printed',
        targetType: 'agreement',
        targetId: row.id,
        details: { ref: row.ref },
      })
      return c.body(pdf as Uint8Array<ArrayBuffer>, 200, pdfHeaders(pdf, `${row.ref}.pdf`))
    },
  )

  api.openapi(
    createRoute({
      method: 'put',
      path: '/agreements/{id}',
      tags,
      summary: 'Replace a draft agreement, members included (optimistic locking)',
      request: { params: IdParam, ...jsonBody(AgreementUpdateSchema) },
      responses: {
        200: jsonContent(dataOf(AgreementSchema), 'Updated'),
        ...errorResponses(401, 403, 404, 409, 422),
        ...unavailable,
      },
    }),
    async (c) => {
      requireUser(c)
      const id = c.req.valid('param').id
      const { version, ...input } = c.req.valid('json')
      const { row } = await readable(ctx, c, id)
      // Before the body is checked: a submitted agreement is never edited, whatever the body says.
      if (row.status !== 'draft') throw notDraft()
      const docNo = docNoOf(input)
      if (!(await mayEdit(ctx, c, row)) || !(await mayCreateFor(ctx, c, docNo.branch))) throw AppError.forbidden()
      const saved = await updateDraft(id, version, input, docNo)
      return c.json({ data: toAgreement(saved.row, saved.members, lang(c)) }, 200)
    },
  )

  api.openapi(
    createRoute({
      method: 'get',
      path: '/agreements/{id}/history',
      tags,
      summary: 'Record history of an agreement',
      request: { params: IdParam },
      responses: { 200: jsonContent(dataOf(z.array(HistoryEntrySchema)), 'History'), ...errorResponses(401, 404) },
    }),
    async (c) => {
      requireUser(c)
      const id = c.req.valid('param').id
      await readable(ctx, c, id)
      return c.json({ data: await historyOfAgreement(id) }, 200)
    },
  )

  api.openapi(
    createRoute({
      method: 'post',
      path: '/agreements/{id}/submit',
      tags,
      summary: 'Submit a draft for approval (or resubmit one a reviewer returned); checks it and snapshots HRM data',
      request: { params: IdParam, ...jsonBody(SubmitBody) },
      responses: {
        200: jsonContent(dataOf(AgreementSchema), 'Submitted'),
        ...errorResponses(401, 403, 404, 409, 422),
        ...unavailable,
      },
    }),
    async (c) => {
      const { user } = requireUser(c)
      const id = c.req.valid('param').id
      const { row } = await readable(ctx, c, id)
      if (!(await mayEdit(ctx, c, row))) throw AppError.forbidden()
      if (row.status !== 'draft') throw notDraft()
      const approval = ctx.services.get(APPROVAL)
      const open = await approval.openRequestOf('agreement', id)
      if (open?.status === 'returned') await approval.resubmit(open.id, user.id)
      else await approval.submit('agreement', id, user.id, { workflow: c.req.valid('json').workflow })
      const saved = await loadAgreement(id)
      return c.json({ data: toAgreement(saved.row, saved.members, lang(c)) }, 200)
    },
  )

  api.openapi(
    createRoute({
      method: 'post',
      path: '/agreements/{id}/cancel',
      tags,
      summary: 'Cancel an agreement with a reason (spec §8, ກ16); its Doc.no is free for the replacement',
      request: { params: IdParam, ...jsonBody(CancelSchema) },
      responses: {
        200: jsonContent(dataOf(AgreementSchema), 'Cancelled'),
        ...errorResponses(401, 403, 404, 409, 422),
      },
    }),
    async (c) => {
      const { user } = requireUser(c)
      const id = c.req.valid('param').id
      const { version, reason } = c.req.valid('json')
      const { row } = await readable(ctx, c, id)
      const approval = ctx.services.get(APPROVAL)
      const me = await caller(ctx, c)
      const allowed = (await me.can('agreement.cancel')) || (await approval.isApproverOf(user.id, 'agreement', id))
      if (!allowed) throw AppError.forbidden()
      const saved = await inTransaction(async () => {
        // Cancelled first, so the request's own "cancelled" status change finds nothing to move back to draft.
        await transition(id, version, 'cancelled', reason)
        await approval.cancelForEntity('agreement', id)
        await agreementCancelled(id, reason)
        await getAudit(ctx).record({
          action: 'agreements.cancelled',
          targetType: 'agreement',
          targetId: id,
          details: { ref: row.ref, from: row.status, reason },
        })
        if (row.createdBy && row.createdBy !== user.id)
          await ctx.services.get(NOTIFICATIONS).notify({
            userIds: [row.createdBy],
            type: 'agreements.cancelled',
            params: { ref: row.ref, reason },
            link: `/agreements/${id}`,
            subject: { type: 'agreement', id },
          })
        return loadAgreement(id)
      })
      return c.json({ data: toAgreement(saved.row, saved.members, lang(c)) }, 200)
    },
  )
}
