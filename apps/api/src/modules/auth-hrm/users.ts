import { now, uuidv7 } from '@elvine-sk/platform-core'
import { createdStamp, currentDb, inTransaction, sql, uuidBin } from '@elvine-sk/platform-db'
import type { HrmEmployee } from '../hrm/employees.ts'
import { EMPLOYEE_ROLE_KEY } from './migrations.ts'

/** The platform user linked to an EID, if any. */
export async function linkedUserId(eid: string): Promise<string | null> {
  const row = await currentDb().selectFrom('hrmUserLinks').select('userId').where('eid', '=', eid).executeTakeFirst()
  return row?.userId ?? null
}

/** The EID linked to a platform user, if any. */
export async function linkedEid(userId: string): Promise<string | null> {
  const row = await currentDb()
    .selectFrom('hrmUserLinks')
    .select('eid')
    .where('userId', '=', uuidBin(userId))
    .executeTakeFirst()
  return row?.eid ?? null
}

/**
 * The platform user of an HRM employee, created on first use: username = EID, no e-mail, no password, no MFA
 * (HRM's login is the gate), and the `employee` role (ຂ8). Also used to create approvers who have not signed in yet.
 */
export async function ensureHrmUser(
  employee: Pick<HrmEmployee, 'eid' | 'nameLao' | 'snameLao'>,
): Promise<{ userId: string; created: boolean }> {
  return inTransaction(async () => {
    const existing = await linkedUserId(employee.eid)
    if (existing) return { userId: existing, created: false }
    const id = uuidv7()
    const displayName = `${employee.nameLao} ${employee.snameLao}`.trim().slice(0, 128) || employee.eid
    await currentDb()
      .insertInto('users')
      .values({ ...createdStamp(id), username: employee.eid, email: null, displayName, status: 'active' })
      .execute()
    await currentDb()
      .insertInto('hrmUserLinks')
      .values({ eid: employee.eid, userId: uuidBin(id), createdAt: now(), lastLoginAt: null })
      .execute()
    // A brand-new user has no cached access yet, so a direct insert (as `grantSuper` does) needs no cache bump.
    await sql`INSERT IGNORE INTO user_roles (user_id, role_id, created_at)
      SELECT ${uuidBin(id)}, id, ${now()} FROM roles WHERE \`key\` = ${EMPLOYEE_ROLE_KEY}`.execute(currentDb())
    return { userId: id, created: true }
  })
}
