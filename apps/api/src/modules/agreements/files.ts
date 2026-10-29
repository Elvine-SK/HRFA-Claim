import { AppError } from '@elvine-sk/platform-core'
import { uuidBin } from '@elvine-sk/platform-db'
import { defineFileEntity } from '@elvine-sk/platform-files'
import type { ModuleContext, PlatformModule } from '@elvine-sk/platform-server'
import { appDb } from '../../shared/db.ts'
import { findAgreement } from './queries.ts'
import { mayEdit, mayReadAgreement } from './routes.ts'

/** Signed agreements and notices: PDF, JPG or PNG, 50 MB at most (spec §13). */
export const SIGNED_COPY_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
export const SIGNED_COPY_MAX_BYTES = 52_428_800

/** Files on an agreement: its readers see them; while it is a draft, whoever may edit it attaches them. */
export const agreementFiles = (ctx: () => ModuleContext) =>
  defineFileEntity({
    type: 'agreement',
    display: { label: 'agreements.entity', icon: 'i-lucide-plane', link: '/agreements/:id' },
    accept: SIGNED_COPY_TYPES,
    maxSize: SIGNED_COPY_MAX_BYTES,
    async canView(c, id) {
      const row = await findAgreement(id)
      return row ? mayReadAgreement(ctx(), c, row) : false
    },
    async canAttach(c, id) {
      const row = await findAgreement(id)
      if (!row || row.status !== 'draft') return false
      return (await mayReadAgreement(ctx(), c, row)) && mayEdit(ctx(), c, row)
    },
  })

type Middleware = ReturnType<NonNullable<PlatformModule['middleware']>>

const DELETE_FILE = /^\/api\/v1\/files\/([0-9a-f-]{36})$/i

/**
 * The signed copy stays once the agreement has left draft (spec §13: kept with no time limit). The platform lets
 * an uploader delete their own file at any time, so `DELETE /files/{id}` of an agreement that is not a draft is
 * refused here, before the files module sees it.
 */
export const keepSignedCopies = (): Middleware => async (c, next) => {
  const m = c.req.method === 'DELETE' ? DELETE_FILE.exec(c.req.path) : null
  if (m) {
    const row = await appDb()
      .selectFrom('files as f')
      .innerJoin('agreements as a', 'a.id', 'f.entityId')
      .select('a.status')
      .where('f.id', '=', uuidBin(m[1]!))
      .where('f.entityType', '=', 'agreement')
      .executeTakeFirst()
    if (row && row.status !== 'draft')
      throw new AppError('agreements.signed_copy_locked', 'The signed copy of a submitted agreement is kept', {
        status: 409,
      })
  }
  await next()
}
