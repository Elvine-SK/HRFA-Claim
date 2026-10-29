import { defineFileEntity } from '@elvine-sk/platform-files'
import type { ModuleContext } from '@elvine-sk/platform-server'
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
