import { now, uuidv7 } from '@elvine-sk/platform-core'
import { announceHistory, callProcedure, getContext, inTransaction, uuidArg } from '@elvine-sk/platform-db'
import type { SettlementStatus } from './types.ts'

/** History of a settlement; `lines` is a one-line summary (`description amount CCY`). */
export const settlementHistory = {
  entityType: 'settlement',
  tracked: ['agreementId', 'status', 'caseKind', 'total', 'lines', 'leaderEid', 'lateReason'],
} as const

export const PROCEDURE_ERRORS = {
  'settlements.bad_transition': 409,
}

/**
 * Moves a settlement to `to`; returns the new version. `coreRef` is CORE's reference when a file is posted
 * (`posted`, `cleared`); `rvsNo` the suspense number, stored on `posted`.
 */
export async function transition(
  id: string,
  version: number,
  to: SettlementStatus,
  refs: { coreRef?: string | null; rvsNo?: string | null } = {},
): Promise<number> {
  const { actor, requestId } = getContext()
  const historyId = uuidv7()
  return inTransaction(async () => {
    const [row] = await callProcedure<{ version: number | string }>(
      'settlements_transition',
      [
        uuidArg(id),
        version,
        to,
        refs.coreRef ?? null,
        refs.rvsNo ?? null,
        uuidArg(actor.type === 'user' ? actor.id : null),
        now(),
        requestId ?? null,
        uuidArg(historyId),
      ],
      { errors: PROCEDURE_ERRORS },
    )
    await announceHistory(settlementHistory, historyId)
    return Number(row!.version)
  })
}
