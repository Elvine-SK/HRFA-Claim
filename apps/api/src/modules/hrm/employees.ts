import { source } from '@elvine-sk/platform-db'
import { sql } from '@elvine-sk/platform-db'
import '../../sources/hrm.ts'

/** An HRM employee as the app sees one: names, organisation and position, joined from HRM's code tables. */
export interface HrmEmployee {
  eid: string
  nameLao: string
  snameLao: string
  nameEng: string | null
  snameEng: string | null
  branchCode: string
  branchName: string | null
  departmentCode: string | null
  departmentName: string | null
  sectionCode: string | null
  sectionName: string | null
  unitCode: string | null
  unitName: string | null
  positionCode: string | null
  positionName: string | null
  postType: number | null
}

/**
 * Employees the app may select (spec §5, ຂ3): not deleted, approved, working, and of BCEL itself (company `00`).
 * Joined to position, branch, department, section and unit; callers choose the columns.
 */
export function selectableEmployees() {
  return source('hrm')
    .selectFrom('hrmEmployee')
    .leftJoin('hrmPosition', (j) => j.on('hrmPosition.postid', '=', sql`hrm_employee.POSITION_CODE`))
    .leftJoin('hrmBranch', 'hrmBranch.branchId', 'hrmEmployee.branchCode')
    .leftJoin('hrmDepartment', 'hrmDepartment.deptId', 'hrmEmployee.departmentCode')
    .leftJoin('hrmSection', 'hrmSection.sectId', 'hrmEmployee.sectionCode')
    // Unit ids repeat across branches; `hrm_unit` is keyed by (BRANCH_ID, UNIT_ID).
    .leftJoin('hrmUnit', (j) =>
      j.onRef('hrmUnit.unitId', '=', 'hrmEmployee.unitCode').onRef('hrmUnit.branchId', '=', 'hrmEmployee.branchCode'),
    )
    .where('hrmEmployee.isDelete', '=', 'N')
    .where('hrmEmployee.approvedStatus', '=', 'A')
    .where('hrmEmployee.workStatus', '=', 1)
    .where('hrmEmployee.companyCode', '=', '00')
    .where('hrmEmployee.eid', 'is not', null)
}

export async function findEmployee(eid: string): Promise<HrmEmployee | null> {
  const row = await selectableEmployees()
    .select([
      'hrmEmployee.eid',
      'hrmEmployee.nameLao',
      'hrmEmployee.snameLao',
      'hrmEmployee.nameEng',
      'hrmEmployee.snameEng',
      'hrmEmployee.branchCode',
      'hrmBranch.nameLa as branchName',
      'hrmEmployee.departmentCode',
      'hrmDepartment.nameLa as departmentName',
      'hrmEmployee.sectionCode',
      'hrmSection.nameLa as sectionName',
      'hrmEmployee.unitCode',
      'hrmUnit.fullNameLa as unitName',
      'hrmEmployee.positionCode',
      'hrmPosition.postname as positionName',
      'hrmPosition.posttype as postType',
    ])
    .where('hrmEmployee.eid', '=', eid)
    .executeTakeFirst()
  if (!row) return null
  return {
    ...row,
    eid: row.eid!,
    nameLao: row.nameLao ?? '',
    snameLao: row.snameLao ?? '',
    branchCode: row.branchCode ?? '888010',
  }
}
