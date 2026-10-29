import { runWithContext, SYSTEM_CONTEXT, uuidBin } from '@elvine-sk/platform-db'
import { dbTestsEnabled } from '@elvine-sk/platform-db/testing'
import type { PlatformApp } from '@elvine-sk/platform-server'
import type { TestClient } from '@elvine-sk/platform-server/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { transition } from '../src/modules/payments/procedures.ts'
import { rateOn } from '../src/modules/travel-master/lookups.ts'
import { addAmounts, compareAmounts, mulAmount } from '../src/modules/travel-master/money.ts'
import { appDb } from '../src/shared/db.ts'
import { approvedAgreement, domesticBodies, roleIds } from './agreement-fixtures.ts'
import { adminClient, API, bootApp, hrmClient } from './helpers.ts'

const url = (p = '') => `${API}/payments${p}`
const domestic = domesticBodies(2030, '10052')
let seq = 600 // 888020 Doc.nos this file builds by hand

const items = (member: any) => member.items.map((i: any) => [i.component, i.currency, i.rate, i.count, i.amount])

describe.skipIf(!dbTestsEnabled)('payments (calculate and checking table)', () => {
  let platform: PlatformApp
  let admin: TestClient
  let hoFinance: TestClient // 10050, finance officer at head office
  let hoHr: TestClient // 10051, HR officer at head office
  let brFinance: TestClient // 10060, finance officer at branch 888020
  let brHr: TestClient // 10061, HR officer at branch 888020

  beforeAll(async () => {
    platform = await bootApp()
    admin = await adminClient(platform)
    const [finance, officer] = await roleIds('finance_officer', 'hr_officer')
    hoFinance = (await hrmClient(platform, admin, '10050', [finance!])).client
    hoHr = (await hrmClient(platform, admin, '10051', [officer!])).client
    brFinance = (await hrmClient(platform, admin, '10060', [finance!])).client
    brHr = (await hrmClient(platform, admin, '10061', [officer!])).client
  })
  afterAll(async () => {
    await platform?.ctx.db.destroy()
  })

  const twoMembers = { members: [{ eid: '10052', isLeader: true }, { eid: '10053' }] }

  it('calculates an approved agreement', async () => {
    const a = await approvedAgreement(platform, hoHr, domestic(twoMembers))
    const res = await hoFinance.post(url(), { agreementId: a.id })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    const p = res.body.data
    expect(p).toMatchObject({ agreementId: a.id, ref: a.ref, branchCode: '888010', status: 'calculated', version: 1 })
    const rate = (await runWithContext(SYSTEM_CONTEXT, () => rateOn('D', 'P3', '2026-11-02')))!
    // 4 days, 3 nights, each member.
    const expected = [
      ['daily', 'LAK', rate.daily, 4, mulAmount(rate.daily, 4)],
      ['accommodation', 'LAK', rate.accommodation, 3, mulAmount(rate.accommodation, 3)],
    ]
    expect(p.members.map((m: any) => m.eid)).toEqual(['10052', '10053'])
    for (const m of p.members) expect(items(m)).toEqual(expected)
    const one = addAmounts(mulAmount(rate.daily, 4), mulAmount(rate.accommodation, 3))
    expect(p.totals).toEqual({ LAK: addAmounts(one, one) })
    expect(p.flags).toEqual([]) // no night from day 8
    expect(p.bills).toEqual([])

    const read = await hoFinance.get(url(`/${p.id}`))
    expect(read.status).toBe(200)
    expect(read.body.data.totals).toEqual(p.totals)
    const history = await runWithContext(SYSTEM_CONTEXT, () =>
      appDb()
        .selectFrom('recordHistory')
        .select(['action', 'version'])
        .where('entityType', '=', 'payment')
        .where('entityId', '=', uuidBin(p.id))
        .execute(),
    )
    expect(history).toEqual([{ action: 'create', version: 1 }])
  })

  it('refuses a second payment', async () => {
    const a = await approvedAgreement(platform, hoHr, domestic(twoMembers))
    expect((await hoFinance.post(url(), { agreementId: a.id })).status).toBe(201)
    const again = await hoFinance.post(url(), { agreementId: a.id })
    expect([again.status, again.body.error.code]).toEqual([409, 'payments.exists'])
    const list = await hoFinance.get(url(`?filter[agreementId][eq]=${a.id}`))
    expect(list.body.meta.total).toBe(1)
  })

  it('refuses a draft agreement', async () => {
    const draft = (await hoHr.post(`${API}/agreements`, domestic(twoMembers))).body.data
    const res = await hoFinance.post(url(), { agreementId: draft.id })
    expect([res.status, res.body.error.code]).toEqual([409, 'payments.agreement_not_approved'])
  })

  it('refuses a missing rate', async () => {
    const a = await approvedAgreement(
      platform,
      hoHr,
      domestic({ travelFrom: '2025-12-31', travelTo: '2026-01-03', members: [{ eid: '10052', isLeader: true }] }),
    )
    const res = await hoFinance.post(url(), { agreementId: a.id })
    expect([res.status, res.body.error.code], JSON.stringify(res.body)).toEqual([422, 'payments.rate_missing'])
    expect(res.body.error.details).toEqual([
      expect.objectContaining({ path: 'members.0.departureDate', code: 'payments.rate_missing' }),
    ])
    const list = await hoFinance.get(url(`?filter[agreementId][eq]=${a.id}`))
    expect(list.status).toBe(200)
    expect(list.body.meta.total).toBe(0)
  })

  it('day 8 bills', async () => {
    const a = await approvedAgreement(
      platform,
      hoHr,
      domestic({ travelTo: '2026-11-11', members: [{ eid: '10052', isLeader: true }] }),
    )
    const p = (await hoFinance.post(url(), { agreementId: a.id })).body.data
    expect(p.flags).toEqual([{ eid: '10052', billedNights: [8, 9] }])
    const rate = (await runWithContext(SYSTEM_CONTEXT, () => rateOn('D', 'P3', '2026-11-02')))!
    expect(items(p.members[0])).toContainEqual(['accommodation', 'LAK', rate.accommodation, 7, mulAmount(rate.accommodation, 7)])

    const billed = await hoFinance.put(url(`/${p.id}/bills`), {
      version: 1,
      bills: [{ eid: '10052', night: 8, amount: '100000' }],
    })
    expect(billed.status, JSON.stringify(billed.body)).toBe(200)
    expect(billed.body.data.version).toBe(2)
    expect(billed.body.data.bills).toEqual([{ eid: '10052', night: 8, amount: '100000.00' }])
    const paid = compareAmounts('100000', rate.accommodation) > 0 ? rate.accommodation : '100000.00'
    expect(items(billed.body.data.members[0])).toContainEqual(['billed_accommodation', 'LAK', paid, 1, paid])

    const wrong = await hoFinance.put(url(`/${p.id}/bills`), {
      version: 2,
      bills: [{ eid: '10052', night: 3, amount: '100000' }],
    })
    expect([wrong.status, wrong.body.error.code]).toEqual([422, 'payments.night_invalid'])
    expect(wrong.body.error.details[0]).toMatchObject({ path: 'bills.0.night', code: 'payments.night_invalid' })
    const stale = await hoFinance.put(url(`/${p.id}/bills`), { version: 1, bills: [] })
    expect(stale.status).toBe(409)
  })

  it('recalculates a calculated payment only', async () => {
    const a = await approvedAgreement(platform, hoHr, domestic(twoMembers))
    const p = (await hoFinance.post(url(), { agreementId: a.id })).body.data
    const res = await hoFinance.post(url(`/${p.id}/recalculate`), { version: 1 })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(res.body.data).toMatchObject({ version: 2, totals: p.totals })
    await runWithContext(SYSTEM_CONTEXT, () => transition(p.id, 2, 'in_approval'))
    const locked = await hoFinance.post(url(`/${p.id}/recalculate`), { version: 3 })
    expect([locked.status, locked.body.error.code]).toEqual([409, 'payments.not_calculated'])
    const bills = await hoFinance.put(url(`/${p.id}/bills`), { version: 3, bills: [] })
    expect([bills.status, bills.body.error.code]).toEqual([409, 'payments.not_calculated'])
  })

  it('branch scope', async () => {
    const hoA = await approvedAgreement(platform, hoHr, domestic(twoMembers))
    const hoP = (await hoFinance.post(url(), { agreementId: hoA.id })).body.data
    const other = await approvedAgreement(platform, hoHr, domestic(twoMembers))

    // The branch sees no head office payment, and cannot create one.
    expect((await brFinance.get(url(`/${hoP.id}`))).status).toBe(404)
    expect((await brFinance.get(url(`/lookup?number=${hoA.ref}`))).status).toBe(404)
    expect((await brFinance.post(url(), { agreementId: other.id })).status).toBe(404)
    // Other test files share the database and may leave payments of this branch; none of head office shows.
    const own = await brFinance.get(url('?pageSize=100'))
    expect(own.status).toBe(200)
    expect(own.body.data.map((p: any) => p.branchCode).filter((b: string) => b !== '888020')).toEqual([])

    const brA = await approvedAgreement(
      platform,
      brHr,
      domestic({ docNo: `${++seq}.BCEL.888020.2030`, members: [{ eid: '10061', isLeader: true }] }),
    )
    const brP = await brFinance.post(url(), { agreementId: brA.id })
    expect(brP.status, JSON.stringify(brP.body)).toBe(201)
    expect(brP.body.data.branchCode).toBe('888020')
    const brList = (await brFinance.get(url('?pageSize=100'))).body.data.map((p: any) => p.id)
    expect(brList).toContain(brP.body.data.id)
    expect(brList).not.toContain(hoP.id)

    // Head office sees both.
    const hoList = (await hoFinance.get(url('?pageSize=100'))).body.data.map((p: any) => p.id)
    expect(hoList).toEqual(expect.arrayContaining([hoP.id, brP.body.data.id]))
    expect((await hoFinance.get(url(`/${brP.body.data.id}`))).status).toBe(200)
    const byDocNo = await hoFinance.get(url(`/lookup?number=${encodeURIComponent(brA.docNo)}`))
    expect(byDocNo.body.data).toEqual({ agreementId: brA.id, paymentId: brP.body.data.id })
    const unpaid = await hoFinance.get(url(`/lookup?number=${other.ref}`))
    expect(unpaid.body.data).toEqual({ agreementId: other.id, paymentId: null })
    expect((await hoFinance.get(url('/lookup?number=TA-2030-999999'))).status).toBe(404)
  })

  it('refuses without the right', async () => {
    const a = await approvedAgreement(platform, hoHr, domestic(twoMembers))
    const res = await hoHr.post(url(), { agreementId: a.id })
    expect(res.status).toBe(403)
    const p = (await hoFinance.post(url(), { agreementId: a.id })).body.data
    // An HR officer reads agreements, not payments.
    expect((await hoHr.get(url(`/${p.id}`))).status).toBe(404)
    expect((await hoHr.get(url())).body.meta.total).toBe(0)
    expect((await hoHr.post(url(`/${p.id}/recalculate`), { version: 1 })).status).toBe(404)
  })
})
