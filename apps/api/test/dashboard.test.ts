import { runWithContext, SYSTEM_CONTEXT } from '@elvine-sk/platform-db'
import { dbTestsEnabled } from '@elvine-sk/platform-db/testing'
import type { PlatformApp } from '@elvine-sk/platform-server'
import type { TestClient } from '@elvine-sk/platform-server/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appDb } from '../src/shared/db.ts'
import { approvedAgreement, domesticBodies, roleIds } from './agreement-fixtures.ts'
import { adminClient, API, bootApp, hrmClient } from './helpers.ts'
import { exportedPayment } from './payment-fixtures.ts'

const domestic = domesticBodies(2038, '10127')
/** Leader 10127 (888010), advance holder 10131 (branch 888050). */
const team = (over: Record<string, unknown> = {}) =>
  domestic({
    hasAdvance: true,
    members: [{ eid: '10127', isLeader: true }, { eid: '10131', isAdvanceHolder: true }],
    ...over,
  })

describe.skipIf(!dbTestsEnabled)('dashboard numbers and lists', () => {
  let platform: PlatformApp
  let admin: TestClient
  let finance: TestClient // 10125, finance officer at head office
  let hr: TestClient // 10126, HR officer at head office
  let leader: TestClient // 10127
  let holder: TestClient // 10131, at branch 888050
  let brFinance: TestClient // 10130, finance officer at branch 888050

  beforeAll(async () => {
    platform = await bootApp()
    admin = await adminClient(platform)
    const [fin, officer] = await roleIds('finance_officer', 'hr_officer')
    finance = (await hrmClient(platform, admin, '10125', [fin!])).client
    hr = (await hrmClient(platform, admin, '10126', [officer!])).client
    leader = (await hrmClient(platform, admin, '10127')).client
    holder = (await hrmClient(platform, admin, '10131')).client
    brFinance = (await hrmClient(platform, admin, '10130', [fin!])).client
  })
  afterAll(async () => {
    await platform?.ctx.db.destroy()
  })

  const stat = async (client: TestClient, key: string) => {
    const res = await client.get(`${API}/dashboard/stats`)
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    return res.body.data.find((s: any) => s.key === key)?.value as number | undefined
  }

  it('lists agreements approved without a payment for Finance', async () => {
    const waiting = await approvedAgreement(platform, hr, team())
    const paid = await exportedPayment(platform, finance, hr, team())

    const res = await finance.get(`${API}/payments/agreements-without-payment?pageSize=100&sort=-travelFrom`)
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const ids = res.body.data.map((r: any) => r.id)
    expect(ids).toContain(waiting.id)
    expect(ids).not.toContain(paid.agreement.id)
    expect(res.body.data.find((r: any) => r.id === waiting.id)).toMatchObject({ ref: waiting.ref, formType: 'domestic' })
    expect(await stat(finance, 'payments.agreements_without_payment')).toBe(res.body.meta.total)

    const branch = await brFinance.get(`${API}/payments/agreements-without-payment?pageSize=100`)
    expect(branch.status).toBe(200)
    expect(branch.body.data.map((r: any) => r.id)).not.toContain(waiting.id)
    expect((await leader.get(`${API}/payments/agreements-without-payment`)).status).toBe(403)
  })

  it("lists a member's settlements to file", async () => {
    const { agreement } = await exportedPayment(
      platform,
      finance,
      hr,
      team({ travelFrom: '2034-03-01', travelTo: '2034-03-03' }),
    )
    const mine = await holder.get(`${API}/settlements/to-file`)
    expect(mine.status, JSON.stringify(mine.body)).toBe(200)
    expect(mine.body.data.find((r: any) => r.agreementId === agreement.id)).toMatchObject({
      ref: agreement.ref,
      travelTo: '2034-03-03',
      dueDate: '2034-03-10',
      settlementId: null,
      isLate: false,
    })
    expect(await stat(holder, 'settlements.to_file')).toBe(mine.body.meta.total)
    // Not a member: not in the list, whatever the caller's role.
    const theirs = await finance.get(`${API}/settlements/to-file`)
    expect(theirs.status).toBe(200)
    expect(theirs.body.data.map((r: any) => r.agreementId)).not.toContain(agreement.id)
  })

  it('counts overdue settlements for Finance only', async () => {
    const list = await finance.get(`${API}/settlements/overdue?pageSize=1`)
    expect(await stat(finance, 'settlements.overdue')).toBe(list.body.meta.total)
    expect(await stat(holder, 'settlements.overdue')).toBeUndefined()
    expect(await stat(holder, 'payments.agreements_without_payment')).toBeUndefined()
  })

  it('grants the dashboard widgets to the roles', async () => {
    const grants = await runWithContext(SYSTEM_CONTEXT, () =>
      appDb()
        .selectFrom('rolePermissions as rp')
        .innerJoin('roles as r', 'r.id', 'rp.roleId')
        .select(['r.key', 'rp.permissionKey'])
        .where('rp.permissionKey', 'like', 'widget.%')
        .execute(),
    )
    const of = (role: string) => grants.filter((g) => g.key === role).map((g) => g.permissionKey).sort()
    expect(of('employee')).toEqual(['widget.approvals', 'widget.settlements_to_file', 'widget.stats'])
    expect(of('finance_officer')).toEqual([
      'widget.agreements_without_payment',
      'widget.approvals',
      'widget.settlements_overdue',
      'widget.settlements_to_file',
      'widget.stats',
    ])
    expect(of('hr_officer')).toEqual(['widget.approvals', 'widget.stats'])
  })
})
