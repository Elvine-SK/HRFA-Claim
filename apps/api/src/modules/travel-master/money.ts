/** Decimal amount as a string, e.g. "150000" or "12.5". Arithmetic runs on bigint cents, never on floats. */
export type Amount = string

/** At most 13 whole digits and 2 decimals. */
export const AMOUNT_PATTERN = /^\d{1,13}(\.\d{1,2})?$/

/** Parse an amount into cents. Throws TypeError on anything not matching AMOUNT_PATTERN. */
export function toCents(a: Amount): bigint {
  if (typeof a !== 'string' || !AMOUNT_PATTERN.test(a)) throw new TypeError(`invalid amount: ${JSON.stringify(a)}`)
  const [whole = '0', frac = ''] = a.split('.')
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'))
}

/** Format cents as an amount with always two decimals. */
export function fromCents(c: bigint): Amount {
  const abs = c < 0n ? -c : c
  const sign = c < 0n ? '-' : ''
  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`
}

/** An amount with thousands separators, as people read it: "9351429.00" → "9,351,429.00". */
export function groupAmount(a: Amount): string {
  const [whole = '0', frac] = a.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return frac === undefined ? grouped : `${grouped}.${frac}`
}

/** Exact sum of amounts. */
export function addAmounts(...a: Amount[]): Amount {
  return fromCents(a.reduce((sum, x) => sum + toCents(x), 0n))
}

/** Amount times a non-negative whole count. Throws TypeError when n is not a non-negative integer. */
export function mulAmount(a: Amount, n: number): Amount {
  if (!Number.isInteger(n) || n < 0) throw new TypeError(`count must be a non-negative integer: ${n}`)
  return fromCents(toCents(a) * BigInt(n))
}

/** a ÷ d rounded up to a whole unit (spec §9, ກ9 item 2). d must be a positive integer. */
export function divCeilWhole(a: Amount, d: number): Amount {
  if (!Number.isInteger(d) || d <= 0) throw new TypeError(`divisor must be a positive integer: ${d}`)
  const unit = 100n
  const step = BigInt(d) * unit
  const cents = toCents(a)
  return fromCents(((cents + step - 1n) / step) * unit)
}

/** a × n ÷ d rounded up to a whole unit, e.g. km × price ÷ km per litre (fuel). n must be a non-negative integer, d positive. */
export function mulDivCeilWhole(a: Amount, n: number, d: Amount): Amount {
  if (!Number.isInteger(n) || n < 0) throw new TypeError(`count must be a non-negative integer: ${n}`)
  const divisor = toCents(d)
  if (divisor <= 0n) throw new TypeError(`divisor must be positive: ${d}`)
  const num = toCents(a) * BigInt(n)
  return fromCents(((num + divisor - 1n) / divisor) * 100n)
}

/** True when a fits the 13-digit amount format and is not negative. */
export function fitsAmount(a: Amount): boolean {
  return typeof a === 'string' && AMOUNT_PATTERN.test(a)
}

/** Compare two amounts numerically. */
export function compareAmounts(a: Amount, b: Amount): -1 | 0 | 1 {
  const x = toCents(a)
  const y = toCents(b)
  return x < y ? -1 : x > y ? 1 : 0
}
