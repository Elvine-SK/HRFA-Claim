import { currentDb, type DbTables, type StandardColumns } from '@elvine-sk/platform-db'

// The app's own tables as Kysely sees them after `CamelCasePlugin`, so a wrong column name fails typecheck.
// UUID columns read as strings and are written with `uuidBin`; DATE reads as `YYYY-MM-DD`; DECIMAL as a string;
// TINYINT(1) as a boolean.

export interface TravelRanksTable {
  code: string
  nameLo: string
  nameEn: string
  sortOrder: number
}
export interface TravelRankMapTable extends StandardColumns {
  postType: number
  rankCode: string
}
export interface TravelZonesTable {
  code: string
  kind: 'domestic' | 'border' | 'overseas'
  currency: 'LAK' | 'USD'
  nameLo: string
  nameEn: string
  sortOrder: number
}
export interface TravelCountriesTable extends StandardColumns {
  iso2: string
  nameLo: string
  nameEn: string
  zoneCode: string
}
export interface TravelBorderRoutesTable extends StandardColumns {
  nameLo: string
  nameEn: string
  active: boolean
}
interface SetRow {
  id: string
  effectiveFrom: string
  createdAt: Date
  createdBy: string | null
}
export interface TravelRatesTable extends SetRow {
  zoneCode: string
  rankCode: string
  daily: string
  accommodation: string
  personal: string | null
}
export interface TravelFlatRatesTable extends SetRow {
  key: 'same_day' | 'fuel_price' | 'km_per_litre'
  amount: string
}
export interface TravelAdvanceBandsTable extends SetRow {
  kind: 'domestic_days' | 'group_size'
  minCount: number
  maxCount: number | null
  amount: string
}
export interface TravelGlAccountsTable {
  gl: string
  seq: string
  nameEn: string
  nameLo: string
}

export interface AppTables {
  travelRanks: TravelRanksTable
  travelRankMap: TravelRankMapTable
  travelZones: TravelZonesTable
  travelCountries: TravelCountriesTable
  travelBorderRoutes: TravelBorderRoutesTable
  travelRates: TravelRatesTable
  travelFlatRates: TravelFlatRatesTable
  travelAdvanceBands: TravelAdvanceBandsTable
  travelGlAccounts: TravelGlAccountsTable
}

/** `currentDb()` typed with the app's tables. */
export const appDb = () => currentDb<AppTables & DbTables>()
