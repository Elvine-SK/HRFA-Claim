import { describe, expect, it } from 'vitest'
import { formatDocNo, parseDocNo, parseRef } from '../src/modules/agreements/doc-no.ts'

describe('Doc.no and REF', () => {
  const d = { seq: 1, branch: '888010', year: 2026 }
  it.each([
    '0001.BCEL.888010.2026',
    '1.BCEL.888010.2026',
    '0001.BCEL.010.2026',
    '0001/BCEL/888010/2026',
    '0001.ທຄຕລ.888010.2026',
    '0001/ທຄຕລ/010/2026',
    ' 0001.bcel.888010.2026 ',
  ])('reads %s', (s) => expect(parseDocNo(s)).toEqual(d))

  it.each([
    '0000.BCEL.888010.2026',
    '12345.BCEL.888010.2026',
    '0001.BCEL.88010.2026',
    '0001.BCEL.888010.26',
    '0001-BCEL-888010-2026',
    '0001.XYZ.888010.2026',
    '0001.BCEL/888010.2026',
    '',
  ])('refuses %s', (s) => expect(parseDocNo(s)).toBeNull())

  it('formats both scripts', () => {
    expect(formatDocNo(d)).toBe('0001.BCEL.888010.2026')
    expect(formatDocNo({ ...d, seq: 42 }, 'lo')).toBe('0042.ທຄຕລ.888010.2026')
  })

  it('reads a REF', () => {
    expect(parseRef('ta-2026-000017')).toBe('TA-2026-000017')
    expect(parseRef(' TA-2026-000017 ')).toBe('TA-2026-000017')
    expect(parseRef('TA-2026-17')).toBeNull()
  })
})
