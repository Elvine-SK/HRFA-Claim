import { source, sql } from '@elvine-sk/platform-db'
import '../../sources/hrm.ts'

/**
 * HRM's holidays (`tb_holiday`) from `from` to `to`, both included, as `YYYY-MM-DD`. A row whose `status` is not
 * `Y` is switched off and left out; a row without a date is ignored.
 */
export async function holidaysBetween(from: string, to: string): Promise<Set<string>> {
  const rows = await source('hrm')
    .selectFrom('tbHoliday')
    .select(sql<string>`DATE_FORMAT(holiday_date, '%Y-%m-%d')`.as('day'))
    .where('holidayDate', '>=', from)
    .where('holidayDate', '<=', to)
    .where((eb) => eb.or([eb('status', '=', 'Y'), eb('status', 'is', null)]))
    .orderBy('holidayDate')
    .execute()
  return new Set(rows.map((r) => r.day))
}
