import { now, uuidv7 } from '@elvine-sk/platform-core'
import { announceHistory, callProcedure, getContext, inTransaction, uuidArg } from '@elvine-sk/platform-db'
import type { PaymentStatus } from './types.ts'

/** History of a payment; `bills` and `totals` are one-line summaries (`eid:night=amount`, `CCY amount`). */
export const paymentHistory = {
  entityType: 'payment',
  tracked: ['agreementId', 'branchCode', 'status', 'bills', 'totals'],
} as const

export const PROCEDURE_ERRORS = {
  'payments.bad_transition': 409,
}

/** Moves a payment to `to` (with CORE's reference when it is posted); returns the new version. */
export async function transition(
  id: string,
  version: number,
  to: PaymentStatus,
  coreRef: string | null = null,
): Promise<number> {
  const { actor, requestId } = getContext()
  const historyId = uuidv7()
  return inTransaction(async () => {
    const [row] = await callProcedure<{ version: number | string }>(
      'payments_transition',
      [
        uuidArg(id),
        version,
        to,
        coreRef,
        uuidArg(actor.type === 'user' ? actor.id : null),
        now(),
        requestId ?? null,
        uuidArg(historyId),
      ],
      { errors: PROCEDURE_ERRORS },
    )
    await announceHistory(paymentHistory, historyId)
    return Number(row!.version)
  })
}
