import type { SessionStore } from '@elvine-sk/platform-auth'
import { AppError, ErrorCodes, now } from '@elvine-sk/platform-core'
import { currentDb, isSourceUnavailable } from '@elvine-sk/platform-db'
import { selectableEmployees } from '../hrm/employees.ts'
import { loggedInEids } from '../hrm/logins.ts'

const BATCH = 500

export const SYNC_JOB = 'auth_hrm.sync_sessions'

/**
 * Below `minUsers` signed-in users the guard is off; above it, a run that would sign out more than
 * `maxMissingShare` of them is refused: an emptied or lagging `tb_current_login` must not end everyone's session.
 */
export interface SyncGuard {
  minUsers: number
  maxMissingShare: number
}

const DEFAULT_GUARD: SyncGuard = { minUsers: 10, maxMissingShare: 0.5 }

const norm = (eid: string) => eid.trim().toUpperCase()

const unavailable = (err: unknown) =>
  (err instanceof AppError && err.code === ErrorCodes.sourceUnavailable) || isSourceUnavailable(err)

/**
 * Ends the app sessions of HRM users who logged out of HRM (HRM deletes their `tb_current_login` row on logout and
 * on its 4-hour idle timeout, ຂ6) or who are no longer selectable (deleted, unapproved, not working, subsidiary).
 * Returns how many sessions were revoked. While HRM is unreachable nothing is revoked: the next run catches up.
 * Throws, revoking nothing, when the guard trips; the job then shows as failed.
 */
export async function syncHrmSessions(
  sessions: Pick<SessionStore, 'revokeAllForUser'>,
  options: { guard?: SyncGuard } = {},
): Promise<number> {
  const guard = options.guard ?? DEFAULT_GUARD
  const signedIn = await currentDb()
    .selectFrom('hrmUserLinks')
    .innerJoin('sessions', 'sessions.userId', 'hrmUserLinks.userId')
    .select(['hrmUserLinks.eid', 'hrmUserLinks.userId'])
    .distinct()
    .where('sessions.revokedAt', 'is', null)
    .where('sessions.absoluteExpiresAt', '>', now())
    .where('sessions.idleExpiresAt', '>', now())
    .execute()

  const keep = new Set<string>()
  try {
    for (let i = 0; i < signedIn.length; i += BATCH) {
      const eids = signedIn.slice(i, i + BATCH).map((r) => r.eid)
      const [present, selectable] = await Promise.all([
        loggedInEids(eids),
        selectableEmployees().select('hrmEmployee.eid').where('hrmEmployee.eid', 'in', eids).execute(),
      ])
      const presentKeys = new Set([...present].map(norm))
      for (const row of selectable)
        if (row.eid && presentKeys.has(norm(row.eid))) keep.add(norm(row.eid))
    }
  } catch (err) {
    if (unavailable(err)) return 0
    throw err
  }

  const leaving = signedIn.filter((r) => !keep.has(norm(r.eid)))
  if (signedIn.length >= guard.minUsers && leaving.length / signedIn.length > guard.maxMissingShare)
    throw new Error(
      `auth-hrm: refusing to sign out ${leaving.length} of ${signedIn.length} HRM users at once; check tb_current_login`,
    )
  let revoked = 0
  for (const row of leaving) revoked += await sessions.revokeAllForUser(row.userId, 'hrm_logout')
  return revoked
}
