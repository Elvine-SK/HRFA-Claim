import { AppError } from '@elvine-sk/platform-core'
import { daysInclusive } from '../../shared/dates.ts'
import { findAgreement, membersOf, type MemberRow } from '../agreements/queries.ts'
import {
  advanceOn,
  flatRateOn,
  rateOn,
  zoneOf,
  type Currency,
  type RankCode,
  type ZoneCode,
} from '../travel-master/lookups.ts'
import type { Amount } from '../travel-master/money.ts'
import type { CalcAgreement, CalcMember, MemberRates } from './calculate.ts'

export const toCalcMember = (m: MemberRow): CalcMember => ({
  eid: m.eid,
  departureDate: m.departureDate,
  returnDate: m.returnDate,
  daysSubtracted: m.daysSubtracted,
  hostMeals: m.hostMeals,
  privateCarKm: m.privateCarKm,
  isAdvanceHolder: m.isAdvanceHolder,
})

/**
 * The rates of a member on their departure date: the zone's row for their rank plus the flat rates. `null` when
 * the member has no rank, the zone has no row for it on that date, or no km per litre is set (the set is not in
 * effect yet); the calculation decides whether that member needed one.
 */
async function memberRates(zone: ZoneCode, m: MemberRow): Promise<MemberRates | null> {
  if (!m.rankCode) return null
  const on = m.departureDate
  const [rate, sameDay, fuelPrice, kmPerLitre] = await Promise.all([
    rateOn(zone, m.rankCode as RankCode, on),
    flatRateOn('same_day', on),
    flatRateOn('fuel_price', on),
    flatRateOn('km_per_litre', on),
  ])
  if (!rate || !kmPerLitre) return null
  return {
    ...rate,
    sameDay: sameDay?.amount ?? null,
    fuelPrice: fuelPrice?.amount ?? null,
    kmPerLitre: kmPerLitre.amount,
  }
}

/**
 * Everything `calculate` needs for an agreement (spec §9): the agreement and its members as submitted, each
 * member's rates on their departure date, and the group advance on `travelFrom` (domestic by header days, border
 * and overseas by group size) when the agreement has one.
 */
export async function loadCalcInput(agreementId: string): Promise<{
  agreement: CalcAgreement
  rates: Map<string, MemberRates | null>
  advance: { amount: Amount; currency: Currency; effectiveFrom: string } | null
}> {
  const row = await findAgreement(agreementId)
  if (!row) throw AppError.notFound()
  // Set on submission; an approved agreement always has one.
  if (!row.zoneCode) throw new Error(`agreement ${agreementId} has no zone`)
  const members = await membersOf(agreementId)
  const zone = await zoneOf(row.zoneCode as ZoneCode)
  const rates = new Map<string, MemberRates | null>()
  for (const m of members) rates.set(m.eid, await memberRates(zone.code, m))
  let advance = null
  if (row.hasAdvance)
    advance =
      zone.kind === 'domestic'
        ? await advanceOn('domestic_days', daysInclusive(row.travelFrom, row.travelTo), row.travelFrom)
        : await advanceOn('group_size', members.length, row.travelFrom)
  return {
    agreement: {
      formType: row.formType,
      policyOption: row.policyOption,
      overnight: row.overnight,
      sameDayOver50km: row.sameDayOver50km,
      hasAdvance: row.hasAdvance,
      travelFrom: row.travelFrom,
      travelTo: row.travelTo,
      zoneKind: zone.kind,
      members: members.map(toCalcMember),
    },
    rates,
    advance,
  }
}
