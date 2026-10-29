import { setClock, uuidv7 } from '@elvine-sk/platform-core'
import { createdStamp, inTransaction, runWithContext, SYSTEM_CONTEXT } from '@elvine-sk/platform-db'
import { dbTestsEnabled } from '@elvine-sk/platform-db/testing'
import type { PlatformApp } from '@elvine-sk/platform-server'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { nextRef, transition } from '../src/modules/agreements/procedures.ts'
import { appDb } from '../src/shared/db.ts'
import { bootApp } from './helpers.ts'

describe.skipIf(!dbTestsEnabled)('agreement procedures', () => {
  let platform: PlatformApp
  const sys = <T>(fn: () => Promise<T>) => runWithContext(SYSTEM_CONTEXT, fn)
  let n = 100

  /** A minimal form 1 draft written straight to the table. */
  const draftRow = (over: { docNo?: string } = {}) =>
    sys(async () => {
      const id = uuidv7()
      n += 1
      await appDb()
        .insertInto('agreements')
        .values({
          ...createdStamp(id),
          ref: `TA-2099-${String(n).padStart(6, '0')}`,
          formType: 'domestic',
          subject: 'Audit',
          title: 'Branch audit',
          reference: null,
          docNo: over.docNo ?? `${String(n).padStart(4, '0')}.BCEL.888099.2026`,
          docDate: '2026-10-29',
          branchCode: '888010',
          travelFrom: '2026-11-02',
          travelTo: '2026-11-05',
          fromProvinceCode: '01',
          toProvinceCode: '06',
          policyOption: 'bcel_all',
          hasAdvance: false,
        })
        .execute()
      return id
    })

  beforeAll(async () => {
    platform = await bootApp()
  })
  afterEach(() => setClock(null))
  afterAll(async () => {
    await platform?.ctx.db.destroy()
  })

  it('issues REFs in order, per year, without gaps under concurrency', async () => {
    // Years no other test file issues REFs in (the test database is shared by the files of a run).
    setClock(() => new Date('2031-12-31T10:00:00Z'))
    const refs = await Promise.all(Array.from({ length: 5 }, () => sys(() => inTransaction(nextRef))))
    expect([...refs].sort()).toEqual([
      'TA-2031-000001',
      'TA-2031-000002',
      'TA-2031-000003',
      'TA-2031-000004',
      'TA-2031-000005',
    ])
    setClock(() => new Date('2031-12-31T18:00:00Z')) // 2032-01-01 in HRM time
    expect(await sys(() => inTransaction(nextRef))).toBe('TA-2032-000001')
  })

  it('allows only the listed transitions', async () => {
    const id = await draftRow()
    await expect(sys(() => transition(id, 1, 'approved'))).rejects.toMatchObject({
      code: 'agreements.bad_transition',
      status: 409,
    })
    await expect(sys(() => transition(id, 1, 'cancelled', ''))).rejects.toMatchObject({
      code: 'agreements.reason_required',
      status: 422,
    })
    await expect(sys(() => transition(id, 9, 'in_approval'))).rejects.toMatchObject({ status: 409 })
    await expect(sys(() => transition(uuidv7(), 1, 'in_approval'))).rejects.toMatchObject({ status: 404 })
    expect(await sys(() => transition(id, 1, 'in_approval'))).toBe(2)
    const row = await sys(() =>
      appDb().selectFrom('agreements').select(['status', 'submittedAt']).where('ref', 'is not', null).execute(),
    )
    expect(row.some((r) => r.status === 'in_approval' && r.submittedAt)).toBe(true)
    expect(await sys(() => transition(id, 2, 'draft'))).toBe(3)
    expect(await sys(() => transition(id, 3, 'cancelled', 'wrong dates'))).toBe(4)
    await expect(sys(() => transition(id, 4, 'draft'))).rejects.toMatchObject({ code: 'agreements.bad_transition' })
  })

  it('keeps one live agreement per Doc.no', async () => {
    const a = await draftRow({ docNo: '9999.BCEL.888099.2026' })
    await expect(draftRow({ docNo: '9999.BCEL.888099.2026' })).rejects.toThrow()
    await sys(() => transition(a, 1, 'cancelled', 'wrong dates'))
    await expect(draftRow({ docNo: '9999.BCEL.888099.2026' })).resolves.toBeTruthy()
  })

  it('seeds the HR roles with their permissions', async () => {
    const roles = await sys(() =>
      appDb()
        .selectFrom('roles')
        .select('key')
        .where('key', 'in', ['hr_officer', 'hr_section_head', 'hr_department_head', 'management', 'finance_officer'])
        .execute(),
    )
    expect(roles).toHaveLength(5)
    const keys = await sys(() =>
      appDb()
        .selectFrom('rolePermissions')
        .innerJoin('roles', 'roles.id', 'rolePermissions.roleId')
        .select('rolePermissions.permissionKey')
        .where('roles.key', '=', 'hr_officer')
        .execute(),
    )
    expect(keys.map((k) => k.permissionKey).sort()).toEqual([
      'agreement.cancel',
      'agreement.create',
      'agreement.read',
      'hrm_employee.read',
    ])
  })
})
