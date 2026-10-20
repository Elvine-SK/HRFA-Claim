import { source } from '@elvine-sk/platform-db'
import '../../sources/hrm.ts'

/** EIDs among `eids` with at least one HRM session (`tb_current_login`; HRM deletes the row on logout, ຂ6). */
export async function loggedInEids(eids: string[]): Promise<Set<string>> {
  if (!eids.length) return new Set()
  const rows = await source('hrm')
    .selectFrom('tbCurrentLogin')
    .select('eid')
    .distinct()
    .where('eid', 'in', eids)
    .execute()
  return new Set(rows.map((r) => r.eid))
}
