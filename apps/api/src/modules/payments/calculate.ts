import { daysInclusive } from '../../shared/dates.ts'
import type { FormType, PolicyOption } from '../agreements/types.ts'
import type { Currency, ZoneKind } from '../travel-master/lookups.ts'
import {
  compareAmounts,
  divCeilWhole,
  fitsAmount,
  fromCents,
  mulAmount,
  mulDivCeilWhole,
  toCents,
  type Amount,
} from '../travel-master/money.ts'
import { COMPONENTS, type Component } from './types.ts'

export interface CalcMember {
  eid: string
  departureDate: string
  returnDate: string
  daysSubtracted: number
  hostMeals: number
  privateCarKm: number | null
  isAdvanceHolder: boolean
}

export interface CalcAgreement {
  formType: FormType
  policyOption: PolicyOption
  overnight: boolean | null
  sameDayOver50km: boolean | null
  hasAdvance: boolean
  travelFrom: string
  travelTo: string
  zoneKind: ZoneKind
  members: CalcMember[]
}

/** The rates of one member, taken on that member's departure date. */
export interface MemberRates {
  daily: Amount
  accommodation: Amount
  personal: Amount | null
  currency: Currency
  effectiveFrom: string
  sameDay: Amount | null
  fuelPrice: Amount | null
  kmPerLitre: Amount
}

export interface PaymentItem {
  eid: string
  component: Component
  currency: Currency
  rate: Amount
  count: number
  /** Negative for `meal_deduction`. */
  amount: Amount
  /** Where the figure comes from, e.g. `daily LAK rate from 2026-01-01`, `÷3 rounded up`, `night 8 bill`. */
  basis: string
}

export class CalcError extends Error {
  constructor(
    readonly code: string,
    readonly path: string,
  ) {
    super(code)
    this.name = 'CalcError'
  }
}

/** Nights 1-7 are paid at the rate; from night 8 Finance's bill counts (regulation 3.1.5). */
const RATE_NIGHTS = 7

const DROPS_DAILY: ReadonlySet<PolicyOption> = new Set(['host_meals', 'host_meals_accommodation'])
const DROPS_ACCOMMODATION: ReadonlySet<PolicyOption> = new Set(['host_accommodation', 'host_meals_accommodation'])
const FUEL_FORMS: ReadonlySet<FormType> = new Set(['domestic', 'district', 'border'])

/**
 * Nights Finance enters a bill for (regulation 3.1.5): day 8 onward of a form 1 trip whose accommodation BCEL pays,
 * nights 8 … (days − 1) of the member. Night `n` is the night after day `n`.
 */
export function billedNights(a: Pick<CalcAgreement, 'formType' | 'policyOption'>, m: CalcMember): number[] {
  if (a.formType !== 'domestic' || DROPS_ACCOMMODATION.has(a.policyOption)) return []
  const days = Math.max(daysInclusive(m.departureDate, m.returnDate) - m.daysSubtracted, 0)
  const nights: number[] = []
  for (let night = RATE_NIGHTS + 1; night <= days - 1; night++) nights.push(night)
  return nights
}

/** Cents of a possibly negative amount; no 13-digit check, so a too-large result reaches the amount_too_large test. */
const signedCents = (a: Amount): bigint => {
  const [whole = '0', frac = ''] = a.replace(/^-/, '').split('.')
  const cents = BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'))
  return a.startsWith('-') ? -cents : cents
}

export function calculate(
  a: CalcAgreement,
  rates: Map<string, MemberRates | null>,
  advance: { amount: Amount; currency: Currency; effectiveFrom: string } | null,
  bills: Map<string, Map<number, Amount>>,
): PaymentItem[] {
  const items: PaymentItem[] = []
  const dropDaily = DROPS_DAILY.has(a.policyOption)
  const dropAccommodation = DROPS_ACCOMMODATION.has(a.policyOption)
  const sameDayTrip = a.formType === 'district' && a.overnight !== true
  const noAllowance = sameDayTrip && a.sameDayOver50km !== true

  a.members.forEach((m, n) => {
    const path = (field: string) => `members.${n}.${field}`
    const mine: PaymentItem[] = []
    const push = (component: Component, currency: Currency, rate: Amount, count: number, amount: Amount, basis: string) => {
      if (signedCents(amount) === 0n) return
      mine.push({ eid: m.eid, component, currency, rate, count, amount, basis })
    }

    const days = Math.max(daysInclusive(m.departureDate, m.returnDate) - m.daysSubtracted, 0)
    const nights = Math.max(days - 1, 0)
    const km = m.privateCarKm ?? 0
    if (km > 0 && !FUEL_FORMS.has(a.formType)) throw new CalcError('payments.fuel_not_overseas', path('privateCarKm'))

    const r = rates.get(m.eid) ?? null
    const paidDaily = !noAllowance && !dropDaily
    const paysRateItem =
      km > 0 ||
      paidDaily ||
      (!noAllowance && !sameDayTrip && !dropAccommodation) ||
      (!noAllowance && a.formType === 'overseas')
    if (paysRateItem && !r) throw new CalcError('payments.rate_missing', path('departureDate'))

    if (r && !noAllowance) {
      const basis = `${r.currency} rate from ${r.effectiveFrom}`
      if (sameDayTrip) {
        if (!dropDaily) {
          if (r.sameDay === null) throw new CalcError('payments.same_day_rate_missing', path('departureDate'))
          push('same_day', r.currency, r.sameDay, days, mulAmount(r.sameDay, days), `same day ${basis}`)
        }
      } else {
        if (!dropDaily) {
          const dailyTotal = mulAmount(r.daily, days)
          push('daily', r.currency, r.daily, days, dailyTotal, `daily ${basis}`)
          if (m.hostMeals > 0) {
            const perMeal = divCeilWhole(r.daily, 3)
            let deduction = mulAmount(perMeal, m.hostMeals)
            if (compareAmounts(deduction, dailyTotal) > 0) deduction = dailyTotal
            push('meal_deduction', r.currency, perMeal, m.hostMeals, `-${deduction}`, '÷3 rounded up')
          }
        }
        if (!dropAccommodation) {
          // Day 8 billing is form 1 only; form 2 overnight pays every night at the rate.
          const rateNights = a.formType === 'domestic' ? Math.min(nights, RATE_NIGHTS) : nights
          push('accommodation', r.currency, r.accommodation, rateNights, mulAmount(r.accommodation, rateNights), `accommodation ${basis}`)
          if (a.formType === 'domestic') {
            for (const night of billedNights(a, m)) {
              const billed = bills.get(m.eid)?.get(night)
              if (billed === undefined) continue
              const paid = compareAmounts(billed, r.accommodation) > 0 ? r.accommodation : billed
              push('billed_accommodation', r.currency, paid, 1, fromCents(toCents(paid)), `night ${night} bill`)
            }
          }
        }
        if (a.formType === 'overseas' && r.personal !== null) {
          push('personal', r.currency, r.personal, 1, fromCents(toCents(r.personal)), `personal ${basis}`)
        }
      }
    }

    if (km > 0 && r) {
      if (r.fuelPrice === null) throw new CalcError('payments.fuel_price_missing', path('privateCarKm'))
      push('fuel', 'LAK', r.fuelPrice, km, mulDivCeilWhole(r.fuelPrice, km, r.kmPerLitre), `fuel ÷ ${r.kmPerLitre} km per litre`)
    }

    if (a.hasAdvance && m.isAdvanceHolder) {
      if (!advance) throw new CalcError('payments.advance_band_missing', 'agreement')
      push('advance', advance.currency, advance.amount, 1, fromCents(toCents(advance.amount)), `advance from ${advance.effectiveFrom}`)
    }

    for (const it of mine) {
      if (!fitsAmount(it.amount.replace(/^-/, ''))) throw new CalcError('payments.amount_too_large', path('departureDate'))
    }
    items.push(...mine.sort((x, y) => COMPONENTS.indexOf(x.component) - COMPONENTS.indexOf(y.component)))
  })

  const totals = new Map<Currency, bigint>()
  for (const it of items) totals.set(it.currency, (totals.get(it.currency) ?? 0n) + signedCents(it.amount))
  for (const total of totals.values()) {
    if (!fitsAmount(fromCents(total).replace(/^-/, ''))) throw new CalcError('payments.amount_too_large', 'agreement')
  }
  return items
}
