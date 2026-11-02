import { AppError } from '@elvine-sk/platform-core'
import type { Currency, ZoneKind } from '../travel-master/lookups.ts'
import { divRoundCents, fitsAmount, fromCents, toCents, type Amount } from '../travel-master/money.ts'
import type { CaseKind, ExpenseType } from './types.ts'

/** A problem with one expense line; `path` is relative to the line (`crossRate`). */
export class LineError extends Error {
  constructor(
    readonly code: string,
    readonly path: string,
    message: string,
  ) {
    super(message)
  }
}

export interface LineInput {
  currency: string
  amount: Amount
  crossRate: string | null
  expenseType: ExpenseType | null
}

/**
 * The line's amount in the settlement's currency: as entered when the currencies match (no cross rate allowed),
 * else amount ÷ cross rate, half-up to cents (ກ27).
 */
export function settledAmountOf(line: LineInput, settlementCurrency: Currency): Amount {
  if (line.currency === settlementCurrency) {
    if (line.crossRate !== null)
      throw new LineError('settlements.cross_rate_not_allowed', 'crossRate', 'A line in the advance currency takes no cross rate')
    return fromCents(toCents(line.amount))
  }
  if (line.crossRate === null)
    throw new LineError('settlements.cross_rate_required', 'crossRate', 'A line in another currency needs its cross rate')
  return divRoundCents(line.amount, line.crossRate)
}

export interface Totals {
  total: Amount
  /** advance − total; negative when overspent. */
  remaining: Amount
  caseKind: CaseKind
  /** What the holder pays back: max(remaining, 0). */
  returned: Amount
  /** What the holder is reimbursed: max(−remaining, 0). */
  excess: Amount
  /** What waits in the holding account until the clearing file: min(total, advance), overseas only. */
  holding: Amount
  byType: Record<ExpenseType, Amount>
  needsClearing: boolean
}

/** Totals and case of a settlement (spec §10); overseas lines count as fare (spec §11). */
export function totalsOf(input: {
  advance: Amount
  zoneKind: ZoneKind
  lines: { settledAmount: Amount; expenseType: ExpenseType | null }[]
}): Totals {
  const advance = toCents(input.advance)
  const byType: Record<ExpenseType, bigint> = { fuel: 0n, fare: 0n }
  for (const l of input.lines) byType[l.expenseType ?? 'fare'] += toCents(l.settledAmount)
  const total = byType.fuel + byType.fare
  if (!fitsAmount(fromCents(total)))
    throw new AppError('payments.amount_too_large', 'An amount has more than 13 whole digits', {
      status: 422,
      details: [{ path: 'lines', code: 'payments.amount_too_large', message: `total ${fromCents(total)}` }],
    })
  const remaining = advance - total
  const caseKind: CaseKind =
    total === 0n ? 'unused' : remaining > 0n ? 'partly_used' : remaining === 0n ? 'fully_used' : 'overspent'
  const holding = input.zoneKind === 'overseas' ? (total < advance ? total : advance) : 0n
  return {
    total: fromCents(total),
    remaining: fromCents(remaining),
    caseKind,
    returned: fromCents(remaining > 0n ? remaining : 0n),
    excess: fromCents(remaining < 0n ? -remaining : 0n),
    holding: fromCents(holding),
    byType: { fuel: fromCents(byType.fuel), fare: fromCents(byType.fare) },
    needsClearing: holding > 0n,
  }
}
