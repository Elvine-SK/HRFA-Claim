import { now, uuidv7 } from '@elvine-sk/platform-core'
import { inTransaction, uuidBin } from '@elvine-sk/platform-db'
import { NOTIFICATIONS } from '@elvine-sk/platform-notifications'
import type { ModuleContext } from '@elvine-sk/platform-server'
import { addWorkingDays, todayHrm } from '../../shared/dates.ts'
import { appDb } from '../../shared/db.ts'
import { membersOf } from '../agreements/queries.ts'
import { linkedUserId } from '../auth-hrm/users.ts'
import { holidaysBetween } from '../hrm/holidays.ts'
import { dueAgreementRows, DUE_WORKING_DAYS } from './queries.ts'

export const REMINDER_JOB = 'settlements.reminders'
export const REMINDER_KINDS = ['due', 'due_today', 'overdue'] as const
export type ReminderKind = (typeof REMINDER_KINDS)[number]

/** Working days between two overdue notices. */
const OVERDUE_EVERY = 5

/**
 * The reminder of `today` for a trip that returned on `travelTo` (spec §10, §13): `due` before the due date,
 * `due_today` on it, then `overdue` on the first working day after it and every 5 working days. Only today's
 * occurrence counts: missed days are not caught up. Null when nothing is due today.
 */
export function reminderFor(
  today: string,
  travelTo: string,
  holidays: ReadonlySet<string>,
): { kind: ReminderKind; occurrence: string } | null {
  if (today <= travelTo) return null
  const dueDate = addWorkingDays(travelTo, DUE_WORKING_DAYS, holidays)
  if (today < dueDate) return { kind: 'due', occurrence: dueDate }
  if (today === dueDate) return { kind: 'due_today', occurrence: dueDate }
  let occurrence = addWorkingDays(dueDate, 1, holidays)
  if (occurrence > today) return null
  for (let next = addWorkingDays(occurrence, OVERDUE_EVERY, holidays); next <= today; ) {
    occurrence = next
    next = addWorkingDays(occurrence, OVERDUE_EVERY, holidays)
  }
  return { kind: 'overdue', occurrence }
}

/**
 * Sends today's reminders to the members of every agreement whose settlement is due and not submitted. A row per
 * agreement, kind and occurrence makes a rerun send nothing. Members who never signed in are skipped. Returns the
 * number of reminders written.
 */
export async function sendReminders(ctx: ModuleContext, today = todayHrm()): Promise<number> {
  const rows = await dueAgreementRows().where('a.travelTo', '<', today).execute()
  if (!rows.length) return 0
  const from = rows.reduce((m, r) => (r.travelTo < m ? r.travelTo : m), rows[0]!.travelTo)
  // Due dates fall up to a few weeks after today: read the holidays well past it.
  const holidays = await holidaysBetween(from, addWorkingDays(today, 60, new Set()))
  let sent = 0
  for (const row of rows) {
    const reminder = reminderFor(today, row.travelTo, holidays)
    if (!reminder) continue
    const dueDate = addWorkingDays(row.travelTo, DUE_WORKING_DAYS, holidays)
    await inTransaction(async () => {
      const userIds: string[] = []
      for (const m of await membersOf(row.agreementId)) {
        const userId = await linkedUserId(m.eid)
        if (userId) userIds.push(userId)
      }
      const inserted = await appDb()
        .insertInto('settlementReminders')
        .ignore()
        .values({
          id: uuidBin(uuidv7()),
          agreementId: uuidBin(row.agreementId),
          kind: reminder.kind,
          occurrence: reminder.occurrence,
          recipients: userIds.length,
          sentAt: now(),
        })
        .executeTakeFirst()
      if (!inserted.numInsertedOrUpdatedRows) return
      sent += 1
      if (!userIds.length) return
      await ctx.services.get(NOTIFICATIONS).notify({
        userIds,
        type: `settlements.${reminder.kind}`,
        params: { ref: row.ref, dueDate },
        link: row.settlementId ? `/settlements/${row.settlementId}` : `/agreements/${row.agreementId}`,
        subject: { type: 'agreement', id: row.agreementId },
      })
    })
  }
  return sent
}
