import { currentDb } from '@elvine-sk/platform-db'
import type { Amount } from './money.ts'

export const RANK_CODES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9'] as const
export type RankCode = (typeof RANK_CODES)[number]
export type ZoneCode = 'D' | 'OB1' | 'OA1' | 'OA2' | 'OE1' | 'OE2'
export type ZoneKind = 'domestic' | 'border' | 'overseas'
export type Currency = 'LAK' | 'USD'
export type FlatRateKey = 'same_day' | 'fuel_price' | 'km_per_litre'
export type AdvanceKind = 'domestic_days' | 'group_size'

/** Domestic advances are per trip in LAK; border and overseas advances per country in USD. */
export const ADVANCE_CURRENCY: Record<AdvanceKind, Currency> = { domestic_days: 'LAK', group_size: 'USD' }

/** The rank of an HRM PostType, or `null` when it is not mapped (never a default rank). */
export async function rankForPostType(postType: number): Promise<RankCode | null> {
  const row = await currentDb()
    .selectFrom('travelRankMap')
    .select('rankCode')
    .where('postType', '=', postType)
    .executeTakeFirst()
  return (row?.rankCode as RankCode | undefined) ?? null
}

export async function zoneOf(
  code: ZoneCode,
): Promise<{ code: ZoneCode; kind: ZoneKind; currency: Currency; nameLo: string; nameEn: string }> {
  const row = await currentDb()
    .selectFrom('travelZones')
    .select(['code', 'kind', 'currency', 'nameLo', 'nameEn'])
    .where('code', '=', code)
    .executeTakeFirstOrThrow()
  return row
}

export async function countryByIso2(
  iso2: string,
): Promise<{ iso2: string; nameLo: string; nameEn: string; zoneCode: ZoneCode } | null> {
  const row = await currentDb()
    .selectFrom('travelCountries')
    .select(['iso2', 'nameLo', 'nameEn', 'zoneCode'])
    .where('iso2', '=', iso2.toUpperCase())
    .executeTakeFirst()
  return row ?? null
}

/** The zone's rate for the rank on date `on` (`YYYY-MM-DD`): the row with the greatest `effective_from <= on`. */
export async function rateOn(
  zone: ZoneCode,
  rank: RankCode,
  on: string,
): Promise<{
  daily: Amount
  accommodation: Amount
  personal: Amount | null
  currency: Currency
  effectiveFrom: string
} | null> {
  const row = await currentDb()
    .selectFrom('travelRates as r')
    .innerJoin('travelZones as z', 'z.code', 'r.zoneCode')
    .select(['r.daily', 'r.accommodation', 'r.personal', 'z.currency', 'r.effectiveFrom'])
    .where('r.zoneCode', '=', zone)
    .where('r.rankCode', '=', rank)
    .where('r.effectiveFrom', '<=', on)
    .orderBy('r.effectiveFrom', 'desc')
    .limit(1)
    .executeTakeFirst()
  return row ?? null
}

export async function flatRateOn(
  key: FlatRateKey,
  on: string,
): Promise<{ amount: Amount; effectiveFrom: string } | null> {
  const row = await currentDb()
    .selectFrom('travelFlatRates')
    .select(['amount', 'effectiveFrom'])
    .where('key', '=', key)
    .where('effectiveFrom', '<=', on)
    .orderBy('effectiveFrom', 'desc')
    .limit(1)
    .executeTakeFirst()
  return row ?? null
}

/**
 * The advance for `count` (trip days or group size) in the band set in effect on `on`. The set is chosen first,
 * then the band within it, so a count the newer set does not cover is never answered from an older set.
 */
export async function advanceOn(
  kind: AdvanceKind,
  count: number,
  on: string,
): Promise<{ amount: Amount; currency: Currency; effectiveFrom: string } | null> {
  const db = currentDb()
  const set = await db
    .selectFrom('travelAdvanceBands')
    .select('effectiveFrom')
    .where('kind', '=', kind)
    .where('effectiveFrom', '<=', on)
    .orderBy('effectiveFrom', 'desc')
    .limit(1)
    .executeTakeFirst()
  if (!set) return null
  const band = await db
    .selectFrom('travelAdvanceBands')
    .select(['amount', 'effectiveFrom'])
    .where('kind', '=', kind)
    .where('effectiveFrom', '=', set.effectiveFrom)
    .where('minCount', '<=', count)
    .where((eb) => eb.or([eb('maxCount', 'is', null), eb('maxCount', '>=', count)]))
    .executeTakeFirst()
  return band ? { ...band, currency: ADVANCE_CURRENCY[kind] } : null
}

export interface PostingEntry {
  component: string
  side: 'DR' | 'CR'
  accountKind: 'gl' | 'member'
  gl: string | null
  seq: string | null
  glNameEn: string | null
  glNameLo: string | null
}

/** The lines to post for a case (`payment`) in a zone kind, in posting order; a member line has no GL. */
export async function postingEntries(caseKey: string, zoneKind: ZoneKind): Promise<PostingEntry[]> {
  return currentDb()
    .selectFrom('travelPostingEntries as e')
    .leftJoin('travelGlAccounts as g', (j) => j.onRef('g.gl', '=', 'e.gl').onRef('g.seq', '=', 'e.seq'))
    .select(['e.component', 'e.side', 'e.accountKind', 'e.gl', 'e.seq', 'g.nameEn as glNameEn', 'g.nameLo as glNameLo'])
    .where('e.caseKey', '=', caseKey)
    .where('e.zoneKind', '=', zoneKind)
    .orderBy('e.sortOrder')
    .execute()
}
