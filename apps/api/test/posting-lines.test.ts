import { describe, expect, it } from 'vitest'
import type { PaymentItem } from '../src/modules/payments/calculate.ts'
import { buildPaymentLines, paymentRemark, unbalancedCurrencies, type PostingMember } from '../src/modules/payments/posting.ts'
import type { PostingEntry } from '../src/modules/travel-master/lookups.ts'

const GL: Record<string, [string, string, string]> = {
  daily: ['4408720001', '0001', 'Daily allowance'],
  accommodation: ['4408730001', '0001', 'Accommodation'],
  fuel: ['4405100001', '0001', 'Fuel'],
  personal: ['4408600002', '0001', 'Personal'],
  advance: ['1362220001', '0001', 'Advance'],
}
const entries: PostingEntry[] = Object.entries(GL).flatMap(([component, [gl, seq, nameEn]]) => [
  { component, side: 'DR' as const, accountKind: 'gl' as const, gl, seq, glNameEn: nameEn, glNameLo: nameEn },
  { component, side: 'CR' as const, accountKind: 'member' as const, gl: null, seq: null, glNameEn: null, glNameLo: null },
])
const members: PostingMember[] = [
  { eid: 'E1', name: 'AAA BBB', branchCode: '888010', accountLak: 'L1', accountUsd: 'U1' },
  { eid: 'E2', name: 'CCC DDD', branchCode: '888030', accountLak: 'L2', accountUsd: null },
]
const item = (eid: string, component: PaymentItem['component'], currency: 'LAK' | 'USD', amount: string): PaymentItem => ({
  eid, component, currency, rate: amount, count: 1, amount, basis: '',
})
const build = (items: PaymentItem[], branch = '888010', m = members) =>
  buildPaymentLines({ items, entries, members: m, branch, remark: 'R' })

describe('buildPaymentLines', () => {
  it('domestic: GL lines summed, one CR per member, balanced', () => {
    const lines = build([
      item('E1', 'daily', 'LAK', '100000'),
      item('E2', 'daily', 'LAK', '100000'),
      item('E1', 'accommodation', 'LAK', '300000'),
    ])
    expect(lines.map((l) => [l.side, l.account, l.branch, l.amount])).toEqual([
      ['DR', '888010LAK44087200010001', '888010', '200000.00'],
      ['DR', '888010LAK44087300010001', '888010', '300000.00'],
      ['CR', 'L1', '888010', '400000.00'],
      ['CR', 'L2', '888030', '100000.00'],
    ])
    expect(lines[0]!.name).toBe('Daily allowance')
    expect(unbalancedCurrencies(lines)).toEqual([])
  })

  it('overseas: all USD with USD accounts, personal DR', () => {
    const lines = build([item('E1', 'daily', 'USD', '50'), item('E1', 'personal', 'USD', '20.50')])
    expect(lines.every((l) => l.ccy === 'USD')).toBe(true)
    expect(lines.map((l) => l.account)).toEqual(['888010USD44087200010001', '888010USD44086000020001', 'U1'])
    expect(lines[2]!.amount).toBe('70.50')
    expect(unbalancedCurrencies(lines)).toEqual([])
  })

  it('border with advance: allowances LAK, advance USD on holder account', () => {
    const lines = build([item('E1', 'daily', 'LAK', '100000'), item('E1', 'advance', 'USD', '500')])
    expect(lines.map((l) => [l.side, l.account, l.ccy])).toEqual([
      ['DR', '888010LAK44087200010001', 'LAK'],
      ['DR', '888010USD13622200010001', 'USD'],
      ['CR', 'L1', 'LAK'],
      ['CR', 'U1', 'USD'],
    ])
    expect(unbalancedCurrencies(lines)).toEqual([])
  })

  it('meal deduction lowers daily; branch of the payer prefixes GL accounts only', () => {
    const lines = build([item('E1', 'daily', 'LAK', '90000'), item('E1', 'meal_deduction', 'LAK', '-30000')], '888020')
    expect(lines[0]!.account).toBe('888020LAK44087200010001')
    expect(lines[0]!.amount).toBe('60000.00')
    expect(lines[1]).toMatchObject({ account: 'L1', branch: '888010', amount: '60000.00' })
  })

  it('leaves out a zero line', () => {
    const lines = build([item('E1', 'daily', 'LAK', '30000'), item('E1', 'meal_deduction', 'LAK', '-30000')])
    expect(lines).toEqual([])
  })

  it('holder without USD account is refused', () => {
    expect(() => build([item('E2', 'advance', 'USD', '500')])).toThrowError(
      expect.objectContaining({ code: 'posting.account_missing', status: 422, message: expect.stringContaining('E2') }),
    )
  })

  it('a total over 13 digits is refused', () => {
    expect(() => build([item('E1', 'daily', 'LAK', '9999999999999'), item('E2', 'daily', 'LAK', '1')])).toThrowError(
      expect.objectContaining({ code: 'payments.amount_too_large', status: 422 }),
    )
  })
})

describe('paymentRemark', () => {
  it('matches the example', () => {
    expect(
      paymentRemark({
        zoneCode: 'D', leaderName: 'ວັນ ໄຊ', days: 4, placeLo: 'ຫຼວງພະບາງ', docNo: '0101.BCEL.888010.2030',
        travelFrom: '2030-11-02', travelTo: '2030-11-05', ref: 'TA-2030-000004',
      }),
    ).toBe('D ວັນ ໄຊ 4 ຫຼວງພະບາງ 0101.BCEL.888010.2030 02/11/2030-05/11/2030 TA-2030-000004')
  })
})

describe('unbalancedCurrencies', () => {
  it('names the currency that differs', () => {
    const lines = build([item('E1', 'daily', 'LAK', '10')])
    lines[1]!.amount = '9.00'
    expect(unbalancedCurrencies(lines)).toEqual(['LAK'])
  })
})
