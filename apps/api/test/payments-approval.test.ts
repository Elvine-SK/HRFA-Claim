import { dbTestsEnabled } from '@elvine-sk/platform-db/testing'
import type { PlatformApp } from '@elvine-sk/platform-server'
import type { TestClient } from '@elvine-sk/platform-server/testing'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { approve, approvedAgreement, createWorkflow, domesticBodies, roleIds } from './agreement-fixtures.ts'
import { adminClient, API, bootApp, hrmClient } from './helpers.ts'

const url = (p = '') => `${API}/payments${p}`
const domestic = domesticBodies(2031, '10073')
let seq = 800 // 888020 Doc.nos this file builds by hand

describe.skipIf(!dbTestsEnabled)('payments (submit and approval)', () => {
  let platform: PlatformApp
  let admin: TestClient
  let finance: TestClient // 10070, finance officer
  let sectionHead: TestClient // 10071, finance section head
  let hr: TestClient // 10072, HR officer
  let brHr: TestClient // 10061, HR officer at branch 888020
  let brFinance: TestClient // 10060, finance officer at branch 888020

  beforeAll(async () => {
    platform = await bootApp()
    admin = await adminClient(platform)
    await createWorkflow(admin, join(import.meta.dirname, '../src/modules/payments/workflow.json'))
    const [fin, head, officer] = await roleIds('finance_officer', 'finance_section_head', 'hr_officer')
    finance = (await hrmClient(platform, admin, '10070', [fin!])).client
    sectionHead = (await hrmClient(platform, admin, '10071', [head!])).client
    hr = (await hrmClient(platform, admin, '10072', [officer!])).client
    brHr = (await hrmClient(platform, admin, '10061', [officer!])).client
    brFinance = (await hrmClient(platform, admin, '10060', [fin!])).client
  })
  afterAll(async () => {
    await platform?.ctx.db.destroy()
  })

  /** A calculated payment of a fresh approved head office agreement. */
  async function calculated(over: Record<string, unknown> = {}) {
    const a = await approvedAgreement(platform, hr, domestic({ members: [{ eid: '10073', isLeader: true }], ...over }))
    const res = await finance.post(url(), { agreementId: a.id })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    return res.body.data
  }

  const get = async (id: string) => (await finance.get(url(`/${id}`))).body.data

  it('submits and approves', async () => {
    const p = await calculated()
    const res = await finance.post(url(`/${p.id}/submit`), {})
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(res.body.data.status).toBe('in_approval')
    const inbox = await sectionHead.get(`${API}/approval/inbox`)
    expect(inbox.body.data.map((i: any) => i.entityId)).toContain(p.id)

    // Not the finance officer's own step, and not twice.
    expect((await finance.post(url(`/${p.id}/submit`), {})).status).toBe(409)

    await approve(sectionHead, p.id)
    expect((await get(p.id)).status).toBe('approved')
    const told = await finance
      .get(`${API}/notifications`)
      .then((r) => r.body.data.filter((n: any) => n.type === 'payments.approved'))
    expect(told.map((n: any) => n.link)).toContain(`/payments/${p.id}`)
    expect((await brFinance.get(`${API}/notifications`)).body.data.filter((n: any) => n.link === `/payments/${p.id}`)).toHaveLength(0)
  })

  it('refuses a submission by someone without payment.calculate', async () => {
    const p = await calculated()
    const res = await sectionHead.post(url(`/${p.id}/submit`), {})
    expect(res.status).toBe(403)
    expect((await get(p.id)).status).toBe('calculated')
  })

  it('return goes back to calculated, reject voids', async () => {
    const p = await calculated()
    expect((await finance.post(url(`/${p.id}/submit`), {})).status).toBe(200)
    await approve(sectionHead, p.id, 'return')
    const back = await get(p.id)
    expect(back.status).toBe('calculated')
    const again = await finance.post(url(`/${p.id}/recalculate`), { version: back.version })
    expect(again.status, JSON.stringify(again.body)).toBe(200)

    // The returned request is resubmitted, then rejected.
    expect((await finance.post(url(`/${p.id}/submit`), {})).status).toBe(200)
    expect((await get(p.id)).status).toBe('in_approval')
    await approve(sectionHead, p.id, 'reject')
    expect((await get(p.id)).status).toBe('void')
    const fresh = await finance.post(url(), { agreementId: p.agreementId })
    expect(fresh.status, JSON.stringify(fresh.body)).toBe(201)
    expect(fresh.body.data.id).not.toBe(p.id)
  })

  it('bills missing', async () => {
    // 10 days: nights 8 and 9 take a bill.
    const p = await calculated({ travelTo: '2026-11-11' })
    const refused = await finance.post(url(`/${p.id}/submit`), {})
    expect([refused.status, refused.body.error.code]).toEqual([422, 'payments.bills_missing'])
    expect((await get(p.id)).status).toBe('calculated')

    const saved = await finance.put(url(`/${p.id}/bills`), {
      version: p.version,
      bills: [
        { eid: '10073', night: 8, amount: '0' },
        { eid: '10073', night: 9, amount: '0' },
      ],
    })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    const ok = await finance.post(url(`/${p.id}/submit`), {})
    expect(ok.status, JSON.stringify(ok.body)).toBe(200)
    expect(ok.body.data.status).toBe('in_approval')
  })

  it('no approver', async () => {
    const a = await approvedAgreement(
      platform,
      brHr,
      domestic({ docNo: `${++seq}.BCEL.888020.2031`, members: [{ eid: '10061', isLeader: true }] }),
    )
    const p = (await brFinance.post(url(), { agreementId: a.id })).body.data
    const res = await brFinance.post(url(`/${p.id}/submit`), {})
    expect([res.status, res.body.error.code]).toEqual([422, 'approval.no_approvers'])
    expect((await brFinance.get(url(`/${p.id}`))).body.data.status).toBe('calculated')
  })
})
