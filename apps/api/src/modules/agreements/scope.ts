import { requireUser } from '@elvine-sk/platform-auth'
import { AUTHORIZATION } from '@elvine-sk/platform-authorization'
import { AppError } from '@elvine-sk/platform-core'
import { scopedBy, uuidBin, type ScopedSelect, type SelectQueryBuilder } from '@elvine-sk/platform-db'
import type { ModuleContext } from '@elvine-sk/platform-server'
import { employeeOfUser } from '../auth-hrm/users.ts'
import { HEAD_OFFICE_BRANCH } from './types.ts'

/** A request context (the app has no direct `hono` dependency). */
export type C = Parameters<typeof requireUser>[0]

/**
 * Who sees which agreements (spec §12). The branch comes from the caller's HRM employee record, which platform
 * policies cannot see (no `subjectAttributes` hook in the generated platform modules), so the rule lives here:
 * - `all`: super administrators, and `agreement.read` holders at head office;
 * - `branch`: `agreement.read` holders elsewhere, for the agreements of their HRM branch;
 * - `own`: everyone else, for the agreements they are a member of or created.
 */
export type CallerScope =
  | { kind: 'all' }
  | { kind: 'branch'; branch: string }
  | { kind: 'own'; userId: string; eid: string | null }

interface Caller {
  userId: string
  isSuper: boolean
  branch: string | null
  eid: string | null
  can: (permission: string) => Promise<boolean>
}

const callers = new WeakMap<C, Promise<Caller>>()

/** The caller as this module sees them, loaded once per request. */
export function caller(ctx: ModuleContext, c: C): Promise<Caller> {
  let found = callers.get(c)
  if (!found) {
    found = loadCaller(ctx, c)
    callers.set(c, found)
  }
  return found
}

async function loadCaller(ctx: ModuleContext, c: C): Promise<Caller> {
  const userId = requireUser(c).user.id
  const authz = ctx.services.get(AUTHORIZATION)
  const subject = await authz.subjectOf(c)
  const employee = await employeeOfUser(userId)
  return {
    userId,
    isSuper: Boolean(subject?.access.isSuper),
    branch: employee?.branchCode ?? null,
    eid: employee?.eid ?? null,
    can: async (permission) => {
      try {
        await authz.requirePermission(c, permission)
        return true
      } catch (err) {
        if (err instanceof AppError && err.status === 403) return false
        throw err
      }
    },
  }
}

/** The caller's scope for `permission` (`agreement.read` for agreements; payments pass `payment.read`). */
export async function callerScope(ctx: ModuleContext, c: C, permission = 'agreement.read'): Promise<CallerScope> {
  const me = await caller(ctx, c)
  if (me.isSuper) return { kind: 'all' }
  if (me.branch && (await me.can(permission)))
    return me.branch === HEAD_OFFICE_BRANCH ? { kind: 'all' } : { kind: 'branch', branch: me.branch }
  return { kind: 'own', userId: me.userId, eid: me.eid }
}

/** `qb` over `agreements` (aliased `a`) restricted to what the caller may read. */
export async function scopedAgreements<O>(
  ctx: ModuleContext,
  c: C,
  qb: SelectQueryBuilder<any, any, O>,
): Promise<ScopedSelect<O>> {
  const scope = await callerScope(ctx, c)
  if (scope.kind === 'branch') qb = qb.where('a.branchCode', '=', scope.branch)
  if (scope.kind === 'own') {
    const { userId, eid } = scope
    qb = qb.where((eb) =>
      eb.or([
        eb('a.createdBy', '=', uuidBin(userId)),
        eb.exists(
          eb
            .selectFrom('agreementMembers as m')
            .select('m.id')
            .whereRef('m.agreementId', '=', 'a.id')
            .where('m.eid', '=', eid ?? ''),
        ),
      ]),
    )
  }
  return scopedBy(qb, 'agreements: the HRM branch of the caller, or their own and their memberships')
}

/** Whether the caller may read `row` (the same rule as `scopedAgreements`). */
export async function mayRead(
  ctx: ModuleContext,
  c: C,
  row: { branchCode: string; createdBy: string | null; memberEids: string[] },
): Promise<boolean> {
  const scope = await callerScope(ctx, c)
  if (scope.kind === 'all') return true
  if (scope.kind === 'branch') return row.branchCode === scope.branch
  return row.createdBy === scope.userId || (scope.eid !== null && row.memberEids.includes(scope.eid))
}

/** `agreement.create`, for the caller's own HRM branch or, at head office, any branch (spec §8). */
export async function mayCreateFor(ctx: ModuleContext, c: C, branch: string): Promise<boolean> {
  const me = await caller(ctx, c)
  if (!(await me.can('agreement.create'))) return false
  if (me.isSuper || me.branch === HEAD_OFFICE_BRANCH) return true
  return me.branch === branch
}
