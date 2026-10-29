import { describe, expect, it } from 'vitest'
// The web app has no test runner; this pure helper is tested here.
import { formatDayFirst, parseDayFirst } from '../../web/app/utils/dayFirst.ts'

describe('web: dates written day first', () => {
  it.each([
    ['29/10/2026', '2026-10-29'],
    ['1/2/2026', '2026-02-01'],
    ['01.02.2026', '2026-02-01'],
    ['01-02-2026', '2026-02-01'],
    [' 29/02/2028 ', '2028-02-29'],
  ])('reads %s', (typed, iso) => expect(parseDayFirst(typed)).toBe(iso))

  it.each(['', '29/10/26', '31/04/2026', '29/02/2027', '00/10/2026', '29/13/2026', '2026-10-29', 'abc'])(
    'refuses %s',
    (typed) => expect(parseDayFirst(typed)).toBeNull(),
  )

  it('writes an ISO date day first', () => {
    expect(formatDayFirst('2026-10-29')).toBe('29/10/2026')
    expect(formatDayFirst('')).toBe('')
    expect(formatDayFirst(null)).toBe('')
  })
})
