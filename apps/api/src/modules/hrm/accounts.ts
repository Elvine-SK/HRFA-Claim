import { source } from '@elvine-sk/platform-db'
import '../../sources/hrm.ts'

export interface HrmAccount {
  accountNo: string
  accountName: string
  /** Non-deleted accounts in this currency. HRM has no unique key, so more than one is possible (spec §5). */
  count: number
}

/** The employee's account in `ccy`: the newest non-deleted row, with how many there are so callers can warn. */
export async function activeAccount(eid: string, ccy: string): Promise<HrmAccount | null> {
  const rows = await source('hrm')
    .selectFrom('hrmEmployeeAccountCurrency')
    .select(['accountNo', 'accountName'])
    .where('eid', '=', eid)
    .where('ccy', '=', ccy)
    .where('isDeleted', '=', 0)
    .orderBy('createdAt', 'desc')
    .orderBy('id', 'desc')
    .execute()
  if (!rows.length) return null
  return { ...rows[0]!, count: rows.length }
}
