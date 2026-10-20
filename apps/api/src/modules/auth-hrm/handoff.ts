import { createHash } from 'node:crypto'
import { AppError, now } from '@elvine-sk/platform-core'
import { currentDb, source } from '@elvine-sk/platform-db'
import '../../sources/hrm.ts'

/** Longest code accepted. HRM sends 64 hex characters; anything far longer is refused before a lookup. */
const MAX_CODE_LENGTH = 128

export const hrmError = (code: string, message: string) => new AppError(`auth_hrm.${code}`, message, { status: 400 })

export const codeHash = (code: string) => createHash('sha256').update(code, 'utf8').digest('hex')

/**
 * The EID of an unexpired handoff code in HRM's `tb_app_handoff`, read-only. Throws `auth_hrm.code_invalid` for a
 * missing, unknown or expired code. Does not spend the code: `spendHandoff` does, in the sign-in transaction.
 */
export async function lookupHandoff(code: string | undefined): Promise<{ eid: string; hash: string }> {
  if (!code || code.length > MAX_CODE_LENGTH)
    throw hrmError('code_invalid', 'The sign-in link expired or is invalid')
  const hash = codeHash(code)
  const row = await source('hrm')
    .selectFrom('tbAppHandoff')
    .select(['eid', 'expiresAt'])
    .where('codeHash', '=', hash)
    .executeTakeFirst()
  // `expiresAt` is HRM local time; the source reads it in DATA_SOURCE_HRM_TIMEZONE, so both sides are instants.
  if (!row || row.expiresAt.getTime() <= now().getTime())
    throw hrmError('code_invalid', 'The sign-in link expired or is invalid')
  return { eid: row.eid, hash }
}

/** Records the code as used; the primary key refuses a second use, also from a concurrent request. */
export async function spendHandoff(hash: string, eid: string): Promise<void> {
  await currentDb()
    .insertInto('hrmHandoffRedemptions')
    .values({ codeHash: hash, eid, redeemedAt: now() })
    .execute()
    .catch((err: unknown) => {
      if ((err as { errno?: number }).errno === 1062)
        throw hrmError('code_used', 'This sign-in link was already used')
      throw err
    })
}
