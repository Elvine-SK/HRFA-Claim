import { runWithContext, SYSTEM_CONTEXT } from '@elvine-sk/platform-db'
import { dbTestsEnabled } from '@elvine-sk/platform-db/testing'
import type { PlatformApp } from '@elvine-sk/platform-server'
import type { TestClient } from '@elvine-sk/platform-server/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { transition } from '../src/modules/agreements/procedures.ts'
import { appDb } from '../src/shared/db.ts'
import { adminClient, API, bootApp, hrmClient } from './helpers.ts'

const url = (p = '') => `${API}/agreements${p}`

/** Role ids by key, as the migration seeded them. */
export async function roleIds(...keys: string[]) {
  const rows = await runWithContext(SYSTEM_CONTEXT, () =>
    appDb().selectFrom('roles').select(['id', 'key']).where('key', 'in', keys).execute(),
  )
  return keys.map((k) => rows.find((r) => r.key === k)!.id)
}

let seq = 100
/** A form 1 body with a fresh Doc.no; `over` replaces header fields. */
export function domestic(over: Record<string, unknown> = {}) {
  seq += 1
  return {
    formType: 'domestic',
    subject: 'Branch audit',
    title: 'Audit of the Luang Prabang branch',
    reference: null,
    docNo: `${seq}.BCEL.888010.2026`,
    docDate: '2026-10-29',
    travelFrom: '2026-11-02',
    travelTo: '2026-11-05',
    fromProvinceCode: '01',
    toProvinceCode: '06',
    policyOption: 'bcel_all',
    hasAdvance: false,
    members: [{ eid: '10010', isLeader: true }],
    ...over,
  }
}

describe.skipIf(!dbTestsEnabled)('agreements (drafts)', () => {
  let platform: PlatformApp
  let admin: TestClient
  let ho: TestClient // 10010, HR officer at head office
  let branch: TestClient // 10020, HR officer at branch 888020
  let member: TestClient // 10011, employee only
  let hoMgmt: TestClient // 10013, management at head office

  beforeAll(async () => {
    platform = await bootApp()
    admin = await adminClient(platform)
    const [officer, management] = await roleIds('hr_officer', 'management')
    ho = (await hrmClient(platform, admin, '10010', [officer!])).client
    branch = (await hrmClient(platform, admin, '10020', [officer!])).client
    member = (await hrmClient(platform, admin, '10011')).client
    hoMgmt = (await hrmClient(platform, admin, '10013', [management!])).client
  })
  afterAll(async () => {
    await platform?.ctx.db.destroy()
  })

  it('creates a domestic draft with a REF and member days', async () => {
    const res = await ho.post(
      url(),
      domestic({
        docNo: '7/ທຄຕລ/010/2026',
        members: [
          { eid: '10010', isLeader: true },
          { eid: '10011', daysSubtracted: 1 },
        ],
      }),
    )
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    const a = res.body.data
    expect(a.ref).toMatch(/^TA-2026-\d{6}$/)
    expect(a).toMatchObject({ status: 'draft', docNo: '0007.BCEL.888010.2026', branchCode: '888010', version: 1 })
    expect(a.members.map((m: any) => [m.eid, m.calculatedDays, m.paidDays])).toEqual([
      ['10010', 4, 4],
      ['10011', 4, 3],
    ])
    expect(a.members[1]).toMatchObject({ nameLao: 'ພອນ', departureDate: '2026-11-02', returnDate: '2026-11-05' })
    const lo = await ho.request('GET', url(`/${a.id}`), undefined, { 'accept-language': 'lo' })
    expect(lo.body.data.docNo).toBe('0007.ທຄຕລ.888010.2026')
  })

  it("checks each form's own fields", async () => {
    const district = {
      formType: 'district',
      provinceCode: '06',
      fromDistrictCode: '0601',
      toDistrictCode: '0602',
      fromProvinceCode: undefined,
      toProvinceCode: undefined,
    }
    const cases: [Record<string, unknown>, string][] = [
      [{ ...district, overnight: false, sameDayOver50km: true }, 'travelTo'],
      [{ ...district, overnight: false, sameDayOver50km: null, travelTo: '2026-11-02' }, 'sameDayOver50km'],
      [{ ...district, overnight: true, sameDayOver50km: null, toDistrictCode: '0101' }, 'toDistrictCode'],
      [{ formType: 'overseas', countryIso2: 'XX', fromProvinceCode: undefined, toProvinceCode: undefined }, 'countryIso2'],
      [{ formType: 'overseas', countryIso2: 'LA', fromProvinceCode: undefined, toProvinceCode: undefined }, 'countryIso2'],
      [{ formType: 'border', borderRouteId: null, borderRouteOther: null, toProvinceCode: undefined }, 'borderRouteOther'],
      [{ toProvinceCode: '01' }, 'toProvinceCode'],
      [{ toProvinceCode: '99' }, 'toProvinceCode'],
    ]
    for (const [over, path] of cases) {
      const res = await ho.post(url(), domestic(over))
      expect(res.status, `${path}: ${JSON.stringify(res.body)}`).toBe(422)
      expect(res.body.error.details.map((d: any) => d.path)).toContain(path)
    }
    const ok = await ho.post(url(), domestic({ ...district, overnight: false, sameDayOver50km: true, travelTo: '2026-11-02' }))
    expect(ok.status, JSON.stringify(ok.body.error?.details ?? ok.body)).toBe(201)
    const routes = await ho.get(`${API}/travel-master/border-routes?active=true`)
    const border = await ho.post(
      url(),
      domestic({ formType: 'border', borderRouteId: routes.body.data[0].id, borderRouteOther: null, toProvinceCode: undefined }),
    )
    expect(border.status, JSON.stringify(border.body)).toBe(201)
    const both = await ho.post(
      url(),
      domestic({ formType: 'border', borderRouteId: routes.body.data[0].id, borderRouteOther: 'Vang Tao', toProvinceCode: undefined }),
    )
    expect(both.status).toBe(422)
  })

  it('refuses a Doc.no in use in any spelling, accepts it after cancel', async () => {
    const first = await ho.post(url(), domestic({ docNo: '0001.BCEL.888010.2026' }))
    expect(first.status).toBe(201)
    for (const spelling of ['0001/ທຄຕລ/888010/2026', '1.BCEL.010.2026', '0001.BCEL.888010.2026']) {
      const res = await ho.post(url(), domestic({ docNo: spelling }))
      expect([res.status, res.body.error.code], spelling).toEqual([409, 'agreements.doc_no_taken'])
    }
    const other = await ho.post(url(), domestic())
    const edit = await ho.put(url(`/${other.body.data.id}`), { ...domestic({ docNo: '1.BCEL.010.2026' }), version: 1 })
    expect(edit.body.error.code).toBe('agreements.doc_no_taken')
    await runWithContext(SYSTEM_CONTEXT, () => transition(first.body.data.id, 1, 'cancelled', 'wrong dates'))
    const again = await ho.post(url(), domestic({ docNo: '0001.BCEL.888010.2026' }))
    expect(again.status).toBe(201)
    expect(again.body.data.ref).not.toBe(first.body.data.ref)
    const bad = await ho.post(url(), domestic({ docNo: '0001.BCEL.888010.2025' }))
    expect(bad.body.error.details.map((d: any) => d.path)).toContain('docNo')
    const garbage = await ho.post(url(), domestic({ docNo: 'abc' }))
    expect(garbage.body.error.details[0]).toMatchObject({ path: 'docNo', code: 'agreements.doc_no_invalid' })
  })

  it('refuses member dates that do not fit', async () => {
    const res = await ho.post(
      url(),
      domestic({
        members: [
          { eid: '10010', isLeader: true, departureDate: '2026-11-04', returnDate: '2026-11-03', hostMeals: 13 },
          { eid: '10011', departureDate: '2026-11-01' },
          { eid: '10012', daysSubtracted: 5 },
        ],
      }),
    )
    expect(res.status).toBe(422)
    const paths = res.body.error.details.map((d: any) => d.path)
    expect(paths).toEqual(expect.arrayContaining(['members.0.returnDate', 'members.1.departureDate', 'members.2.daysSubtracted']))
    const meals = await ho.post(url(), domestic({ members: [{ eid: '10010', isLeader: true, hostMeals: 13 }] }))
    expect(meals.body.error.details.map((d: any) => d.path)).toEqual(['members.0.hostMeals'])
    const unknown = await ho.post(url(), domestic({ members: [{ eid: '10003' }] }))
    expect(unknown.body.error.details[0]).toMatchObject({ path: 'members.0.eid', code: 'agreements.member_not_found' })
    const twice = await ho.post(url(), domestic({ members: [{ eid: '10010' }, { eid: '10010' }] }))
    expect(twice.body.error.details.map((d: any) => d.path)).toContain('members.1.eid')
    const holder = await ho.post(url(), domestic({ members: [{ eid: '10010', isAdvanceHolder: true }] }))
    expect(holder.body.error.details.map((d: any) => d.path)).toContain('members.0.isAdvanceHolder')
  })

  it('edits a draft and replaces members; refuses a stale version and a non-draft', async () => {
    const created = (await ho.post(url(), domestic())).body.data
    const body = { ...domestic({ docNo: created.docNo, members: [{ eid: '10012', isLeader: true }] }), version: 1 }
    const res = await ho.put(url(`/${created.id}`), body)
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(res.body.data.members.map((m: any) => m.eid)).toEqual(['10012'])
    expect(res.body.data.version).toBe(2)
    expect((await ho.put(url(`/${created.id}`), body)).status).toBe(409)
    await runWithContext(SYSTEM_CONTEXT, () => transition(created.id, 2, 'in_approval'))
    const locked = await ho.put(url(`/${created.id}`), { ...body, version: 3 })
    expect([locked.status, locked.body.error.code]).toEqual([409, 'agreements.not_draft'])
    const history = await ho.get(url(`/${created.id}/history`))
    expect(history.status).toBe(200)
    expect(history.body.data.length).toBeGreaterThanOrEqual(3)
  })

  it('scopes by HRM branch and membership', async () => {
    const hoDraft = (await ho.post(url(), domestic({ members: [{ eid: '10011' }] }))).body.data
    const brDraft = (
      await branch.post(url(), domestic({ docNo: `${++seq}.BCEL.888020.2026`, members: [{ eid: '10020' }] }))
    ).body.data
    expect(brDraft.branchCode).toBe('888020')
    // The branch sees its own only.
    expect((await branch.get(url(`/${hoDraft.id}`))).status).toBe(404)
    expect((await branch.get(url(`/lookup?number=${hoDraft.ref}`))).status).toBe(404)
    expect((await branch.get(url(`/lookup?number=${encodeURIComponent(hoDraft.docNo)}`))).status).toBe(404)
    const brList = (await branch.get(url('?limit=100'))).body.data.map((a: any) => a.id)
    expect(brList).toContain(brDraft.id)
    expect(brList).not.toContain(hoDraft.id)
    // Head office sees both.
    const hoList = (await hoMgmt.get(url('?limit=100'))).body.data.map((a: any) => a.id)
    expect(hoList).toEqual(expect.arrayContaining([hoDraft.id, brDraft.id]))
    expect((await hoMgmt.get(url(`/${brDraft.id}`))).status).toBe(200)
    // An employee sees the agreements they are a member of.
    expect((await member.get(url(`/${hoDraft.id}`))).status).toBe(200)
    expect((await member.get(url(`/${brDraft.id}`))).status).toBe(404)
    const mine = (await member.get(url('?limit=100'))).body.data.map((a: any) => a.id)
    expect(mine).toContain(hoDraft.id)
    expect(mine).not.toContain(brDraft.id)
  })

  it('refuses create without permission or for another branch', async () => {
    expect((await member.post(url(), domestic())).status).toBe(403)
    const res = await branch.post(url(), domestic())
    expect(res.status).toBe(403)
    const forBranch = await ho.post(url(), domestic({ docNo: `${++seq}.BCEL.888020.2026` }))
    expect(forBranch.status).toBe(201)
    expect(forBranch.body.data.branchCode).toBe('888020')
    expect((await member.put(url(`/${forBranch.body.data.id}`), { ...domestic(), version: 1 })).status).toBe(404)
  })

  it('finds by REF and by Doc.no', async () => {
    const a = (await ho.post(url(), domestic({ docNo: '0950.BCEL.888010.2026' }))).body.data
    const byRef = await ho.get(url(`/lookup?number=${a.ref.toLowerCase()}`))
    expect(byRef.body.data.id).toBe(a.id)
    const byDocNo = await ho.get(url(`/lookup?number=${encodeURIComponent('950/ທຄຕລ/010/2026')}`))
    expect(byDocNo.body.data.id).toBe(a.id)
    expect((await ho.get(url('/lookup?number=TA-2026-999999'))).status).toBe(404)
    expect((await ho.get(url('/lookup?number=hello'))).status).toBe(404)
  })
})
