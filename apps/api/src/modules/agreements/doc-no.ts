/**
 * Doc.no, the number of the signed paper agreement or notice (spec §8, ກ12): `NNNN.BCEL.<BRANCH_CODE>.YYYY`, in
 * Lao `NNNN.ທຄຕລ.<BRANCH_CODE>.YYYY`. The branch is HRM's six-digit `BRANCH_CODE` (decided 2026-10-29).
 */
export interface DocNo {
  seq: number
  branch: string
  year: number
}

const LABEL = { en: 'BCEL', lo: 'ທຄຕລ' } as const

// One separator throughout, `.` or `/` (the paper spelling); a three-digit branch is the part after `888`.
const DOC_NO = /^(\d{1,4})([./])(BCEL|ທຄຕລ)\2(\d{6}|\d{3})\2(\d{4})$/iu

export function parseDocNo(input: string): DocNo | null {
  const m = DOC_NO.exec(input.trim())
  if (!m) return null
  const seq = Number(m[1])
  if (seq < 1) return null
  const branch = m[4]!.length === 3 ? `888${m[4]}` : m[4]!
  return { seq, branch, year: Number(m[5]) }
}

export function formatDocNo(d: DocNo, lang: 'en' | 'lo' = 'en'): string {
  return `${String(d.seq).padStart(4, '0')}.${LABEL[lang]}.${d.branch}.${d.year}`
}

const REF = /^TA-(\d{4})-(\d{6})$/i

/** The system reference, `TA-YYYY-NNNNNN`, upper-cased; `null` for anything else. */
export function parseRef(input: string): string | null {
  const s = input.trim()
  return REF.test(s) ? s.toUpperCase() : null
}
