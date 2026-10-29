import { z } from '@elvine-sk/platform-server'

const isRealDate = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** A calendar date, `YYYY-MM-DD`. */
export const DateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
  .refine(isRealDate, 'Not a real date')
