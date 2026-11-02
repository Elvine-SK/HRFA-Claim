import { AppError } from '@elvine-sk/platform-core'
import { scopedBy, sql, uuidBin, type ScopedSelect, type SelectQueryBuilder } from '@elvine-sk/platform-db'
import type { ModuleContext } from '@elvine-sk/platform-server'
import { appDb } from '../../shared/db.ts'
import { caller, callerScope, type C } from '../agreements/scope.ts'
import { HEAD_OFFICE_BRANCH } from '../agreements/types.ts'

/**
 * Who sees which settlements (spec §12), by the branch on the settlement (its agreement's):
 * - `all`: super administrators, and `settlement.read` holders at head office;
 * - `branch`: `settlement.read` holders elsewhere, for the settlements of their HRM branch;
 * - everyone, also a branch reader: the settlements of the agreements they are a member of (any member files it, ກ13).
 */
export async function scopedSettlements<O>(
  ctx: ModuleContext,
  c: C,
  qb: SelectQueryBuilder<any, any, O>,
): Promise<ScopedSelect<O>> {
  const scope = await callerScope(ctx, c, 'settlement.read')
  if (scope.kind !== 'all') {
    // Members keep the settlements of their own trips, also a branch reader on another branch's trip.
    const { eid } = await caller(ctx, c)
    const branch = scope.kind === 'branch' ? scope.branch : null
    qb = qb.where((eb) => {
      const member = eb.exists(
        eb
          .selectFrom('agreementMembers as m')
          .select('m.id')
          .whereRef('m.agreementId', '=', 's.agreementId')
          .where('m.eid', '=', eid ?? ''),
      )
      return branch ? eb.or([eb('s.branchCode', '=', branch), member]) : eid ? member : sql<boolean>`1 = 0`
    })
  }
  return scopedBy(qb, 'settlements: settlement.read holders for the HRM branch of the caller (head office: all), and memberships')
}

/** Whether `eid` is a member of the agreement. */
export async function isMember(agreementId: string, eid: string | null): Promise<boolean> {
  if (!eid) return false
  const row = await appDb()
    .selectFrom('agreementMembers')
    .select('id')
    .where('agreementId', '=', uuidBin(agreementId))
    .where('eid', '=', eid)
    .executeTakeFirst()
  return Boolean(row)
}

/** Whether the caller may read a settlement of `branchCode` on `agreementId` (the same rule as `scopedSettlements`). */
export async function maySeeSettlement(
  ctx: ModuleContext,
  c: C,
  row: { branchCode: string; agreementId: string },
): Promise<boolean> {
  const scope = await callerScope(ctx, c, 'settlement.read')
  if (scope.kind === 'all') return true
  if (scope.kind === 'branch' && row.branchCode === scope.branch) return true
  return isMember(row.agreementId, (await caller(ctx, c)).eid)
}

/** The caller as a member of the agreement: their EID, or 404 so other people's trips do not leak. */
export async function requireMember(ctx: ModuleContext, c: C, agreementId: string): Promise<string> {
  const { eid } = await caller(ctx, c)
  if (!eid || !(await isMember(agreementId, eid))) throw AppError.notFound()
  return eid
}

/**
 * `settlement.export` (the upload files and posting confirmations) for a settlement of `branchCode`: 403 without the
 * permission, 404 for another branch's settlement (head office works for every branch).
 */
export async function requireSettlementExport(ctx: ModuleContext, c: C, branchCode: string): Promise<void> {
  const me = await caller(ctx, c)
  if (!(await me.can('settlement.export'))) throw AppError.forbidden()
  if (!(me.isSuper || me.branch === HEAD_OFFICE_BRANCH || me.branch === branchCode)) throw AppError.notFound()
}
