import { describe, expect, it } from 'vitest'
import {
  CalcError,
  calculate,
  type CalcAgreement,
  type CalcMember,
  type MemberRates,
} from '../src/modules/payments/calculate.ts'
import { POSTING_COMPONENT } from '../src/modules/payments/types.ts'
import type { PolicyOption } from '../src/modules/agreements/types.ts'

const D: MemberRates = {
  daily: '150000',
  accommodation: '200000',
  personal: null,
  currency: 'LAK',
  effectiveFrom: '2026-01-01',
  sameDay: '150000',
  fuelPrice: '25000',
  kmPerLitre: '7',
}
const OA1: MemberRates = { ...D, daily: '100.00', accommodation: '120.00', personal: '300.00', currency: 'USD', sameDay: null }

const member = (over: Partial<CalcMember> = {}): CalcMember => ({
  eid: 'E1',
  departureDate: '2030-11-02',
  returnDate: '2030-11-05',
  daysSubtracted: 0,
  hostMeals: 0,
  privateCarKm: null,
  isAdvanceHolder: false,
  ...over,
})
const agreement = (over: Partial<CalcAgreement> = {}): CalcAgreement => ({
  formType: 'domestic',
  policyOption: 'bcel_all',
  overnight: null,
  sameDayOver50km: null,
  hasAdvance: false,
  travelFrom: '2030-11-02',
  travelTo: '2030-11-05',
  zoneKind: 'domestic',
  members: [member()],
  ...over,
})
const rows = (a: CalcAgreement, r: MemberRates | null = D, bills = new Map<string, Map<number, string>>(), adv = null as never) =>
  calculate(a, new Map(a.members.map((m) => [m.eid, r])), adv, bills).map((i) => [i.eid, i.component, i.currency, i.count, i.amount])

const oversea = (over: Partial<CalcAgreement> = {}) => agreement({ formType: 'overseas', zoneKind: 'overseas', ...over })

describe('payment calculation', () => {
  it('form 1, 4 days: daily and nights', () => {
    expect(rows(agreement())).toEqual([
      ['E1', 'daily', 'LAK', 4, '600000.00'],
      ['E1', 'accommodation', 'LAK', 3, '600000.00'],
    ])
  })

  it('days subtracted by hand', () => {
    expect(rows(agreement({ members: [member({ daysSubtracted: 1 })] }))).toEqual([
      ['E1', 'daily', 'LAK', 3, '450000.00'],
      ['E1', 'accommodation', 'LAK', 2, '400000.00'],
    ])
  })

  it.each<[PolicyOption, string[]]>([
    ['bcel_all', ['daily', 'accommodation', 'personal']],
    ['host_travel', ['daily', 'accommodation', 'personal']],
    ['host_accommodation', ['daily', 'personal']],
    ['host_meals', ['accommodation', 'personal']],
    ['host_meals_accommodation', ['personal']],
  ])('form 3 policy %s', (policyOption, components) => {
    const got = rows(oversea({ policyOption }), OA1)
    expect(got.map((r) => r[1])).toEqual(components)
    expect(got.find((r) => r[1] === 'personal')).toEqual(['E1', 'personal', 'USD', 1, '300.00'])
  })

  it.each<[string, CalcAgreement, unknown[][]]>([
    [
      'fraction rounds up per meal',
      oversea({ members: [member({ hostMeals: 2 })] }),
      [
        ['E1', 'daily', 'USD', 4, '400.00'],
        ['E1', 'meal_deduction', 'USD', 2, '-68.00'],
        ['E1', 'accommodation', 'USD', 3, '360.00'],
        ['E1', 'personal', 'USD', 1, '300.00'],
      ],
    ],
    [
      'form 1, one meal',
      agreement({ members: [member({ hostMeals: 1 })] }),
      [
        ['E1', 'daily', 'LAK', 4, '600000.00'],
        ['E1', 'meal_deduction', 'LAK', 1, '-50000.00'],
        ['E1', 'accommodation', 'LAK', 3, '600000.00'],
      ],
    ],
    [
      'deduction capped at the daily total',
      oversea({ members: [member({ hostMeals: 12 })] }),
      [
        ['E1', 'daily', 'USD', 4, '400.00'],
        ['E1', 'meal_deduction', 'USD', 12, '-400.00'],
        ['E1', 'accommodation', 'USD', 3, '360.00'],
        ['E1', 'personal', 'USD', 1, '300.00'],
      ],
    ],
  ])('meals: %s', (_n, a, expected) => {
    expect(rows(a, a.formType === 'overseas' ? OA1 : D)).toEqual(expected)
  })

  it('form 2 overnight works as form 1', () => {
    expect(rows(agreement({ formType: 'district', overnight: true }))).toEqual(rows(agreement()))
  })

  it('form 2 same day 50 km or more', () => {
    const a = agreement({
      formType: 'district',
      overnight: false,
      sameDayOver50km: true,
      members: [member({ returnDate: '2030-11-02' })],
    })
    expect(rows(a)).toEqual([['E1', 'same_day', 'LAK', 1, '150000.00']])
  })

  it('form 2 same day under 50 km pays nothing, even with no rate row', () => {
    const a = agreement({ formType: 'district', overnight: false, sameDayOver50km: false })
    expect(rows(a)).toEqual([])
    expect(rows(a, null)).toEqual([])
  })

  it('form 2 same day without a same-day rate', () => {
    const a = agreement({ formType: 'district', overnight: false, sameDayOver50km: true })
    expect(() => rows(a, { ...D, sameDay: null })).toThrow(expect.objectContaining({ code: 'payments.same_day_rate_missing' }))
  })

  it('form 4 pays zone rates in LAK, no personal; advance in USD', () => {
    const a = agreement({ formType: 'border', zoneKind: 'border', hasAdvance: true, members: [member({ isAdvanceHolder: true })] })
    const got = calculate(a, new Map([['E1', { ...D, personal: '50' }]]), { amount: '200.00', currency: 'USD', effectiveFrom: '2026-01-01' }, new Map())
    expect(got.map((i) => [i.component, i.currency, i.amount])).toEqual([
      ['daily', 'LAK', '600000.00'],
      ['accommodation', 'LAK', '600000.00'],
      ['advance', 'USD', '200.00'],
    ])
  })

  describe('fuel', () => {
    it('form 1, 100 km', () => {
      const a = agreement({ members: [member({ privateCarKm: 100 })] })
      expect(rows(a).find((r) => r[1] === 'fuel')).toEqual(['E1', 'fuel', 'LAK', 100, '357143.00'])
    })
    it('refused on form 3', () => {
      const a = oversea({ members: [member({ privateCarKm: 100 })] })
      expect(() => rows(a, OA1)).toThrow(expect.objectContaining({ code: 'payments.fuel_not_overseas' }))
    })
    it('needs a fuel price', () => {
      const a = agreement({ members: [member({ privateCarKm: 100 })] })
      expect(() => rows(a, { ...D, fuelPrice: null })).toThrow(
        expect.objectContaining({ code: 'payments.fuel_price_missing', path: 'members.0.privateCarKm' }),
      )
    })
  })

  describe('day 8 onward', () => {
    const long = { returnDate: '2030-11-11' } // 10 days, 9 nights
    it('form 1: 7 nights at the rate, the rest from bills, capped', () => {
      const a = agreement({ members: [member(long)] })
      const bills = new Map([['E1', new Map([[8, '150000'], [9, '999999']])]])
      const got = rows(a, D, bills)
      expect(got.find((r) => r[1] === 'accommodation')).toEqual(['E1', 'accommodation', 'LAK', 7, '1400000.00'])
      expect(got.filter((r) => r[1] === 'billed_accommodation').map((r) => r[4])).toEqual(['150000.00', '200000.00'])
    })
    it('a night without a bill adds nothing; a zero bill is left out', () => {
      const a = agreement({ members: [member(long)] })
      expect(rows(a, D, new Map([['E1', new Map([[8, '0']])]])).some((r) => r[1] === 'billed_accommodation')).toBe(false)
    })
    it('form 2 overnight: 9 nights at the rate, no billed nights', () => {
      const a = agreement({ formType: 'district', overnight: true, members: [member(long)] })
      const got = rows(a, D, new Map([['E1', new Map([[8, '150000']])]]))
      expect(got.find((r) => r[1] === 'accommodation')).toEqual(['E1', 'accommodation', 'LAK', 9, '1800000.00'])
      expect(got.some((r) => r[1] === 'billed_accommodation')).toBe(false)
    })
  })

  describe('advance', () => {
    const adv = { amount: '300000', currency: 'LAK' as const, effectiveFrom: '2026-01-01' }
    const two = [member({ isAdvanceHolder: true }), member({ eid: 'E2' })]
    const run = (a: CalcAgreement, advance = adv as typeof adv | null) =>
      calculate(a, new Map(a.members.map((m) => [m.eid, D])), advance, new Map()).filter((i) => i.component === 'advance')
    it('once, on the holder only', () => {
      expect(run(agreement({ hasAdvance: true, members: two })).map((i) => [i.eid, i.amount, i.count])).toEqual([['E1', '300000.00', 1]])
    })
    it('none when the agreement has no advance', () => {
      expect(run(agreement({ hasAdvance: false, members: two }))).toEqual([])
    })
    it('band missing', () => {
      expect(() => run(agreement({ hasAdvance: true, members: two }), null)).toThrow(
        expect.objectContaining({ code: 'payments.advance_band_missing', path: 'agreement' }),
      )
    })
  })

  it('member without a rate row', () => {
    const a = agreement({ members: [member(), member({ eid: 'E2' })] })
    const err = (() => {
      try {
        calculate(a, new Map([['E1', D], ['E2', null]]), null, new Map())
      } catch (e) {
        return e
      }
    })()
    expect(err).toBeInstanceOf(CalcError)
    expect(err).toMatchObject({ code: 'payments.rate_missing', path: 'members.1.departureDate' })
  })

  it('an amount over 13 digits', () => {
    const a = agreement({ members: [member({ returnDate: '2030-11-03' })] })
    expect(() => rows(a, { ...D, daily: '9999999999999.00' })).toThrow(expect.objectContaining({ code: 'payments.amount_too_large' }))
  })

  it('a currency total over 13 digits', () => {
    const a = agreement({ members: [member({ returnDate: '2030-11-02' }), member({ eid: 'E2', returnDate: '2030-11-02' })] })
    expect(() => rows(a, { ...D, daily: '9999999999999.00' })).toThrow(
      expect.objectContaining({ code: 'payments.amount_too_large', path: 'agreement' }),
    )
  })

  it('posting components', () => {
    expect(POSTING_COMPONENT.meal_deduction).toBe('daily')
    expect(POSTING_COMPONENT.billed_accommodation).toBe('accommodation')
  })
})
