import { AppError } from '@elvine-sk/platform-core'
import { scopedBy, sql, type ScopedSelect, type SelectQueryBuilder } from '@elvine-sk/platform-db'
import type { ModuleContext } from '@elvine-sk/platform-server'
import { caller, callerScope, type C } from '../agreements/scope.ts'
import { HEAD_OFFICE_BRANCH } from '../agreements/types.ts'

/**
 * Who sees which payments (spec §12), by the branch on the payment (its agreement's):
 * - `all`: super administrators, and `payment.read` holders at head office;
 * - `branch`: `payment.read` holders elsewhere, for the payments of their HRM branch;
 * - nobody else: employees see their trips through agreements, not payments.
 */
export async function scopedPayments<O>(
  ctx: ModuleContext,
  c: C,
  qb: SelectQueryBuilder<any, any, O>,
): Promise<ScopedSelect<O>> {
  const scope = await callerScope(ctx, c, 'payment.read')
  if (scope.kind === 'branch') qb = qb.where('p.branchCode', '=', scope.branch)
  if (scope.kind === 'own') qb = qb.where(sql<boolean>`1 = 0`)
  return scopedBy(qb, 'payments: payment.read holders, for the HRM branch of the caller (head office: all)')
}

/** Whether the caller may read a payment of `branchCode` (the same rule as `scopedPayments`). */
export async function mayReadPayment(ctx: ModuleContext, c: C, row: { branchCode: string }): Promise<boolean> {
  const scope = await callerScope(ctx, c, 'payment.read')
  if (scope.kind === 'all') return true
  if (scope.kind === 'branch') return row.branchCode === scope.branch
  return false
}

/**
 * `payment.calculate` for a document of `branchCode`: 403 without the permission, 404 for another branch's
 * document (head office works for every branch), so other branches' numbers do not leak.
 */
export function requireCalculate(ctx: ModuleContext, c: C, branchCode: string): Promise<void> {
  return requireFinance(ctx, c, 'payment.calculate', branchCode)
}

/** `payment.export` (the upload file and the posting confirmation), by the same rule as `requireCalculate`. */
export function requireExport(ctx: ModuleContext, c: C, branchCode: string): Promise<void> {
  return requireFinance(ctx, c, 'payment.export', branchCode)
}

async function requireFinance(ctx: ModuleContext, c: C, permission: string, branchCode: string): Promise<void> {
  const me = await caller(ctx, c)
  if (!(await me.can(permission))) throw AppError.forbidden()
  if (!(me.isSuper || me.branch === HEAD_OFFICE_BRANCH || me.branch === branchCode)) throw AppError.notFound()
}
