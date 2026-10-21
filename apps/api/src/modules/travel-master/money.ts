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

/** Compare two amounts numerically. */
export function compareAmounts(a: Amount, b: Amount): -1 | 0 | 1 {
  const x = toCents(a)
  const y = toCents(b)
  return x < y ? -1 : x > y ? 1 : 0
}
