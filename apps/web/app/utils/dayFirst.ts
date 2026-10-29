/**
 * Dates as staff write them, day first (dd/mm/yyyy), while the API and the model keep `YYYY-MM-DD`. The browser's
 * native date input follows the browser's language instead (platform proposal C5).
 */

const DAY_FIRST = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/

/** `29/10/2026` (or with `.` or `-`) as `2026-10-29`; `null` for anything that is not a real date. */
export function parseDayFirst(typed: string): string | null {
  const m = DAY_FIRST.exec(typed.trim())
  if (!m) return null
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date.toISOString().slice(0, 10)
}

/** `2026-10-29` as `29/10/2026`; empty for no date. */
export function formatDayFirst(iso: string | null | undefined): string {
  if (!iso) return ''
  const [year, month, day] = iso.slice(0, 10).split('-')
  return day && month && year ? `${day}/${month}/${year}` : iso
}
