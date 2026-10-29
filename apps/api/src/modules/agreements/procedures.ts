import { now, uuidv7 } from '@elvine-sk/platform-core'
import { announceHistory, callProcedure, getContext, inTransaction, uuidArg } from '@elvine-sk/platform-db'
import { todayHrm, yearOf } from '../../shared/dates.ts'
import type { AgreementStatus } from './types.ts'

/** History of an agreement; `members` is a summary of the member rows (EID and role flags). */
export const agreementHistory = {
  entityType: 'agreement',
  tracked: [
    'formType',
    'subject',
    'title',
    'reference',
    'docNo',
    'docDate',
    'branchCode',
    'travelFrom',
    'travelTo',
    'fromProvinceCode',
    'toProvinceCode',
    'provinceCode',
    'fromDistrictCode',
    'toDistrictCode',
    'overnight',
    'sameDay50Km',
    'countryIso2',
    'borderRouteId',
    'borderRouteOther',
    'policyOption',
    'hasAdvance',
    'status',
    'members',
  ],
} as const

export const PROCEDURE_ERRORS = {
  'agreements.bad_transition': 409,
  'agreements.reason_required': 422,
}

/** The next REF of the current HRM year, `TA-YYYY-NNNNNN`. Call inside the transaction that saves the agreement. */
export async function nextRef(): Promise<string> {
  const [row] = await callProcedure<{ ref: string }>('agreements_next_ref', [yearOf(todayHrm())])
  return row!.ref
}

/** Moves an agreement to `to` (and records why, for a cancellation); returns the new version. */
export async function transition(
  id: string,
  version: number,
  to: AgreementStatus,
  reason: string | null = null,
): Promise<number> {
  const { actor, requestId } = getContext()
  const historyId = uuidv7()
  return inTransaction(async () => {
    const [row] = await callProcedure<{ version: number | string }>(
      'agreements_transition',
      [
        uuidArg(id),
        version,
        to,
        reason,
        uuidArg(actor.type === 'user' ? actor.id : null),
        now(),
        requestId ?? null,
        uuidArg(historyId),
      ],
      { errors: PROCEDURE_ERRORS },
    )
    await announceHistory(agreementHistory, historyId)
    return Number(row!.version)
  })
}
