import { AppError } from '@elvine-sk/platform-core'
import { uuidBin } from '@elvine-sk/platform-db'
import { defineFileEntity } from '@elvine-sk/platform-files'
import type { ModuleContext, PlatformModule } from '@elvine-sk/platform-server'
import { appDb } from '../../shared/db.ts'
import { caller } from '../agreements/scope.ts'
import { findSettlement } from './queries.ts'
import { isMember, maySeeSettlement } from './scope.ts'

/** Receipts and proofs of exchange rates: PDF only, 50 MB at most (spec §13, ກ28). */
export const RECEIPT_TYPES = ['application/pdf']
export const RECEIPT_MAX_BYTES = 52_428_800

/** Files on a settlement: its readers see them; while it is a draft, any member of the agreement attaches them. */
export const settlementFiles = (ctx: () => ModuleContext) =>
  defineFileEntity({
    type: 'settlement',
    display: { label: 'settlements.entity', icon: 'i-lucide-receipt', link: '/settlements/:id' },
    accept: RECEIPT_TYPES,
    maxSize: RECEIPT_MAX_BYTES,
    async canView(c, id) {
      const row = await findSettlement(id)
      return row ? maySeeSettlement(ctx(), c, row) : false
    },
    async canAttach(c, id) {
      const row = await findSettlement(id)
      if (!row || row.status !== 'draft') return false
      return isMember(row.agreementId, (await caller(ctx(), c)).eid)
    },
  })

type Middleware = ReturnType<NonNullable<PlatformModule['middleware']>>

const DELETE_FILE = /^\/api\/v1\/files\/([0-9a-f-]{36})$/i

/**
 * Receipts stay once the settlement has left draft (spec §13: kept with no time limit). The platform lets an
 * uploader delete their own file at any time, so `DELETE /files/{id}` of a settlement that is not a draft is refused
 * here, before the files module sees it.
 */
export const keepReceipts = (): Middleware => async (c, next) => {
  const m = c.req.method === 'DELETE' ? DELETE_FILE.exec(c.req.path) : null
  if (m) {
    const row = await appDb()
      .selectFrom('files as f')
      .innerJoin('settlements as s', 's.id', 'f.entityId')
      .select('s.status')
      .where('f.id', '=', uuidBin(m[1]!))
      .where('f.entityType', '=', 'settlement')
      .executeTakeFirst()
    if (row && row.status !== 'draft')
      throw new AppError('settlements.receipt_locked', 'The receipts of a submitted settlement are kept', {
        status: 409,
      })
  }
  await next()
}
