import { dbTestsEnabled } from '@elvine-sk/platform-db/testing'
import type { PlatformApp } from '@elvine-sk/platform-server'
import { TestClient } from '@elvine-sk/platform-server/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { activeAccount } from '../src/modules/hrm/accounts.ts'
import { findEmployee } from '../src/modules/hrm/employees.ts'
import { holidaysBetween } from '../src/modules/hrm/holidays.ts'
import { loggedInEids } from '../src/modules/hrm/logins.ts'
import { runWithContext, SYSTEM_CONTEXT } from '@elvine-sk/platform-db'
import { employeeOfUser } from '../src/modules/auth-hrm/users.ts'
import { adminClient, API, bootApp, DOWN_URL, hrmClient, role, userWith } from './helpers.ts'

describe.skipIf(!dbTestsEnabled)('hrm read layer', () => {
  let platform: PlatformApp
  let reader: TestClient
  let noRole: TestClient

  beforeAll(async () => {
    platform = await bootApp()
    const admin = await adminClient(platform)
    reader = (await userWith(platform, admin, [await role(admin, 'hrm_reader', ['hrm_employee.read'])])).client
    noRole = (await userWith(platform, admin)).client
  })
  afterAll(async () => {
    await platform?.ctx.db.destroy()
  })

  it('finds a selectable employee with names joined', async () => {
    const e = await findEmployee('10001')
    expect(e).toEqual({
      eid: '10001',
      nameLao: 'ສົມພອນ',
      snameLao: 'ແກ້ວມະນີ',
      nameEng: 'Somphone',
      snameEng: 'Keomany',
      branchCode: '888010',
      branchName: 'ສຳນັກງານໃຫຍ່',
      departmentCode: '0101',
      departmentName: 'ພະແນກບໍລິຫານ-ການເງິນ',
      sectionCode: '0201',
      sectionName: 'ຂະແໜງການເງິນ',
      unitCode: '030101',
      unitName: 'ໜ່ວຍງານບັນຊີ',
      positionCode: '12',
      positionName: 'ຫົວໜ້າພະແນກ',
      postType: 7,
    })
  })

  it.each(['10003', '10004', '10005', '10006', '99999'])('does not return %s', async (eid) => {
    expect(await findEmployee(eid)).toBeNull()
  })

  it('takes the newest account and counts duplicates', async () => {
    expect(await activeAccount('10001', 'LAK')).toEqual({
      accountNo: '0101-NEW',
      accountName: 'SOMPHONE KEOMANY',
      count: 2,
    })
    expect(await activeAccount('10002', 'LAK')).toEqual({
      accountNo: '0201-LAK',
      accountName: 'BOUNMY SISAVATH',
      count: 1,
    })
    expect(await activeAccount('10002', 'USD')).toBeNull()
  })

  it('reads holidays, without those switched off', async () => {
    expect([...(await holidaysBetween('2033-11-01', '2033-11-30'))]).toEqual(['2033-11-07'])
  })
  it('lists logged-in EIDs', async () => {
    expect(await loggedInEids(['10001', '10002', '10003'])).toEqual(new Set(['10001', '10003']))
    expect(await loggedInEids([])).toEqual(new Set())
  })

  it('picker needs the permission', async () => {
    expect((await noRole.get(`${API}/hrm/employees?q=1000`)).status).toBe(403)
  })

  it('picker needs a search term', async () => {
    const res = await reader.get(`${API}/hrm/employees`)
    expect(res.status).toBe(422)
    expect(res.body.error.details).toEqual([expect.objectContaining({ path: 'q', code: 'search_required' })])
  })

  it('picker returns selectable employees only, few columns, capped page', async () => {
    const res = await reader.get(`${API}/hrm/employees?q=1000&pageSize=100`)
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(res.body.data.map((e: { eid: string }) => e.eid)).toEqual(['10001', '10002'])
    expect(Object.keys(res.body.data[0]).sort()).toEqual(['branchCode', 'eid', 'nameLao', 'positionName', 'snameLao'])
    expect(res.body.meta.pageSize).toBe(20)
  })

  it("joins the unit of the employee's own branch, once", async () => {
    expect((await findEmployee('10001'))!.unitName).toBe('ໜ່ວຍງານບັນຊີ')
    const res = await reader.get(`${API}/hrm/employees?q=10001`)
    expect(res.body.data.map((e: { eid: string }) => e.eid)).toEqual(['10001'])
    expect(res.body.meta.total).toBe(1)
  })

  it('picker searches Lao names', async () => {
    const res = await reader.get(`${API}/hrm/employees?q=${encodeURIComponent('ບຸນມີ')}`)
    expect(res.body.data.map((e: { eid: string }) => e.eid)).toEqual(['10002'])
  })

  it('detail needs the permission and hides non-selectable employees', async () => {
    expect((await noRole.get(`${API}/hrm/employees/10001`)).status).toBe(403)
    const ok = await reader.get(`${API}/hrm/employees/10001`)
    expect(ok.status).toBe(200)
    expect(ok.body.data).toMatchObject({ eid: '10001', postType: 7 })
    expect((await reader.get(`${API}/hrm/employees/10003`)).status).toBe(404)
  })
})

describe.skipIf(!dbTestsEnabled)('hrm geography and positions', () => {
  let platform: PlatformApp
  let admin: TestClient
  let someone: TestClient

  beforeAll(async () => {
    platform = await bootApp()
    admin = await adminClient(platform)
    someone = (await userWith(platform, admin)).client
  })
  afterAll(async () => {
    await platform?.ctx.db.destroy()
  })

  it('lists provinces and the districts of one', async () => {
    const p = await someone.get(`${API}/hrm/provinces`)
    expect(p.status).toBe(200)
    expect(p.body.data.map((x: any) => x.code)).toEqual(['01', '06', '13'])
    expect(p.body.data[0]).toEqual({ code: '01', nameLo: 'ນະຄອນຫຼວງວຽງຈັນ', nameEn: 'Vientiane Prefecture' })
    const d = await someone.get(`${API}/hrm/provinces/06/districts`)
    expect(d.body.data.map((x: any) => x.code)).toEqual(['0601', '0602'])
    expect((await someone.get(`${API}/hrm/provinces/99/districts`)).status).toBe(404)
  })

  it('searches positions and needs a term', async () => {
    expect((await someone.get(`${API}/hrm/positions?q=`)).status).toBe(422)
    const res = await someone.get(`${API}/hrm/positions?q=${encodeURIComponent('ຫົວໜ້າ')}`)
    expect(res.body.data[0]).toEqual({ code: '12', name: 'ຫົວໜ້າພະແນກ', postType: 7 })
  })

  it('needs sign-in', async () => {
    expect((await new TestClient(platform).get(`${API}/hrm/provinces`)).status).toBe(401)
    expect((await new TestClient(platform).get(`${API}/hrm/positions?q=a`)).status).toBe(401)
  })

  it('finds the employee of a signed-in HRM user', async () => {
    const { userId, client } = await hrmClient(platform, admin, '10010')
    expect((await runWithContext(SYSTEM_CONTEXT, () => employeeOfUser(userId)))?.branchCode).toBe('888010')
    expect((await client.get(`${API}/hrm/me`)).status).toBe(200)
  })
})

describe.skipIf(!dbTestsEnabled)('hrm read layer with HRM down', () => {
  let platform: PlatformApp
  let reader: TestClient

  beforeAll(async () => {
    platform = await bootApp({ hrmUrl: DOWN_URL })
    const admin = await adminClient(platform)
    reader = (await userWith(platform, admin, [await role(admin, 'hrm_reader_down', ['hrm_employee.read'])])).client
  })
  afterAll(async () => {
    await platform?.ctx.db.destroy()
  })

  it('answers 503 source.unavailable', async () => {
    const res = await reader.get(`${API}/hrm/employees?q=1000`)
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('source.unavailable')
  })
})
