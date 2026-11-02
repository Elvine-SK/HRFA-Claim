import { dbTestsEnabled } from '@elvine-sk/platform-db/testing'
import type { PlatformApp } from '@elvine-sk/platform-server'
import type { TestClient } from '@elvine-sk/platform-server/testing'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { approve, createWorkflow, domesticBodies, roleIds } from './agreement-fixtures.ts'
import { adminClient, API, bootApp, hrmClient } from './helpers.ts'
import { attachFile, exportedPayment } from './payment-fixtures.ts'

const url = (p = '') => `${API}/settlements${p}`
const domestic = domesticBodies(2034, '10102')
let seq = 900 // 888050 Doc.nos this file builds by hand

/** Leader 10102, advance holder 10103, deputy 10104. */
const team = {
  hasAdvance: true,
  members: [
    { eid: '10102', isLeader: true },
    { eid: '10103', isAdvanceHolder: true },
    { eid: '10104', isDeputy: true },
  ],
}

describe.skipIf(!dbTestsEnabled)('settlements (submit and approval chain)', () => {
  let platform: PlatformApp
  let admin: TestClient
  let finance: TestClient // 10100, finance officer at head office
  let hr: TestClient // 10101, HR officer at head office
  let leader: TestClient // 10102
  let holder: TestClient // 10103
  let sectionHead: TestClient // 10106, finance section head at head office
  let departmentHead: TestClient // 10107, head of the Administration–Finance department
  let brFinance: TestClient // 10110, office–IT officer at branch 888050 (finance officer)
  let brMember: TestClient // 10111
  let brSectionHead: TestClient // 10112, office–IT section head (finance section head)
  let brManagement: TestClient // 10113, branch management

  beforeAll(async () => {
    platform = await bootApp()
    admin = await adminClient(platform)
    await createWorkflow(admin, join(import.meta.dirname, '../src/modules/settlements/workflow.json'))
    const [fin, head, dept, mgmt, officer] = await roleIds(
      'finance_officer',
      'finance_section_head',
      'finance_department_head',
      'management',
      'hr_officer',
    )
    finance = (await hrmClient(platform, admin, '10100', [fin!])).client
    hr = (await hrmClient(platform, admin, '10101', [officer!])).client
    leader = (await hrmClient(platform, admin, '10102')).client
    holder = (await hrmClient(platform, admin, '10103')).client
    sectionHead = (await hrmClient(platform, admin, '10106', [head!])).client
    departmentHead = (await hrmClient(platform, admin, '10107', [dept!])).client
    brFinance = (await hrmClient(platform, admin, '10110', [fin!])).client
    brMember = (await hrmClient(platform, admin, '10111')).client
    brSectionHead = (await hrmClient(platform, admin, '10112', [head!])).client
    brManagement = (await hrmClient(platform, admin, '10113', [mgmt!])).client
  })
  afterAll(async () => {
    await platform?.ctx.db.destroy()
  })

  /** A draft settlement filed by `by`, with one fare line of 1,000,000 LAK and its receipt. */
  async function drafted(by: TestClient, body: Record<string, unknown> = domestic(team), payer = finance) {
    const { agreement } = await exportedPayment(platform, payer, hr, body)
    const created = await by.post(url(), { agreementId: agreement.id })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    const id = created.body.data.id as string
    const receipt = await attachFile(platform, by, 'settlement', id)
    expect(receipt.status, JSON.stringify(receipt.body)).toBe(201)
    const saved = await by.put(url(`/${id}`), {
      version: 1,
      caseKind: 'partly_used',
      lines: [
        { description: 'Bus tickets', expenseType: 'fare', currency: 'LAK', amount: '1000000', receiptFileId: receipt.body.data.id },
      ],
    })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    return saved.body.data
  }

  const get = async (id: string) => (await finance.get(url(`/${id}`))).body.data

  it('runs the head office chain: leader, finance officer, section head, department head', async () => {
    const s = await drafted(holder)
    const res = await holder.post(url(`/${s.id}/submit`), { version: s.version, leaderEid: '10102' })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(res.body.data).toMatchObject({ status: 'in_approval', leaderEid: '10102', filedByEid: '10103' })
    // The leader step comes first: Finance has nothing yet.
    expect((await finance.get(`${API}/approval/inbox`)).body.data.map((i: any) => i.entityId)).not.toContain(s.id)
    for (const step of [leader, finance, sectionHead, departmentHead]) await approve(step, s.id)
    expect((await get(s.id)).status).toBe('approved')
    const told = (await finance.get(`${API}/notifications`)).body.data.filter((n: any) => n.type === 'settlements.approved')
    expect(told.map((n: any) => n.link)).toContain(`/settlements/${s.id}`)
  })

  it('runs the branch chain and skips step 2 for a lone leader', async () => {
    seq += 1
    const body = domestic({
      docNo: `${seq}.BCEL.888050.2034`,
      hasAdvance: true,
      members: [{ eid: '10111', isLeader: true, isAdvanceHolder: true }],
    })
    const s = await drafted(brMember, body, brFinance)
    expect(s.candidates).toEqual([])
    const res = await brMember.post(url(`/${s.id}/submit`), { version: s.version })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    for (const step of [brFinance, brSectionHead, brManagement]) await approve(step, s.id)
    expect((await brFinance.get(url(`/${s.id}`))).body.data.status).toBe('approved')
  })

  it('refuses a wrong step 2 EID and leaves the settlement a draft', async () => {
    const s = await drafted(holder)
    const refused = async (body: Record<string, unknown>) => {
      const res = await holder.post(url(`/${s.id}/submit`), { version: s.version, ...body })
      expect(res.status, JSON.stringify(res.body)).toBe(422)
      return res.body.error.code
    }
    expect(await refused({ leaderEid: '10101' })).toBe('settlements.not_leader')
    expect(await refused({})).toBe('settlements.leader_required')

    // The filer's own EID: the leader filed this one.
    const own = await drafted(leader)
    const res = await leader.post(url(`/${own.id}/submit`), { version: own.version, leaderEid: '10102' })
    expect([res.status, res.body.error.code]).toEqual([422, 'settlements.own_eid'])

    // A deputy who has never opened the app has no account to take the step.
    const absent = await drafted(
      holder,
      domestic({ hasAdvance: true, members: [{ eid: '10102', isLeader: true }, { eid: '10103', isAdvanceHolder: true }, { eid: '10105', isDeputy: true }] }),
    )
    const none = await holder.post(url(`/${absent.id}/submit`), { version: absent.version, leaderEid: '10105' })
    expect([none.status, none.body.error.code]).toEqual([422, 'settlements.leader_no_account'])
    for (const id of [s.id, own.id, absent.id]) expect((await get(id)).status).toBe('draft')
  })

  it('needs a reason after the due date', async () => {
    // Returned on Monday 5 January 2026: due Monday 12 January, long past.
    const s = await drafted(holder, domestic({ ...team, travelFrom: '2026-01-02', travelTo: '2026-01-05' }))
    expect(s).toMatchObject({ dueDate: '2026-01-12', isLate: true })
    const late = await holder.post(url(`/${s.id}/submit`), { version: s.version, leaderEid: '10102' })
    expect([late.status, late.body.error.code]).toEqual([422, 'settlements.late_reason_required'])
    const ok = await holder.post(url(`/${s.id}/submit`), {
      version: s.version,
      leaderEid: '10102',
      lateReason: 'Receipts came late from the hotel',
    })
    expect(ok.status, JSON.stringify(ok.body)).toBe(200)
    expect(ok.body.data.lateReason).toBe('Receipts came late from the hotel')
  })

  it('refuses a case that does not match the totals, or no case', async () => {
    const s = await drafted(holder)
    const unused = await holder.put(url(`/${s.id}`), { version: s.version, caseKind: 'unused', lines: s.lines.map(line) })
    const res = await holder.post(url(`/${s.id}/submit`), { version: unused.body.data.version, leaderEid: '10102' })
    expect([res.status, res.body.error.code]).toEqual([422, 'settlements.case_mismatch'])
    const blank = await holder.put(url(`/${s.id}`), { version: unused.body.data.version, caseKind: null, lines: s.lines.map(line) })
    const none = await holder.post(url(`/${s.id}/submit`), { version: blank.body.data.version, leaderEid: '10102' })
    expect([none.status, none.body.error.code]).toEqual([422, 'settlements.case_required'])
  })

  it('goes back to draft when returned, and the filer is told', async () => {
    const s = await drafted(holder)
    expect((await holder.post(url(`/${s.id}/submit`), { version: s.version, leaderEid: '10102' })).status).toBe(200)
    await approve(leader, s.id)
    await approve(finance, s.id, 'return')
    const back = await get(s.id)
    expect(back.status).toBe('draft')
    const edit = await holder.put(url(`/${s.id}`), { version: back.version, caseKind: 'partly_used', lines: back.lines.map(line) })
    expect(edit.status, JSON.stringify(edit.body)).toBe(200)
    const told = (await holder.get(`${API}/notifications`)).body.data.filter((n: any) => n.type === 'settlements.returned')
    expect(told.map((n: any) => n.link)).toContain(`/settlements/${s.id}`)
    // Resubmitted: the chain starts again with the leader.
    const again = await holder.post(url(`/${s.id}/submit`), { version: edit.body.data.version, leaderEid: '10102' })
    expect(again.status, JSON.stringify(again.body)).toBe(200)
    expect((await leader.get(`${API}/approval/inbox`)).body.data.map((i: any) => i.entityId)).toContain(s.id)
  })

  it('refuses a submission by someone who is not a member', async () => {
    const s = await drafted(holder)
    expect((await finance.post(url(`/${s.id}/submit`), { version: s.version, leaderEid: '10102' })).status).toBe(404)
  })
})

/** A stored line as the draft body takes it again. */
function line(l: any) {
  const out: Record<string, unknown> = { description: l.description, currency: l.currency, amount: l.amount }
  for (const k of ['expenseType', 'crossRate', 'receiptFileId', 'noReceiptReason', 'rateProofFileId'])
    if (l[k] !== null) out[k] = l[k]
  return out
}
