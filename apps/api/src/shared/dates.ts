import { now } from '@elvine-sk/platform-core'

const HRM_OFFSET_MS = 7 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** Today's date (`YYYY-MM-DD`) in HRM time (`+07:00`), from the platform clock. */
export function todayHrm(): string {
  return new Date(now().getTime() + HRM_OFFSET_MS).toISOString().slice(0, 10)
}

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS

/** Days from `from` to `to`, both counted (`to − from + 1`). Throws `RangeError` when `to` is before `from`. */
export function daysInclusive(from: string, to: string): number {
  const days = dayNumber(to) - dayNumber(from) + 1
  if (!Number.isInteger(days) || days < 1) throw new RangeError(`${to} is before ${from}`)
  return days
}

export const yearOf = (date: string): number => Number(date.slice(0, 4))
