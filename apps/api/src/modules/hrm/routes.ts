import { AppError } from '@elvine-sk/platform-core'
import { paginate } from '@elvine-sk/platform-db'
import {
  createRoute,
  dataOf,
  ErrorSchema,
  errorResponses,
  jsonContent,
  listOf,
  listQueryFrom,
  ListQueryParams,
  requirePermission,
  sourcePicker,
  type ApiRouter,
  type ModuleContext,
} from '@elvine-sk/platform-server'
import { findEmployee, selectableEmployees } from './employees.ts'
import { EidParam, employeeOptionFields, HrmEmployeeOptionSchema, HrmEmployeeSchema } from './schema.ts'

const tags = ['HRM']
const unavailable = { 503: jsonContent(ErrorSchema, 'HRM is unavailable') }

export function hrmRoutes(api: ApiRouter, ctx: ModuleContext) {
  api.openapi(
    createRoute({
      method: 'get',
      path: '/hrm/employees',
      tags,
      summary: 'Find selectable HRM employees by EID or name (search required, 20 per page)',
      request: { query: ListQueryParams },
      responses: {
        200: jsonContent(listOf(HrmEmployeeOptionSchema), 'Employees'),
        ...errorResponses(401, 403, 422),
        ...unavailable,
      },
    }),
    async (c) => {
      const query = listQueryFrom(c, employeeOptionFields, { defaultSort: [{ field: 'eid', dir: 'asc' }] })
      const qb = selectableEmployees().select([
        'hrmEmployee.eid',
        'hrmEmployee.nameLao',
        'hrmEmployee.snameLao',
        'hrmEmployee.branchCode',
        'hrmPosition.postname as positionName',
      ])
        .$narrowType<{ eid: string }>() // selectableEmployees() excludes a NULL EID
      const picked = await sourcePicker(ctx, c, 'hrm', qb, 'hrm_employee.read', query)
      return c.json(await paginate(picked.qb, picked.query, employeeOptionFields, { tieBreaker: 'eid' }), 200)
    },
  )

  api.openapi(
    createRoute({
      method: 'get',
      path: '/hrm/employees/{eid}',
      tags,
      summary: 'A selectable HRM employee',
      request: { params: EidParam },
      responses: {
        200: jsonContent(dataOf(HrmEmployeeSchema), 'Employee'),
        ...errorResponses(401, 403, 404),
        ...unavailable,
      },
    }),
    async (c) => {
      await requirePermission(ctx, c, 'hrm_employee.read')
      const employee = await findEmployee(c.req.valid('param').eid)
      if (!employee) throw AppError.notFound()
      return c.json({ data: employee }, 200)
    },
  )
}
