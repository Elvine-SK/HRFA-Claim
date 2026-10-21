import { describe, expect, it } from 'vitest'
import { addAmounts, compareAmounts, divCeilWhole, fromCents, mulAmount, toCents } from '../src/modules/travel-master/money.ts'

describe('money', () => {
  it('formats with two decimals', () => {
    expect(fromCents(toCents('150000'))).toBe('150000.00')
    expect(addAmounts('0.10', '0.20', '1')).toBe('1.30')
  })
  it('divides by 3 and rounds up to a whole unit', () => {
    expect(divCeilWhole('100', 3)).toBe('34.00')
    expect(divCeilWhole('310000', 3)).toBe('103334.00')
    expect(divCeilWhole('90', 3)).toBe('30.00')
    expect(divCeilWhole('100.01', 1)).toBe('101.00')
  })
  it('multiplies by a whole count', () => {
    expect(mulAmount('280000', 4)).toBe('1120000.00')
    expect(() => mulAmount('1', 1.5)).toThrow(TypeError)
  })
  it('refuses what is not an amount', () => {
    for (const bad of ['-1', '1.234', '1e3', '', ' 1', '12345678901234']) expect(() => toCents(bad)).toThrow(TypeError)
  })
  it('compares', () => expect([compareAmounts('2', '10'), compareAmounts('10.00', '10'), compareAmounts('3', '2')]).toEqual([-1, 0, 1]))
})
