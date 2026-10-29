import { currentDb, type DbTables, type StandardColumns } from '@elvine-sk/platform-db'

// The app's own tables as Kysely sees them after `CamelCasePlugin`, so a wrong column name fails typecheck.
// UUID columns read as strings and are written with `uuidBin`; DATE reads as `YYYY-MM-DD`; DECIMAL as a string;
// TINYINT(1) as a boolean.

/** Kysely's `Generated`: optional on insert (the app has no direct `kysely` dependency). */
type Generated<S> = { readonly __select__: S; readonly __insert__: S | undefined; readonly __update__: S }

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

export interface TravelPostingEntriesTable {
  id: string
  caseKey: string
  zoneKind: 'domestic' | 'border' | 'overseas'
  component: string
  side: 'DR' | 'CR'
  accountKind: 'gl' | 'member'
  gl: string | null
  seq: string | null
  sortOrder: number
}

export interface AgreementsTable extends StandardColumns {
  ref: string
  formType: 'domestic' | 'district' | 'overseas' | 'border'
  subject: string
  title: string
  reference: string | null
  docNo: string
  docDate: string
  branchCode: string
  travelFrom: string
  travelTo: string
  fromProvinceCode: string | null
  toProvinceCode: string | null
  provinceCode: string | null
  fromDistrictCode: string | null
  toDistrictCode: string | null
  overnight: boolean | null
  sameDayOver50km: boolean | null
  countryIso2: string | null
  zoneCode: string | null
  borderRouteId: string | null
  borderRouteOther: string | null
  policyOption: 'bcel_all' | 'host_travel' | 'host_accommodation' | 'host_meals' | 'host_meals_accommodation'
  hasAdvance: boolean
  status: Generated<'draft' | 'in_approval' | 'approved' | 'cancelled'>
  submittedAt: Date | null
  cancelReason: string | null
  cancelledAt: Date | null
  cancelledBy: string | null
  docNoLive: Generated<string | null>
}
export interface AgreementMembersTable {
  id: string
  agreementId: string
  sortOrder: number
  eid: string
  departureDate: string
  returnDate: string
  daysSubtracted: number
  isLeader: boolean
  isDeputy: boolean
  isAdvanceHolder: boolean
  hostMeals: number
  privateCarKm: number | null
  actingPositionCode: string | null
  nameLao: string
  snameLao: string
  nameEng: string | null
  snameEng: string | null
  branchCode: string
  departmentName: string | null
  sectionName: string | null
  positionCode: string | null
  positionName: string | null
  postType: number | null
  actingPositionName: string | null
  rankCode: string | null
  accountLak: string | null
  accountUsd: string | null
}
export interface AgreementRefCountersTable {
  year: number
  lastValue: number
}
// Platform tables the app reads directly.
export interface RolesTable {
  id: string
  key: string
}
export interface RolePermissionsTable {
  roleId: string
  permissionKey: string
}
export interface UserRolesTable {
  userId: string
  roleId: string
}
export interface GroupMembersTable {
  groupId: string
  userId: string
}
export interface GroupRolesTable {
  groupId: string
  roleId: string
}
export interface UsersTable {
  id: string
  status: string
  deletedAt: Date | null
}
export interface HrmUserLinksTable {
  eid: string
  userId: string
}
export interface FilesTable {
  id: string
  entityType: string | null
  entityId: string | null
  deletedAt: Date | null
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
  travelPostingEntries: TravelPostingEntriesTable
  agreements: AgreementsTable
  agreementMembers: AgreementMembersTable
  agreementRefCounters: AgreementRefCountersTable
  roles: RolesTable
  rolePermissions: RolePermissionsTable
  userRoles: UserRolesTable
  groupMembers: GroupMembersTable
  groupRoles: GroupRolesTable
  users: UsersTable
  hrmUserLinks: HrmUserLinksTable
  files: FilesTable
}

/** `currentDb()` typed with the app's tables. */
export const appDb = () => currentDb<AppTables & DbTables>()
