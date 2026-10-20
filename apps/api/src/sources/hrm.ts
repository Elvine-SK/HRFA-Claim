/**
 * Types of the HRM tables the app reads (`bcel_hrm_v3`, data source `hrm`). Written by hand: HRM's columns are
 * upper case, and `CamelCasePlugin` reads `NAME_LAO` as `nameLao` only when the query names the column, so these
 * keys are the camelCase of the column names. PascalCase columns (`hrm_position.PostName`) are written in lower case
 * (`postname`): MariaDB column names ignore case, and camelCase would turn `postName` into `post_name`. Only the
 * columns the app uses are listed. Decoding follows the
 * platform's source rules: `DECIMAL` and `DATE` are strings, `DATETIME` is a `Date`, `TINYINT(1)` is a number.
 * Structure: `test/sources/hrm.schema.sql`.
 */

export interface HrmEmployeeTable {
  eid: string | null
  nameLao: string | null
  snameLao: string | null
  nameEng: string | null
  snameEng: string | null
  branchCode: string | null
  departmentCode: string | null
  sectionCode: string | null
  unitCode: string | null
  companyCode: string | null
  positionCode: string | null
  workStatus: number | null
  isDelete: string | null
  approvedStatus: string | null
}

export interface HrmPositionTable {
  postid: number
  postname: string | null
  postnameeng: string | null
  posttype: number | null
  poststatus: string | null
}

export interface HrmBranchTable {
  branchId: string | null
  nameLa: string | null
  nameEn: string | null
}

export interface HrmDepartmentTable {
  deptId: string | null
  nameLa: string | null
  nameEn: string | null
}

export interface HrmSectionTable {
  sectId: string | null
  nameLa: string | null
  nameEn: string | null
}

export interface HrmUnitTable {
  unitId: string | null
  fullNameLa: string | null
  fullNameEn: string | null
}

export interface HrmEmployeeAccountCurrencyTable {
  id: number
  eid: string
  ccy: string
  accountNo: string
  accountName: string
  isDeleted: number
  createdAt: Date | null
}

export interface TbCurrentLoginTable {
  eid: string
  sessionToken: string
  lastAct: Date | null
}

export interface TbHolidayTable {
  holidayDate: string | null
  holidayDesc: string | null
  status: string | null
}

export interface TbAppHandoffTable {
  codeHash: string
  eid: string
  createdAt: Date
  expiresAt: Date
}

export interface HrmDatabase {
  hrmEmployee: HrmEmployeeTable
  hrmPosition: HrmPositionTable
  hrmBranch: HrmBranchTable
  hrmDepartment: HrmDepartmentTable
  hrmSection: HrmSectionTable
  hrmUnit: HrmUnitTable
  hrmEmployeeAccountCurrency: HrmEmployeeAccountCurrencyTable
  tbCurrentLogin: TbCurrentLoginTable
  tbHoliday: TbHolidayTable
  tbAppHandoff: TbAppHandoffTable
}

declare module '@elvine-sk/platform-db' {
  interface DataSources {
    hrm: HrmDatabase
  }
}
