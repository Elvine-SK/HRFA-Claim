import { dbTestsEnabled } from '@elvine-sk/platform-db/testing'
import type { PlatformApp } from '@elvine-sk/platform-server'
import type { TestClient } from '@elvine-sk/platform-server/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { attachPdf, createWorkflow, domesticBodies, roleIds } from './agreement-fixtures.ts'
import { adminClient, API, bootApp, hrmClient } from './helpers.ts'

const url = (p = '') => `${API}/agreements${p}`
const domestic = domesticBodies(2028, '10030')
// 10035's own position has no rank yet (PostType 9); filling post 12 gives P3.
const TEAM = [{ eid: '10030', isLeader: true }, { eid: '10035', actingPositionCode: '12' }]

describe.skipIf(!dbTestsEnabled)('agreements (cancel and signed copies)', () => {
  let platform: PlatformApp
  let admin: TestClient
  let ho: TestClient // 10030, HR officer at head office
  let sectionHead: TestClient // 10031
  let member: TestClient // 10035, employee only
  let branch: TestClient // 10040, HR officer at branch 888020

  async function submitted(over: Record<string, unknown> = {}) {
    const a = (await ho.post(url(), domestic({ members: TEAM, ...over })))
      .body.data
    expect((await attachPdf(platform, ho, a.id)).status).toBe(201)
    const res = await ho.post(url(`/${a.id}/submit`), {})
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    return res.body.data
  }

  beforeAll(async () => {
    platform = await bootApp()
    admin = await adminClient(platform)
    await createWorkflow(admin)
    const [officer, sh, dh, mg] = await roleIds('hr_officer', 'hr_section_head', 'hr_department_head', 'management')
    ho = (await hrmClient(platform, admin, '10030', [officer!])).client
    sectionHead = (await hrmClient(platform, admin, '10031', [sh!])).client
    await hrmClient(platform, admin, '10032', [dh!])
    await hrmClient(platform, admin, '10033', [mg!])
    member = (await hrmClient(platform, admin, '10035')).client
    branch = (await hrmClient(platform, admin, '10040', [officer!])).client
  })
  afterAll(async () => {
    await platform?.ctx.db.destroy()
  })

  it('cancels in approval with a reason and frees the Doc.no', async () => {
    const a = await submitted()
    const res = await sectionHead.post(url(`/${a.id}/cancel`), { version: a.version, reason: 'Trip postponed' })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(res.body.data).toMatchObject({ status: 'cancelled', cancelReason: 'Trip postponed' })
    const inbox = await sectionHead.get(`${API}/approval/inbox`)
    expect(inbox.body.data.map((i: any) => i.entityId)).not.toContain(a.id)
    const told = await ho.get(`${API}/notifications`)
    expect(told.body.data.filter((n: any) => n.type === 'agreements.cancelled').map((n: any) => n.link)).toContain(
      `/agreements/${a.id}`,
    )
    const again = await ho.post(url(), domestic({ docNo: a.docNo }))
    expect(again.status, JSON.stringify(again.body)).toBe(201)
    expect(again.body.data.ref).not.toBe(a.ref)
    const found = await ho.get(url(`/lookup?number=${encodeURIComponent(a.docNo)}`))
    expect(found.body.data.id).toBe(again.body.data.id)
  })

  it('needs a reason and refuses a second cancel', async () => {
    const a = (await ho.post(url(), domestic())).body.data
    expect((await ho.post(url(`/${a.id}/cancel`), { version: 1, reason: '' })).status).toBe(422)
    expect((await ho.post(url(`/${a.id}/cancel`), { version: 1, reason: 'Duplicate' })).status).toBe(200)
    const twice = await ho.post(url(`/${a.id}/cancel`), { version: 2, reason: 'Again' })
    expect([twice.status, twice.body.error.code]).toEqual([409, 'agreements.bad_transition'])
  })

  it('refuses cancel without the right', async () => {
    const a = await submitted()
    expect((await member.post(url(`/${a.id}/cancel`), { version: a.version, reason: 'No' })).status).toBe(403)
    expect((await branch.post(url(`/${a.id}/cancel`), { version: a.version, reason: 'No' })).status).toBe(404)
  })

  it('accepts PDF, JPG and PNG only, while a draft', async () => {
    const a = (await ho.post(url(), domestic({ members: TEAM }))).body.data
    expect((await attachPdf(platform, ho, a.id, 'notes.txt', 'text/plain')).status).toBeGreaterThanOrEqual(400)
    expect((await attachPdf(platform, ho, a.id)).status).toBe(201)
    expect((await attachPdf(platform, member, a.id)).status).toBe(403)
    expect((await ho.post(url(`/${a.id}/submit`), {})).status).toBe(200)
    expect((await attachPdf(platform, ho, a.id)).status).toBe(403)
    const files = await member.get(`${API}/files?entityType=agreement&entityId=${a.id}`)
    expect(files.body.meta).toMatchObject({ total: 1, canAttach: false })
  })

  it('keeps the signed copy once submitted; a draft may remove it', async () => {
    const draft = (await ho.post(url(), domestic({ members: TEAM }))).body.data
    const first = await attachPdf(platform, ho, draft.id)
    const firstId = ((await first.json()) as any).data.id
    expect((await ho.delete(`${API}/files/${firstId}`)).status).toBe(204)
    const kept = await attachPdf(platform, ho, draft.id)
    const keptId = ((await kept.json()) as any).data.id
    expect((await ho.post(url(`/${draft.id}/submit`), {})).status).toBe(200)
    const refused = await ho.delete(`${API}/files/${keptId}`)
    expect([refused.status, refused.body.error.code]).toEqual([409, 'agreements.signed_copy_locked'])
    const files = await ho.get(`${API}/files?entityType=agreement&entityId=${draft.id}`)
    expect(files.body.meta.total).toBe(1)
  })
})
