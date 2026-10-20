import type { SessionStore } from '@elvine-sk/platform-auth'
import { AppError, ErrorCodes, now } from '@elvine-sk/platform-core'
import { currentDb, isSourceUnavailable } from '@elvine-sk/platform-db'
import { loggedInEids } from '../hrm/logins.ts'

const BATCH = 500

export const SYNC_JOB = 'auth_hrm.sync_sessions'

/**
 * Ends the app sessions of HRM users who logged out of HRM: HRM deletes their `tb_current_login` row on logout
 * and on its 4-hour idle timeout (ຂ6). Returns how many sessions were revoked. While HRM is unreachable nothing is
 * revoked: the next run catches up.
 */
export async function syncHrmSessions(sessions: Pick<SessionStore, 'revokeAllForUser'>): Promise<number> {
  const signedIn = await currentDb()
    .selectFrom('hrmUserLinks')
    .innerJoin('sessions', 'sessions.userId', 'hrmUserLinks.userId')
    .select(['hrmUserLinks.eid', 'hrmUserLinks.userId'])
    .distinct()
    .where('sessions.revokedAt', 'is', null)
    .where('sessions.absoluteExpiresAt', '>', now())
    .where('sessions.idleExpiresAt', '>', now())
    .execute()

  let revoked = 0
  for (let i = 0; i < signedIn.length; i += BATCH) {
    const batch = signedIn.slice(i, i + BATCH)
    let present: Set<string>
    try {
      present = await loggedInEids(batch.map((r) => r.eid))
    } catch (err) {
      if ((err instanceof AppError && err.code === ErrorCodes.sourceUnavailable) || isSourceUnavailable(err))
        return revoked
      throw err
    }
    for (const row of batch)
      if (!present.has(row.eid)) revoked += await sessions.revokeAllForUser(row.userId, 'hrm_logout')
  }
  return revoked
}
