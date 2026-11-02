import { describe, expect, it } from 'vitest'
import { addWorkingDays, daysInclusive, yearOf } from '../src/shared/dates.ts'

describe('HRM dates', () => {
  it('counts both ends', () => {
    expect(daysInclusive('2026-10-01', '2026-10-01')).toBe(1)
    expect(daysInclusive('2026-12-30', '2027-01-02')).toBe(4)
    expect(daysInclusive('2028-02-28', '2028-03-01')).toBe(3)
    expect(() => daysInclusive('2026-10-02', '2026-10-01')).toThrow(RangeError)
  })
  it('reads the year', () => expect(yearOf('2026-10-29')).toBe(2026))
  it('counts working days', () => {
    // Friday 2033-11-04 return: Mon 7 is a holiday ⇒ 8, 9, 10, 11, 14
    expect(addWorkingDays('2033-11-04', 5, new Set(['2033-11-07']))).toBe('2033-11-14')
    expect(addWorkingDays('2033-11-01', 5, new Set())).toBe('2033-11-08')
    expect(addWorkingDays('2033-12-30', 1, new Set())).toBe('2034-01-02') // Friday ⇒ Monday, across the year
  })
})
