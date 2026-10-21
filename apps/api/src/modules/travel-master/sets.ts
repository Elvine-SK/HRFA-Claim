import { getAudit } from '@elvine-sk/platform-audit'
import { AppError, now, uuidv7 } from '@elvine-sk/platform-core'
import { createdStamp, currentDb, inTransaction } from '@elvine-sk/platform-db'
import type { ModuleContext } from '@elvine-sk/platform-server'
import type { AdvanceKind, Currency, FlatRateKey } from './lookups.ts'
import type { Amount } from './money.ts'

export const RANK_CODES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9'] as const
export const FLAT_RATE_KEYS = ['same_day', 'fuel_price', 'km_per_litre'] as const
export const ADVANCE_KINDS = ['domestic_days', 'group_size'] as const

const ADVANCE_CURRENCY: Record<AdvanceKind, Currency> = { domestic_days: 'LAK', group_size: 'USD' }

const HRM_OFFSET_MS = 7 * 60 * 60 * 1000

/** Today's date (`YYYY-MM-DD`) in HRM time (`+07:00`), from the platform clock. */
export function todayHrm(): string {
  return new Date(now().getTime() + HRM_OFFSET_MS).toISOString().slice(0, 10)
}

export interface RateRowInput {
  rankCode: string
  daily: Amount
  accommodation: Amount
  personal: Amount | null
}
export interface BandInput {
  minCount: number
  maxCount: number | null
  amount: Amount
}

const inEffect = () =>
  new AppError('travel_master.set_in_effect', 'A set in effect cannot be changed or deleted', { status: 409 })

const bandsInvalid = (why: string) =>
  new AppError('travel_master.bands_invalid', `Advance bands are invalid: ${why}`, { status: 422 })

const ratesInvalid = (why: string) =>
  new AppError('travel_master.rates_invalid', `Rate set is invalid: ${why}`, { status: 422 })

const unknownZone = () => new AppError('travel_master.unknown_zone', 'Unknown zone', { status: 422 })

interface SetTarget {
  table: 'travel_rates' | 'travel_flat_rates' | 'travel_advance_bands'
  key: string
  effectiveFrom: string
}

const stamp = () => {
  const s = createdStamp(uuidv7())
  return { id: s.id, createdAt: s.createdAt, createdBy: s.createdBy }
}

const auditSet = (ctx: ModuleContext, action: string, t: SetTarget) =>
  getAudit(ctx).record({
    action,
    targetType: t.table,
    targetId: t.key,
    details: { table: t.table, key: t.key, effectiveFrom: t.effectiveFrom },
  })

/**
 * Replace the set of `target` as one unit: refuse a date that is today or past (409), delete the rows of that
 * date, insert the new ones and audit, all in one transaction.
 */
async function replaceSet(ctx: ModuleContext, target: SetTarget, del: () => Promise<unknown>, insert: () => Promise<unknown>) {
  if (target.effectiveFrom <= todayHrm()) throw inEffect()
  await inTransaction(async () => {
    await del()
    await insert()
    await auditSet(ctx, 'travel_master.set_published', target)
  })
}

async function removeSet(ctx: ModuleContext, target: SetTarget, del: () => Promise<{ numDeletedRows: bigint }>) {
  if (target.effectiveFrom <= todayHrm()) throw inEffect()
  await inTransaction(async () => {
    if ((await del()).numDeletedRows === 0n) throw AppError.notFound()
    await auditSet(ctx, 'travel_master.set_deleted', target)
  })
}

// Rates

export async function publishRates(ctx: ModuleContext, zoneCode: string, effectiveFrom: string, rows: RateRowInput[]) {
  const zone = await currentDb().selectFrom('travelZones').select('kind').where('code', '=', zoneCode).executeTakeFirst()
  if (!zone) throw unknownZone()
  const ranks = new Set(rows.map((r) => r.rankCode))
  if (rows.length !== RANK_CODES.length || !RANK_CODES.every((r) => ranks.has(r)))
    throw ratesInvalid('exactly one row for each of the nine ranks')
  for (const r of rows) {
    if (zone.kind === 'overseas' && r.personal === null) throw ratesInvalid('personal is required for overseas zones')
    if (zone.kind !== 'overseas' && r.personal !== null)
      throw ratesInvalid('personal must be empty for domestic and border zones')
  }
  const db = () => currentDb()
  await replaceSet(
    ctx,
    { table: 'travel_rates', key: zoneCode, effectiveFrom },
    () => db().deleteFrom('travelRates').where('zoneCode', '=', zoneCode).where('effectiveFrom', '=', effectiveFrom).execute(),
    () =>
      db()
        .insertInto('travelRates')
        .values(rows.map((r) => ({ ...stamp(), zoneCode, effectiveFrom, ...r })))
        .execute(),
  )
}

export const deleteRates = (ctx: ModuleContext, zoneCode: string, effectiveFrom: string) =>
  removeSet(ctx, { table: 'travel_rates', key: zoneCode, effectiveFrom }, () =>
    currentDb()
      .deleteFrom('travelRates')
      .where('zoneCode', '=', zoneCode)
      .where('effectiveFrom', '=', effectiveFrom)
      .executeTakeFirst(),
  )

export async function ratesOf(zoneCode: string, on: string) {
  const db = currentDb()
  const zone = await db.selectFrom('travelZones').select('currency').where('code', '=', zoneCode).executeTakeFirst()
  if (!zone) throw unknownZone()
  const sets = (
    await db
      .selectFrom('travelRates')
      .select('effectiveFrom')
      .distinct()
      .where('zoneCode', '=', zoneCode)
      .orderBy('effectiveFrom', 'desc')
      .execute()
  ).map((s) => s.effectiveFrom as string)
  const current = sets.find((s) => s <= on)
  if (!current) return { data: null, sets }
  const rows = await db
    .selectFrom('travelRates as r')
    .innerJoin('travelRanks as k', 'k.code', 'r.rankCode')
    .select(['r.rankCode', 'r.daily', 'r.accommodation', 'r.personal'])
    .where('r.zoneCode', '=', zoneCode)
    .where('r.effectiveFrom', '=', current)
    .orderBy('k.sortOrder')
    .execute()
  return { data: { zoneCode, currency: zone.currency as Currency, effectiveFrom: current, rows }, sets }
}

// Flat rates

export const publishFlatRate = (ctx: ModuleContext, key: FlatRateKey, effectiveFrom: string, amount: Amount) =>
  replaceSet(
    ctx,
    { table: 'travel_flat_rates', key, effectiveFrom },
    () => currentDb().deleteFrom('travelFlatRates').where('key', '=', key).where('effectiveFrom', '=', effectiveFrom).execute(),
    () => currentDb().insertInto('travelFlatRates').values({ ...stamp(), key, effectiveFrom, amount }).execute(),
  )

export const deleteFlatRate = (ctx: ModuleContext, key: FlatRateKey, effectiveFrom: string) =>
  removeSet(ctx, { table: 'travel_flat_rates', key, effectiveFrom }, () =>
    currentDb()
      .deleteFrom('travelFlatRates')
      .where('key', '=', key)
      .where('effectiveFrom', '=', effectiveFrom)
      .executeTakeFirst(),
  )

/** Per key: the value in effect today and the ones coming. */
export async function flatRatesOverview() {
  const today = todayHrm()
  const all = await currentDb()
    .selectFrom('travelFlatRates')
    .select(['key', 'effectiveFrom', 'amount'])
    .orderBy('effectiveFrom', 'asc')
    .execute()
  return FLAT_RATE_KEYS.map((key) => {
    const mine = all
      .filter((r) => r.key === key)
      .map((r) => ({ effectiveFrom: r.effectiveFrom as string, amount: r.amount as string }))
    return {
      key,
      current: mine.filter((r) => r.effectiveFrom <= today).at(-1) ?? null,
      future: mine.filter((r) => r.effectiveFrom > today),
    }
  })
}

// Advance bands

/** Sorted, from 1, each band starts right after the previous one ends, only the last is open. */
export function checkBands(bands: BandInput[]) {
  bands.forEach((b, i) => {
    const last = i === bands.length - 1
    if (b.maxCount !== null && b.maxCount < b.minCount) throw bandsInvalid('a band ends before it starts')
    if (last && b.maxCount !== null) throw bandsInvalid('the last band must be open (maxCount null)')
    if (!last && b.maxCount === null) throw bandsInvalid('only the last band may be open')
    if (i === 0 && b.minCount !== 1) throw bandsInvalid('the first band must start at 1')
    const prev = bands[i - 1]
    if (prev && b.minCount !== (prev.maxCount as number) + 1)
      throw bandsInvalid('bands must be sorted with no gap or overlap')
  })
}

export async function publishBands(ctx: ModuleContext, kind: AdvanceKind, effectiveFrom: string, bands: BandInput[]) {
  checkBands(bands)
  await replaceSet(
    ctx,
    { table: 'travel_advance_bands', key: kind, effectiveFrom },
    () =>
      currentDb()
        .deleteFrom('travelAdvanceBands')
        .where('kind', '=', kind)
        .where('effectiveFrom', '=', effectiveFrom)
        .execute(),
    () =>
      currentDb()
        .insertInto('travelAdvanceBands')
        .values(bands.map((b) => ({ ...stamp(), kind, effectiveFrom, ...b })))
        .execute(),
  )
}

export const deleteBands = (ctx: ModuleContext, kind: AdvanceKind, effectiveFrom: string) =>
  removeSet(ctx, { table: 'travel_advance_bands', key: kind, effectiveFrom }, () =>
    currentDb()
      .deleteFrom('travelAdvanceBands')
      .where('kind', '=', kind)
      .where('effectiveFrom', '=', effectiveFrom)
      .executeTakeFirst(),
  )

export async function bandsOf(kind: AdvanceKind, on: string) {
  const db = currentDb()
  const sets = (
    await db
      .selectFrom('travelAdvanceBands')
      .select('effectiveFrom')
      .distinct()
      .where('kind', '=', kind)
      .orderBy('effectiveFrom', 'desc')
      .execute()
  ).map((s) => s.effectiveFrom as string)
  const current = sets.find((s) => s <= on)
  if (!current) return { data: null, sets }
  const bands = await db
    .selectFrom('travelAdvanceBands')
    .select(['minCount', 'maxCount', 'amount'])
    .where('kind', '=', kind)
    .where('effectiveFrom', '=', current)
    .orderBy('minCount')
    .execute()
  return { data: { kind, currency: ADVANCE_CURRENCY[kind], effectiveFrom: current, bands }, sets }
}
