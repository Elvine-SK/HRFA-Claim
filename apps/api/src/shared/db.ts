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
export interface PaymentsTable extends StandardColumns {
  agreementId: string
  branchCode: string
  status: Generated<
    'calculated' | 'in_approval' | 'approved' | 'exported' | 'posted' | 'void' | 'cancelled_after_export'
  >
  calculatedAt: Date
  submittedAt: Date | null
  exportedAt: Date | null
  postedAt: Date | null
  coreRef: string | null
  cancelledAt: Date | null
  agreementLive: Generated<string | null>
}
export interface PaymentItemsTable {
  id: string
  paymentId: string
  sortOrder: number
  eid: string
  component: string
  currency: 'LAK' | 'USD'
  rate: string
  /** DECIMAL(10,3): litres for fuel, a whole count otherwise. */
  count: { readonly __select__: string; readonly __insert__: number; readonly __update__: number }
  amount: string
  basis: string
}
export interface PaymentBillsTable {
  paymentId: string
  eid: string
  night: number
  amount: string
}
export interface SettlementsTable extends StandardColumns {
  agreementId: string
  paymentId: string
  branchCode: string
  status: Generated<
    | 'draft'
    | 'in_approval'
    | 'approved'
    | 'exported'
    | 'posted'
    | 'clearing_exported'
    | 'cleared'
    | 'void'
    | 'cancelled_after_export'
  >
  zoneKind: 'domestic' | 'border' | 'overseas'
  currency: 'LAK' | 'USD'
  advance: string
  holderEid: string
  filedByEid: string
  caseKind: 'unused' | 'partly_used' | 'fully_used' | 'overspent' | null
  total: Generated<string>
  remaining: string
  dueDate: string
  leaderEid: string | null
  lateReason: string | null
  submittedAt: Date | null
  approvedAt: Date | null
  exportedAt: Date | null
  postedAt: Date | null
  coreRef: string | null
  rvsNo: string | null
  clearingExportedAt: Date | null
  clearedAt: Date | null
  clearingCoreRef: string | null
  cancelledAt: Date | null
  agreementLive: Generated<string | null>
}
export interface SettlementLinesTable {
  id: string
  settlementId: string
  sortOrder: number
  description: string
  expenseType: 'fuel' | 'fare' | null
  currency: string
  amount: string
  crossRate: string | null
  settledAmount: string
  receiptFileId: string | null
  noReceiptReason: string | null
  rateProofFileId: string | null
}
export interface PostingBatchesTable {
  id: string
  agreementId: string
  kind: 'payment' | 'settlement'
  sourceId: string
  branchCode: string
  fileName: string
  createdAt: Date
  createdBy: string | null
  cancelledAfterExportAt: Date | null
}
export interface PostingLinesTable {
  batchId: string
  lineNo: number
  account: string
  branch: string
  name: string
  ccy: 'LAK' | 'USD'
  chequeNo: string
  amount: string
  rvsNo: string
  side: 'DR' | 'CR'
  remark: string
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
  payments: PaymentsTable
  paymentItems: PaymentItemsTable
  paymentBills: PaymentBillsTable
  postingBatches: PostingBatchesTable
  settlements: SettlementsTable
  settlementLines: SettlementLinesTable
  postingLines: PostingLinesTable
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
