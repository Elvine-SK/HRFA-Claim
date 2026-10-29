import { dbTestsEnabled } from '@elvine-sk/platform-db/testing'
import type { PlatformApp } from '@elvine-sk/platform-server'
import { TEST_ORIGIN, type TestClient } from '@elvine-sk/platform-server/testing'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { domesticBodies, roleIds } from './agreement-fixtures.ts'
import { adminClient, API, bootApp, hrmClient } from './helpers.ts'

const url = (p = '') => `${API}/agreements${p}`
const domestic = domesticBodies(2027, '10030')
const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n')

/** The workflow as an administrator creates it from `workflow.json`. */
export async function createWorkflow(admin: TestClient) {
  const file = JSON.parse(
    readFileSync(join(import.meta.dirname, '../src/modules/agreements/workflow.json'), 'utf8'),
  ) as { key: string; name: string; entityType: string; definition: unknown }
  const existing = await admin.get(`${API}/approval/workflows`)
  if (existing.body.data?.some((w: any) => w.key === file.key)) return
  const wf = await admin.post(`${API}/approval/workflows`, { key: file.key, entityType: file.entityType, name: file.name })
  expect(wf.status, JSON.stringify(wf.body)).toBe(201)
  const v = await admin.post(`${API}/approval/workflows/${wf.body.data.id}/versions`, {
    definition: file.definition,
    activate: true,
  })
  expect(v.status, JSON.stringify(v.body)).toBe(201)
}

/** Attach a signed copy (PDF) to the agreement, as the files card does. */
export async function attachPdf(platform: PlatformApp, client: TestClient, id: string, name = 'signed.pdf', type = 'application/pdf') {
  const form = new FormData()
  form.append('file', new File([PDF], name, { type }))
  form.append('entityType', 'agreement')
  form.append('entityId', id)
  const headers: Record<string, string> = { origin: TEST_ORIGIN }
  if (client.cookies.size) headers.cookie = [...client.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
  if (client.csrfToken) headers['x-csrf-token'] = client.csrfToken
  return platform.app.request(`${API}/files`, { method: 'POST', headers, body: form })
}

/** Approve the agreement's open request as `client`. */
export async function approve(client: TestClient, agreementId: string, decision: 'approve' | 'return' | 'reject' = 'approve') {
  const inbox = await client.get(`${API}/approval/inbox`)
  const item = inbox.body.data.find((i: any) => i.entityId === agreementId)
  expect(item, 'in the inbox').toBeTruthy()
  const res = await client.post(`${API}/approval/requests/${item.requestId}/${decision}`, { comment: 'checked' })
  expect(res.status, JSON.stringify(res.body)).toBe(200)
}

describe.skipIf(!dbTestsEnabled)('agreements (submit and approval)', () => {
  let platform: PlatformApp
  let admin: TestClient
  let ho: TestClient
  let sectionHead: TestClient
  let deptHead: TestClient
  let mgmt: TestClient
  let hoFinance: TestClient
  let brFinance: TestClient
  let branch: TestClient
  let branchIds: { sectionHead: string }

  /** A draft by head office with a signed copy, ready to submit. */
  async function ready(over: Record<string, unknown> = {}, by: TestClient = ho) {
    const res = await by.post(url(), domestic(over))
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    expect((await attachPdf(platform, by, res.body.data.id)).status).toBe(201)
    return res.body.data
  }

  beforeAll(async () => {
    platform = await bootApp()
    admin = await adminClient(platform)
    await createWorkflow(admin)
    const [officer, sh, dh, mg, fin] = await roleIds(
      'hr_officer',
      'hr_section_head',
      'hr_department_head',
      'management',
      'finance_officer',
    )
    ho = (await hrmClient(platform, admin, '10030', [officer!])).client
    sectionHead = (await hrmClient(platform, admin, '10031', [sh!])).client
    deptHead = (await hrmClient(platform, admin, '10032', [dh!])).client
    mgmt = (await hrmClient(platform, admin, '10033', [mg!])).client
    hoFinance = (await hrmClient(platform, admin, '10034', [fin!])).client
    brFinance = (await hrmClient(platform, admin, '10044', [fin!])).client
    branch = (await hrmClient(platform, admin, '10040', [officer!])).client
    await hrmClient(platform, admin, '10042', [dh!])
    await hrmClient(platform, admin, '10043', [mg!])
    branchIds = { sectionHead: (await hrmClient(platform, admin, '10041')).userId }
  })
  afterAll(async () => {
    await platform?.ctx.db.destroy()
  })

  it('submits, snapshots and runs the three steps', async () => {
    const a = await ready({ members: [{ eid: '10030', isLeader: true }, { eid: '10032' }] })
    const res = await ho.post(url(`/${a.id}/submit`), {})
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(res.body.data.status).toBe('in_approval')
    await approve(sectionHead, a.id)
    await approve(deptHead, a.id)
    expect((await ho.get(url(`/${a.id}`))).body.data.status).toBe('in_approval')
    await approve(mgmt, a.id)
    const done = (await ho.get(url(`/${a.id}`))).body.data
    expect(done.status).toBe('approved')
    expect(done.members.map((m: any) => [m.eid, m.rankCode, m.accountLak])).toEqual([
      ['10030', 'P3', '1030-LAK'],
      ['10032', 'P3', '1032-LAK'],
    ])
    expect(done.zoneCode).toBe('D')
    const told = (c: TestClient) =>
      c.get(`${API}/notifications`).then((r) => r.body.data.filter((n: any) => n.type === 'agreements.approved'))
    expect((await told(hoFinance)).map((n: any) => n.link)).toContain(`/agreements/${a.id}`)
    expect(await told(brFinance)).toHaveLength(0)
  })

  it('takes the rank of the post filled', async () => {
    // The own position of 10035 (PostType 9) has no rank; the post filled (PostType 7) is P3.
    const a = await ready({ members: [{ eid: '10035', isLeader: true, actingPositionCode: '12' }] })
    expect((await ho.post(url(`/${a.id}/submit`), {})).status).toBe(200)
    const got = (await ho.get(url(`/${a.id}`))).body.data.members[0]
    expect(got).toMatchObject({ rankCode: 'P3', actingPositionName: 'ຫົວໜ້າພະແນກ', positionName: 'ວິຊາການ' })
  })

  it('refuses an incomplete submission', async () => {
    const cases: [Record<string, unknown>, string, string][] = [
      [{ members: [{ eid: '10030' }] }, 'members', 'agreements.leader_required'],
      [{ hasAdvance: true, members: [{ eid: '10030', isLeader: true }] }, 'members', 'agreements.holder_required'],
      [{ members: [{ eid: '10030', isLeader: true }, { eid: '10031' }] }, 'members.1.eid', 'agreements.rank_unmapped'],
      [
        {
          formType: 'overseas',
          countryIso2: 'FR',
          fromProvinceCode: undefined,
          toProvinceCode: undefined,
          members: [{ eid: '10030', isLeader: true }, { eid: '10040' }],
        },
        'members.1.accountUsd',
        'agreements.account_missing',
      ],
    ]
    for (const [over, path, code] of cases) {
      const a = await ready(over)
      const res = await ho.post(url(`/${a.id}/submit`), {})
      expect(res.status, `${code}: ${JSON.stringify(res.body)}`).toBe(422)
      expect(res.body.error.details).toContainEqual(expect.objectContaining({ path, code }))
      expect((await ho.get(url(`/${a.id}`))).body.data.status).toBe('draft')
    }
    const bare = (await ho.post(url(), domestic())).body.data
    const res = await ho.post(url(`/${bare.id}/submit`), {})
    expect(res.body.error.details).toContainEqual(
      expect.objectContaining({ path: 'files', code: 'agreements.signed_copy_required' }),
    )
  })

  it('refuses an edit while in approval and after approval', async () => {
    const a = await ready()
    await ho.post(url(`/${a.id}/submit`), {})
    const body = { ...domestic({ docNo: a.docNo }), version: 2 }
    const locked = await ho.put(url(`/${a.id}`), body)
    expect([locked.status, locked.body.error.code]).toEqual([409, 'agreements.not_draft'])
    expect((await ho.post(url(`/${a.id}/submit`), {})).body.error.code).toBe('agreements.not_draft')
  })

  it('returns to draft when a reviewer returns it, and resubmits', async () => {
    const a = await ready()
    await ho.post(url(`/${a.id}/submit`), {})
    await approve(sectionHead, a.id, 'return')
    const back = (await ho.get(url(`/${a.id}`))).body.data
    expect(back.status).toBe('draft')
    const edited = await ho.put(url(`/${a.id}`), { ...domestic({ docNo: a.docNo, subject: 'Fixed' }), version: back.version })
    expect(edited.status, JSON.stringify(edited.body)).toBe(200)
    const again = await ho.post(url(`/${a.id}/submit`), {})
    expect(again.status, JSON.stringify(again.body)).toBe(200)
    expect(again.body.data.status).toBe('in_approval')
  })

  it('stays draft when a step has no approver', async () => {
    const a = await ready(
      { docNo: '0500.BCEL.888020.2027', members: [{ eid: '10040', isLeader: true }] },
      branch,
    )
    const res = await branch.post(url(`/${a.id}/submit`), {})
    expect([res.status, res.body.error.code]).toEqual([422, 'approval.no_approvers'])
    const still = (await branch.get(url(`/${a.id}`))).body.data
    expect([still.status, still.ref]).toEqual(['draft', a.ref])
    const [sh] = await roleIds('hr_section_head')
    expect((await admin.put(`${API}/authz/users/${branchIds.sectionHead}/roles`, { roleIds: [sh] })).status).toBe(200)
    const ok = await branch.post(url(`/${a.id}/submit`), {})
    expect(ok.status, JSON.stringify(ok.body)).toBe(200)
    expect(ok.body.data.status).toBe('in_approval')
  })

  it('refuses submit by someone out of scope', async () => {
    const a = await ready()
    expect((await branch.post(url(`/${a.id}/submit`), {})).status).toBe(404)
  })
})
