import { runWithContext, SYSTEM_CONTEXT, uuidBin } from '@elvine-sk/platform-db'
import { dbTestsEnabled } from '@elvine-sk/platform-db/testing'
import type { PlatformApp } from '@elvine-sk/platform-server'
import type { TestClient } from '@elvine-sk/platform-server/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { transition } from '../src/modules/settlements/procedures.ts'
import { reminderFor, sendReminders } from '../src/modules/settlements/reminders.ts'
import { appDb } from '../src/shared/db.ts'
import { domesticBodies, roleIds } from './agreement-fixtures.ts'
import { adminClient, API, bootApp, hrmClient } from './helpers.ts'
import { exportedPayment } from './payment-fixtures.ts'

const H = new Set(['2033-11-07'])

describe('settlement reminder days', () => {
  it.each([
    ['2033-11-04', null],
    ['2033-11-05', ['due', '2033-11-14']],
    ['2033-11-11', ['due', '2033-11-14']],
    ['2033-11-14', ['due_today', '2033-11-14']],
    ['2033-11-15', ['overdue', '2033-11-15']],
    ['2033-11-21', ['overdue', '2033-11-15']],
    ['2033-11-22', ['overdue', '2033-11-22']],
    ['2033-11-29', ['overdue', '2033-11-29']],
  ] as const)('on %s', (today, want) => {
    const got = reminderFor(today, '2033-11-04', H)
    expect(got && [got.kind, got.occurrence]).toEqual(want)
  })
  it('waits for a working day after the due date', () => {
    // Due Friday 2033-11-11 (no holidays): Saturday is past it, but the first overdue notice goes on Monday.
    expect(reminderFor('2033-11-12', '2033-11-04', new Set())).toBeNull()
    expect(reminderFor('2033-11-14', '2033-11-04', new Set())).toEqual({ kind: 'overdue', occurrence: '2033-11-14' })
  })
})

describe.skipIf(!dbTestsEnabled)('settlement reminders', () => {
  let platform: PlatformApp
  let admin: TestClient
  let finance: TestClient // 10120, finance officer at head office
  let hr: TestClient // 10121, HR officer at head office
  let leader: TestClient // 10122
  let holder: TestClient // 10123
  // 10124 is a member who never signed in.

  const domestic = domesticBodies(2037, '10122')
  const trip = (travelTo: string) =>
    domestic({
      hasAdvance: true,
      travelFrom: '2033-11-01',
      travelTo,
      members: [{ eid: '10122', isLeader: true }, { eid: '10123', isAdvanceHolder: true }, { eid: '10124' }],
    })

  beforeAll(async () => {
    platform = await bootApp()
    admin = await adminClient(platform)
    const [fin, officer] = await roleIds('finance_officer', 'hr_officer')
    finance = (await hrmClient(platform, admin, '10120', [fin!])).client
    hr = (await hrmClient(platform, admin, '10121', [officer!])).client
    leader = (await hrmClient(platform, admin, '10122')).client
    holder = (await hrmClient(platform, admin, '10123')).client
  })
  afterAll(async () => {
    await platform?.ctx.db.destroy()
  })

  const send = (today: string) => runWithContext(SYSTEM_CONTEXT, () => sendReminders(platform.ctx, today))
  const rowsOf = (agreementId: string) =>
    runWithContext(SYSTEM_CONTEXT, () =>
      appDb()
        .selectFrom('settlementReminders')
        .select(['kind', 'occurrence', 'recipients'])
        .where('agreementId', '=', uuidBin(agreementId))
        .orderBy('occurrence')
        .orderBy('sentAt')
        .execute(),
    )
  const told = async (client: TestClient, agreementId: string, type: string) =>
    (await client.get(`${API}/notifications?pageSize=100`)).body.data.filter(
      (n: any) => n.type === type && String(n.link).includes(agreementId),
    ).length

  it('reminds the members once per kind and day', async () => {
    const { agreement } = await exportedPayment(platform, finance, hr, trip('2033-11-04'))
    expect(await send('2033-11-05')).toBeGreaterThanOrEqual(1)
    expect(await rowsOf(agreement.id)).toEqual([{ kind: 'due', occurrence: '2033-11-14', recipients: 2 }])
    expect(await told(leader, agreement.id, 'settlements.due')).toBe(1)
    expect(await told(holder, agreement.id, 'settlements.due')).toBe(1)
    expect(await told(finance, agreement.id, 'settlements.due')).toBe(0)

    await send('2033-11-05')
    await send('2033-11-08')
    expect(await rowsOf(agreement.id)).toHaveLength(1)
    expect(await told(holder, agreement.id, 'settlements.due')).toBe(1)

    await send('2033-11-14')
    await send('2033-11-15')
    expect((await rowsOf(agreement.id)).map((r) => r.kind)).toEqual(['due', 'due_today', 'overdue'])
    expect(await told(holder, agreement.id, 'settlements.due_today')).toBe(1)
    expect(await told(holder, agreement.id, 'settlements.overdue')).toBe(1)
  })

  it('sends one overdue notice for a trip long past', async () => {
    const { agreement } = await exportedPayment(platform, finance, hr, trip('2033-11-03'))
    await send('2034-02-01')
    await send('2034-02-01')
    expect((await rowsOf(agreement.id)).map((r) => r.kind)).toEqual(['overdue'])
  })

  it('stops once the settlement is submitted', async () => {
    const { agreement } = await exportedPayment(platform, finance, hr, trip('2033-11-02'))
    const created = await holder.post(`${API}/settlements`, { agreementId: agreement.id })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    await runWithContext(SYSTEM_CONTEXT, () => transition(created.body.data.id, 1, 'in_approval'))
    await send('2033-11-04')
    expect(await rowsOf(agreement.id)).toEqual([])
  })

  it('runs every hour as a recurring job', async () => {
    const res = await admin.get(`${API}/jobs-recurring`)
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(res.body.data.find((j: any) => j.jobName === 'settlements.reminders')).toMatchObject({ schedule: '1h' })
    expect((await holder.get(`${API}/jobs-recurring`)).status).toBe(403)
  })
})
