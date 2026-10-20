import type { FieldMap } from '@elvine-sk/platform-core'
import { z } from '@elvine-sk/platform-server'

export const HrmEmployeeSchema = z
  .object({
    eid: z.string(),
    nameLao: z.string(),
    snameLao: z.string(),
    nameEng: z.string().nullable(),
    snameEng: z.string().nullable(),
    branchCode: z.string(),
    branchName: z.string().nullable(),
    departmentCode: z.string().nullable(),
    departmentName: z.string().nullable(),
    sectionCode: z.string().nullable(),
    sectionName: z.string().nullable(),
    unitCode: z.string().nullable(),
    unitName: z.string().nullable(),
    positionCode: z.string().nullable(),
    positionName: z.string().nullable(),
    postType: z.number().int().nullable(),
  })
  .openapi('HrmEmployee')

/** What the picker returns: few columns, so giving every requester the picker permission stays acceptable. */
export const HrmEmployeeOptionSchema = z
  .object({
    eid: z.string(),
    nameLao: z.string().nullable(),
    snameLao: z.string().nullable(),
    branchCode: z.string().nullable(),
    positionName: z.string().nullable(),
  })
  .openapi('HrmEmployeeOption')

export const EidParam = z.object({ eid: z.string().regex(/^\d{5}$/) })

/** Picker search and sort; only `hrm_employee` columns, so no name is ambiguous across the joins. */
export const employeeOptionFields: FieldMap = {
  eid: { type: 'string', sortable: true, searchable: true },
  nameLao: { type: 'string', sortable: true, searchable: true },
  snameLao: { type: 'string', searchable: true },
  nameEng: { type: 'string', searchable: true },
  snameEng: { type: 'string', searchable: true },
}
