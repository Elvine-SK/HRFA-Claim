import { AppError } from '@elvine-sk/platform-core'
import { describe, expect, it } from 'vitest'
import { unbalancedCurrencies, type PostingMember } from '../src/modules/payments/posting.ts'
import { buildClearingLines, buildSettlementLines } from '../src/modules/settlements/posting.ts'
import { LineError, settledAmountOf, totalsOf } from '../src/modules/settlements/totals.ts'
import type { ExpenseType } from '../src/modules/settlements/types.ts'
import type { Currency, PostingEntry, ZoneKind } from '../src/modules/travel-master/lookups.ts'

const NAMES: Record<string, string> = {
  '1362220001': 'Allow.Bcel.Staf',
  '2361800001': 'Admin.external BCEL',
  '4405100001': 'Expense on Fuel',
  '4405200001': 'Expense on Official Trip',
}
const gl = (component: string, side: 'DR' | 'CR', account: string): PostingEntry => ({
  component, side, accountKind: 'gl', gl: account, seq: '0001', glNameEn: NAMES[account]!, glNameLo: NAMES[account]!,
})
const member = (component: string, side: 'DR' | 'CR'): PostingEntry => ({
  component, side, accountKind: 'member', gl: null, seq: null, glNameEn: null, glNameLo: null,
})
// The Task 2 rows.
const DOMESTIC = [
  gl('advance', 'CR', '1362220001'),
  gl('fuel', 'DR', '4405100001'),
  gl('fare', 'DR', '4405200001'),
  member('returned', 'DR'),
  member('excess', 'CR'),
]
const OVERSEAS = [
  gl('advance', 'CR', '1362220001'),
  gl('fare', 'DR', '4405200001'),
  gl('holding', 'CR', '2361800001'),
  member('returned', 'DR'),
  member('excess', 'CR'),
]
const CLEARING = [gl('holding', 'DR', '2361800001'), gl('advance', 'CR', '1362220001')]

const holder: PostingMember = {
  eid: '10103',
  name: 'BOUN MA',
  branchCode: '888030',
  accountLak: '0101000000001',
  accountUsd: '0101000000002',
}

type Line = { settledAmount: string; expenseType: ExpenseType | null }
const fuel = (a: string): Line => ({ settledAmount: a, expenseType: 'fuel' })
const fare = (a: string): Line => ({ settledAmount: a, expenseType: 'fare' })
const abroad = (a: string): Line => ({ settledAmount: a, expenseType: null })

function settle(zoneKind: ZoneKind, currency: Currency, advance: string, lines: Line[]) {
  const totals = totalsOf({ advance, zoneKind, lines })
  const out = buildSettlementLines({
    zoneKind,
    currency,
    totals,
    holder,
    entries: zoneKind === 'overseas' ? OVERSEAS : DOMESTIC,
    branch: '888010',
    remark: 'R',
  })
  expect(unbalancedCurrencies(out)).toEqual([])
  return { totals, rows: out.map((l) => [l.account, l.side, l.ccy, l.amount, l.rvsNo]) }
}

describe('settlement totals', () => {
  it.each([
    ['0', 'unused'],
    ['1500000', 'partly_used'],
    ['2000000', 'fully_used'],
    ['2300000', 'overspent'],
  ] as const)('a total of %s is %s', (total, caseKind) => {
    const lines = total === '0' ? [] : [fare(total)]
    expect(totalsOf({ advance: '2000000', zoneKind: 'domestic', lines }).caseKind).toBe(caseKind)
  })

  it('splits remaining into returned, excess and holding', () => {
    expect(totalsOf({ advance: '1000.00', zoneKind: 'overseas', lines: [abroad('600.00')] })).toEqual({
      total: '600.00',
      remaining: '400.00',
      caseKind: 'partly_used',
      returned: '400.00',
      excess: '0.00',
      holding: '600.00',
      byType: { fuel: '0.00', fare: '600.00' },
      needsClearing: true,
    })
    expect(totalsOf({ advance: '2000000', zoneKind: 'domestic', lines: [fare('2300000')] })).toMatchObject({
      remaining: '-300000.00',
      returned: '0.00',
      excess: '300000.00',
      holding: '0.00',
      needsClearing: false,
    })
    expect(totalsOf({ advance: '1000.00', zoneKind: 'overseas', lines: [] })).toMatchObject({
      holding: '0.00',
      needsClearing: false,
    })
  })

  it('refuses a total beyond 13 digits', () => {
    const big = '9999999999999.00'
    try {
      totalsOf({ advance: '1', zoneKind: 'domestic', lines: [fare(big), fare(big)] })
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).code).toBe('payments.amount_too_large')
    }
  })
})

describe('settled amount of a line', () => {
  it('converts at the cross rate, half-up to cents', () => {
    expect(settledAmountOf({ currency: 'THB', amount: '3500.00', crossRate: '35.123456', expenseType: null }, 'USD')).toBe(
      '99.65',
    )
    expect(settledAmountOf({ currency: 'USD', amount: '12.5', crossRate: null, expenseType: null }, 'USD')).toBe('12.50')
  })
  it('needs a cross rate only for another currency', () => {
    const err = (fn: () => unknown) => {
      try {
        fn()
      } catch (e) {
        return e instanceof LineError ? [e.code, e.path] : e
      }
    }
    expect(err(() => settledAmountOf({ currency: 'THB', amount: '1', crossRate: null, expenseType: null }, 'USD'))).toEqual([
      'settlements.cross_rate_required',
      'crossRate',
    ])
    expect(err(() => settledAmountOf({ currency: 'USD', amount: '1', crossRate: '1', expenseType: null }, 'USD'))).toEqual([
      'settlements.cross_rate_not_allowed',
      'crossRate',
    ])
  })
})

describe('settlement upload lines', () => {
  it('domestic, partly used: expenses by type and the remainder back from the holder', () => {
    expect(settle('domestic', 'LAK', '2000000', [fuel('500000'), fare('1000000')]).rows).toEqual([
      ['888010LAK44051000010001', 'DR', 'LAK', '500000.00', ''],
      ['888010LAK44052000010001', 'DR', 'LAK', '1000000.00', ''],
      ['0101000000001', 'DR', 'LAK', '500000.00', ''],
      ['888010LAK13622200010001', 'CR', 'LAK', '2000000.00', ''],
    ])
  })

  it('domestic, unused: the whole advance back from the holder', () => {
    expect(settle('domestic', 'LAK', '2000000', []).rows).toEqual([
      ['0101000000001', 'DR', 'LAK', '2000000.00', ''],
      ['888010LAK13622200010001', 'CR', 'LAK', '2000000.00', ''],
    ])
  })

  it('domestic, overspent: the holder is reimbursed the excess', () => {
    expect(settle('domestic', 'LAK', '2000000', [fare('2300000')]).rows).toEqual([
      ['888010LAK44052000010001', 'DR', 'LAK', '2300000.00', ''],
      ['888010LAK13622200010001', 'CR', 'LAK', '2000000.00', ''],
      ['0101000000001', 'CR', 'LAK', '300000.00', ''],
    ])
  })

  it('overseas, partly used: spent money waits in 2361800001, then the clearing file carries RVS_NO', () => {
    const { totals, rows } = settle('overseas', 'USD', '1000.00', [abroad('600.00')])
    expect(rows).toEqual([
      ['888010USD44052000010001', 'DR', 'USD', '600.00', ''],
      ['0101000000002', 'DR', 'USD', '400.00', ''],
      ['888010USD13622200010001', 'CR', 'USD', '400.00', ''],
      ['888010USD23618000010001', 'CR', 'USD', '600.00', ''],
    ])
    expect(totals.needsClearing).toBe(true)
    const clearing = buildClearingLines({
      currency: 'USD',
      holding: totals.holding,
      entries: CLEARING,
      branch: '888010',
      remark: 'R',
      rvsNo: 'SUS-1',
    })
    expect(unbalancedCurrencies(clearing)).toEqual([])
    expect(clearing.map((l) => [l.account, l.side, l.amount, l.rvsNo, l.name])).toEqual([
      ['888010USD23618000010001', 'DR', '600.00', 'SUS-1', 'Admin.external BCEL'],
      ['888010USD13622200010001', 'CR', '600.00', '', 'Allow.Bcel.Staf'],
    ])
  })

  it('overseas, overspent: holding is capped at the advance, the excess goes to the holder', () => {
    const { totals, rows } = settle('overseas', 'USD', '1000.00', [abroad('700.00'), abroad('500.00')])
    expect(rows).toEqual([
      ['888010USD44052000010001', 'DR', 'USD', '1200.00', ''],
      ['888010USD23618000010001', 'CR', 'USD', '1000.00', ''],
      ['0101000000002', 'CR', 'USD', '200.00', ''],
    ])
    expect(totals.holding).toBe('1000.00')
  })

  it('overseas, unused: no holding and no clearing', () => {
    const { totals, rows } = settle('overseas', 'USD', '1000.00', [])
    expect(rows).toEqual([
      ['0101000000002', 'DR', 'USD', '1000.00', ''],
      ['888010USD13622200010001', 'CR', 'USD', '1000.00', ''],
    ])
    expect(totals.needsClearing).toBe(false)
  })

  it('border: the domestic entries, in USD', () => {
    expect(settle('border', 'USD', '300.00', [fuel('100.00'), fare('50.00')]).rows).toEqual([
      ['888010USD44051000010001', 'DR', 'USD', '100.00', ''],
      ['888010USD44052000010001', 'DR', 'USD', '50.00', ''],
      ['0101000000002', 'DR', 'USD', '150.00', ''],
      ['888010USD13622200010001', 'CR', 'USD', '300.00', ''],
    ])
  })

  it('names lines and keeps the holder branch on member lines', () => {
    const totals = totalsOf({ advance: '2000000', zoneKind: 'domestic', lines: [fare('1500000')] })
    const out = buildSettlementLines({
      zoneKind: 'domestic', currency: 'LAK', totals, holder, entries: DOMESTIC, branch: '888050', remark: 'R',
    })
    expect(out.map((l) => [l.account, l.branch, l.name, l.remark])).toEqual([
      ['888050LAK44052000010001', '888050', 'Expense on Official Trip', 'R'],
      ['0101000000001', '888030', 'BOUN MA', 'R'],
      ['888050LAK13622200010001', '888050', 'Allow.Bcel.Staf', 'R'],
    ])
  })

  it('refuses a missing entry or account', () => {
    const code = (fn: () => unknown) => {
      try {
        fn()
      } catch (e) {
        return (e as AppError).code
      }
    }
    const totals = totalsOf({ advance: '1000.00', zoneKind: 'overseas', lines: [abroad('600.00')] })
    const base = { zoneKind: 'overseas' as const, currency: 'USD' as const, totals, holder, branch: '888010', remark: 'R' }
    expect(code(() => buildSettlementLines({ ...base, entries: OVERSEAS.filter((e) => e.component !== 'holding') }))).toBe(
      'posting.entry_missing',
    )
    expect(code(() => buildSettlementLines({ ...base, entries: OVERSEAS, holder: { ...holder, accountUsd: null } }))).toBe(
      'posting.account_missing',
    )
    const noGl = OVERSEAS.map((e) => (e.component === 'holding' ? { ...e, gl: null } : e))
    expect(code(() => buildSettlementLines({ ...base, entries: noGl }))).toBe('posting.entry_invalid')
    expect(
      code(() =>
        buildClearingLines({ currency: 'USD', holding: '600.00', entries: CLEARING.map((e) => ({ ...e, seq: null })), branch: '888010', remark: 'R', rvsNo: 'S' }),
      ),
    ).toBe('posting.entry_invalid')
  })
})
