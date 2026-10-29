import { describe, expect, it } from 'vitest'
import { daysInclusive, yearOf } from '../src/shared/dates.ts'

describe('HRM dates', () => {
  it('counts both ends', () => {
    expect(daysInclusive('2026-10-01', '2026-10-01')).toBe(1)
    expect(daysInclusive('2026-12-30', '2027-01-02')).toBe(4)
    expect(daysInclusive('2028-02-28', '2028-03-01')).toBe(3)
    expect(() => daysInclusive('2026-10-02', '2026-10-01')).toThrow(RangeError)
  })
  it('reads the year', () => expect(yearOf('2026-10-29')).toBe(2026))
})
