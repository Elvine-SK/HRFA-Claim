import { currentDb, sql, uuidBin } from '@elvine-sk/platform-db'
import { appDb } from '../../shared/db.ts'
import { employeeOfUser } from '../auth-hrm/users.ts'

/** Who signed one box of a printed form, and when (`dd/mm/yyyy`, HRM time). */
export interface Signer {
  name: string
  date: string
}

export interface Signers {
  submittedBy: Signer | null
  /** By the workflow's step key (`section_head`, `finance_officer`, …): the approver of that step. */
  steps: Record<string, Signer>
}

const HRM_OFFSET_MS = 7 * 60 * 60 * 1000

/** `dd/mm/yyyy` of an instant in HRM time (`+07:00`). */
export function dmyAt(at: Date): string {
  const [y, m, d] = new Date(at.getTime() + HRM_OFFSET_MS).toISOString().slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/** `dd/mm/yyyy` of a `YYYY-MM-DD` date. */
export function dmy(date: string): string {
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y}`
}

/** The Lao name of the HRM employee linked to the user, else the user's display name. */
async function nameOf(userId: string): Promise<string> {
  const employee = await employeeOfUser(userId)
  if (employee) return `${employee.nameLao} ${employee.snameLao}`
  const user = await appDb().selectFrom('users').select('displayName').where('id', '=', uuidBin(userId)).executeTakeFirst()
  return user?.displayName ?? ''
}

/**
 * The signers of a record from its latest approval request (the platform's own tables; it exposes no reader for
 * them): who submitted it, and per step the approver who approved it in the request's current round. Steps not
 * approved yet are missing. No request: nobody.
 */
export async function signersOf(entityType: string, entityId: string): Promise<Signers> {
  const { rows: requests } = await sql<{ id: string; round: number; submittedBy: string; submittedAt: Date }>`
    SELECT id, round, submitted_by, submitted_at FROM approval_requests
    WHERE entity_type = ${entityType} AND entity_id = ${uuidBin(entityId)}
    ORDER BY submitted_at DESC, id DESC LIMIT 1`.execute(currentDb())
  const request = requests[0]
  if (!request) return { submittedBy: null, steps: {} }
  const { rows } = await sql<{ stepKey: string; userId: string; decidedAt: Date }>`
    SELECT s.step_key, a.user_id, a.decided_at
    FROM approval_steps s JOIN approval_assignments a ON a.step_id = s.id
    WHERE s.request_id = ${uuidBin(request.id)} AND s.round = ${request.round} AND a.status = 'approved'
    ORDER BY a.decided_at`.execute(currentDb())
  const steps: Record<string, Signer> = {}
  for (const r of rows) steps[r.stepKey] = { name: await nameOf(r.userId), date: dmyAt(new Date(r.decidedAt)) }
  return {
    submittedBy: { name: await nameOf(request.submittedBy), date: dmyAt(new Date(request.submittedAt)) },
    steps,
  }
}
