import { runWithContext, SYSTEM_CONTEXT, uuidBin } from '@elvine-sk/platform-db'
import { dbTestsEnabled } from '@elvine-sk/platform-db/testing'
import type { PlatformApp } from '@elvine-sk/platform-server'
import type { TestClient } from '@elvine-sk/platform-server/testing'
import ExcelJS from 'exceljs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { onAgreementCancelled } from '../src/modules/agreements/events.ts'
import { transition } from '../src/modules/settlements/procedures.ts'
import { appDb } from '../src/shared/db.ts'
import { domesticBodies, roleIds } from './agreement-fixtures.ts'
import { adminClient, API, bootApp, hrmClient } from './helpers.ts'
import { attachFile, exportedPayment } from './payment-fixtures.ts'

const url = (p = '') => `${API}/settlements${p}`
const domestic = domesticBodies(2035, '10102')
const team = {
  hasAdvance: true,
  members: [
    { eid: '10102', isLeader: true },
    { eid: '10103', isAdvanceHolder: true },
    { eid: '10104', isDeputy: true },
  ],
}
const overseas = () =>
  domestic({ formType: 'overseas', countryIso2: 'FR', fromProvinceCode: undefined, toProvinceCode: undefined, ...team })

type Row = { account: string; branch: string; ccy: string; amt: number; rvs: string; side: string; remark: string }

describe.skipIf(!dbTestsEnabled)('settlements (upload file, posted, clearing)', () => {
  let platform: PlatformApp
  let admin: TestClient
  let finance: TestClient // 10100, finance officer at head office
  let hr: TestClient // 10101, HR officer at head office
  let holder: TestClient // 10103
  let brFinance: TestClient // 10110, finance officer at branch 888020

  beforeAll(async () => {
    platform = await bootApp()
    admin = await adminClient(platform)
    const [fin, officer] = await roleIds('finance_officer', 'hr_officer')
    finance = (await hrmClient(platform, admin, '10100', [fin!])).client
    hr = (await hrmClient(platform, admin, '10101', [officer!])).client
    holder = (await hrmClient(platform, admin, '10103')).client
    brFinance = (await hrmClient(platform, admin, '10110', [fin!])).client
  })
  afterAll(async () => {
    await platform?.ctx.db.destroy()
  })

  /** An approved settlement (approved as the system, without the workflow) with the given lines. */
  async function approved(body: Record<string, unknown>, lines: Record<string, unknown>[], caseKind: string) {
    const { agreement } = await exportedPayment(platform, finance, hr, body)
    const created = await holder.post(url(), { agreementId: agreement.id })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    const id = created.body.data.id as string
    const receipt = (await attachFile(platform, holder, 'settlement', id)).body.data.id
    const saved = await holder.put(url(`/${id}`), {
      version: 1,
      caseKind,
      lines: lines.map((l) => ({ description: 'Expense', receiptFileId: receipt, ...l })),
    })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    await runWithContext(SYSTEM_CONTEXT, async () => {
      await transition(id, 2, 'in_approval')
      await transition(id, 3, 'approved')
    })
    const s = (await finance.get(url(`/${id}`))).body.data
    expect(s.status).toBe('approved')
    return s
  }

  const download = async (client: TestClient, id: string, kind: string) =>
    platform.app.request(url(`/${id}/batches/${kind}/file`), { headers: client.rawHeaders() })

  async function rowsOf(res: Response): Promise<Row[]> {
    expect(res.status).toBe(200)
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(await res.arrayBuffer())
    const rows: Row[] = []
    book.getWorksheet('Upload file')!.eachRow((row, n) => {
      if (n === 1) return
      const cell = (i: number) => row.getCell(i).value
      rows.push({
        account: cell(1) as string,
        branch: cell(2) as string,
        ccy: cell(4) as string,
        amt: cell(6) as number,
        rvs: (cell(7) as string) ?? '',
        side: cell(8) as string,
        remark: cell(9) as string,
      })
    })
    const sum = (side: string) => rows.filter((r) => r.side === side).reduce((s, r) => s + r.amt, 0)
    expect(sum('DR')).toBeCloseTo(sum('CR'), 2)
    return rows
  }

  it('exports a domestic settlement and marks it posted, with no clearing', async () => {
    const s = await approved(
      domestic(team),
      [
        { expenseType: 'fuel', currency: 'LAK', amount: '500000' },
        { expenseType: 'fare', currency: 'LAK', amount: '1000000' },
      ],
      'partly_used',
    )
    const res = await finance.post(url(`/${s.id}/export`), { version: s.version })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(res.body.data.status).toBe('exported')
    expect(res.body.data.batches).toEqual([
      expect.objectContaining({ kind: 'settlement', branchCode: '888010', fileName: `${s.ref}-settlement.xlsx` }),
    ])
    const rows = await rowsOf(await download(finance, s.id, 'settlement'))
    expect(rows.map((r) => [r.account, r.side, r.amt, r.rvs])).toEqual([
      ['888010LAK44051000010001', 'DR', 500000, ''],
      ['888010LAK44052000010001', 'DR', 1000000, ''],
      ['0103-LAK', 'DR', s.advance - 1500000, ''],
      ['888010LAK13622200010001', 'CR', Number(s.advance), ''],
    ])
    expect(rows[0]!.remark).toContain(s.ref)

    const exported = res.body.data
    const rvs = await finance.post(url(`/${s.id}/posted`), { version: exported.version, rvsNo: 'SUS-X' })
    expect([rvs.status, rvs.body.error.code]).toEqual([422, 'settlements.rvs_no_not_allowed'])
    const posted = await finance.post(url(`/${s.id}/posted`), { version: exported.version, coreRef: 'CORE-5' })
    expect(posted.status, JSON.stringify(posted.body)).toBe(200)
    expect(posted.body.data).toMatchObject({ status: 'posted', coreRef: 'CORE-5', rvsNo: null })
    const clearing = await finance.post(url(`/${s.id}/clearing`), { version: posted.body.data.version })
    expect([clearing.status, clearing.body.error.code]).toEqual([409, 'settlements.no_clearing'])
  })

  it('passes an overseas settlement through the holding account, then clears it with RVS_NO', async () => {
    const s = await approved(overseas(), [{ currency: 'USD', amount: '600.00' }], 'partly_used')
    expect(s.totals).toMatchObject({ holding: '600.00', needsClearing: true })
    const exported = await finance.post(url(`/${s.id}/export`), { version: s.version })
    expect(exported.status, JSON.stringify(exported.body)).toBe(200)
    const file1 = await rowsOf(await download(finance, s.id, 'settlement'))
    expect(file1.map((r) => [r.account, r.side, r.amt])).toEqual([
      ['888010USD44052000010001', 'DR', 600],
      ['0103-USD', 'DR', Number(s.advance) - 600],
      ['888010USD13622200010001', 'CR', Number(s.advance) - 600],
      ['888010USD23618000010001', 'CR', 600],
    ])

    // Clearing waits for the first file to be posted, with CORE's suspense number.
    const early = await finance.post(url(`/${s.id}/clearing`), { version: exported.body.data.version })
    expect([early.status, early.body.error.code]).toEqual([409, 'settlements.bad_transition'])
    const noRvs = await finance.post(url(`/${s.id}/posted`), { version: exported.body.data.version })
    expect([noRvs.status, noRvs.body.error.code]).toEqual([422, 'settlements.rvs_no_required'])
    const posted = await finance.post(url(`/${s.id}/posted`), { version: exported.body.data.version, rvsNo: 'SUS-2035-1' })
    expect(posted.status, JSON.stringify(posted.body)).toBe(200)
    expect(posted.body.data.rvsNo).toBe('SUS-2035-1')

    const cleared = await finance.post(url(`/${s.id}/clearing`), { version: posted.body.data.version })
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200)
    expect(cleared.body.data.status).toBe('clearing_exported')
    expect(cleared.body.data.batches.map((b: any) => [b.kind, b.fileName])).toEqual([
      ['settlement', `${s.ref}-settlement.xlsx`],
      ['clearing', `${s.ref}-clearing.xlsx`],
    ])
    const file2 = await rowsOf(await download(finance, s.id, 'clearing'))
    expect(file2.map((r) => [r.account, r.side, r.amt, r.rvs])).toEqual([
      ['888010USD23618000010001', 'DR', 600, 'SUS-2035-1'],
      ['888010USD13622200010001', 'CR', 600, ''],
    ])
    const again = await finance.post(url(`/${s.id}/clearing`), { version: cleared.body.data.version })
    expect(again.status).toBe(409)

    const done = await finance.post(url(`/${s.id}/clearing/posted`), { version: cleared.body.data.version, coreRef: 'CORE-6' })
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(done.body.data).toMatchObject({ status: 'cleared', clearingCoreRef: 'CORE-6', coreRef: null })
  })

  it('keeps settlement files off the payment download route', async () => {
    const s = await approved(domestic(team), [], 'unused')
    const res = await finance.post(url(`/${s.id}/export`), { version: s.version })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const batchId = res.body.data.batches[0].id
    const viaPayments = await platform.app.request(`${API}/posting-batches/${batchId}/file`, {
      headers: finance.rawHeaders(),
    })
    expect(viaPayments.status).toBe(404)
    // Nothing to clear: no file of that kind yet.
    expect((await download(finance, s.id, 'clearing')).status).toBe(404)
  })

  it('refuses other branches and people without the right', async () => {
    const s = await approved(domestic(team), [], 'unused')
    expect((await brFinance.post(url(`/${s.id}/export`), { version: s.version })).status).toBe(404)
    expect((await hr.post(url(`/${s.id}/export`), { version: s.version })).status).toBe(404)
    // The holder may read it but not export it.
    expect((await holder.post(url(`/${s.id}/export`), { version: s.version })).status).toBe(403)
    const ok = await finance.post(url(`/${s.id}/export`), { version: s.version })
    expect(ok.status).toBe(200)
    expect((await download(brFinance, s.id, 'settlement')).status).toBe(404)
    expect((await download(holder, s.id, 'settlement')).status).toBe(200)
  })

  const cancelAgreement = async (agreementId: string) => {
    const ag = (await finance.get(`${API}/agreements/${agreementId}`)).body.data
    return finance.post(`${API}/agreements/${agreementId}/cancel`, { version: ag.version, reason: 'Trip dropped' })
  }
  const stamps = (agreementId: string) =>
    runWithContext(SYSTEM_CONTEXT, () =>
      appDb()
        .selectFrom('postingBatches')
        .select(['kind', 'cancelledAfterExportAt'])
        .where('agreementId', '=', uuidBin(agreementId))
        .orderBy('kind')
        .execute(),
    )

  it('cancel in approval voids the settlement, and the payment is marked in the same cancel', async () => {
    const { agreement } = await exportedPayment(platform, finance, hr, domestic(team))
    const s = (await holder.post(url(), { agreementId: agreement.id })).body.data
    await runWithContext(SYSTEM_CONTEXT, () => transition(s.id, 1, 'in_approval'))
    const res = await cancelAgreement(agreement.id)
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect((await finance.get(url(`/${s.id}`))).body.data.status).toBe('void')
    const payments = await finance.get(`${API}/payments?filter[agreementId][eq]=${agreement.id}`)
    expect(payments.body.data.map((p: any) => p.status)).toEqual(['cancelled_after_export'])
  })

  it('cancel after clearing marks the settlement and both of its batches', async () => {
    const s = await approved(overseas(), [{ currency: 'USD', amount: '600.00' }], 'partly_used')
    const e = await finance.post(url(`/${s.id}/export`), { version: s.version })
    const p = await finance.post(url(`/${s.id}/posted`), { version: e.body.data.version, rvsNo: 'SUS-2035-9' })
    const c = await finance.post(url(`/${s.id}/clearing`), { version: p.body.data.version })
    expect(c.status, JSON.stringify(c.body)).toBe(200)

    const res = await cancelAgreement(s.agreementId)
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect((await finance.get(url(`/${s.id}`))).body.data.status).toBe('cancelled_after_export')
    const marked = await stamps(s.agreementId)
    expect(marked.map((b) => [b.kind, b.cancelledAfterExportAt !== null])).toEqual([
      ['clearing', true],
      ['payment', true],
      ['settlement', true],
    ])
    const told = (await finance.get(`${API}/notifications`)).body.data.filter(
      (n: any) => n.type === 'settlements.cancelled_after_export',
    )
    expect(told.map((n: any) => n.link)).toContain(`/settlements/${s.id}`)
    expect((await download(finance, s.id, 'clearing')).status).toBe(200)
    const listed = await finance.get(url(`?filter[status][eq]=cancelled_after_export&filter[agreementId][eq]=${s.agreementId}`))
    expect(listed.body.data.map((r: any) => r.id)).toEqual([s.id])
  })

  it('rolls the whole cancel back when a listener fails', async () => {
    const { agreement } = await exportedPayment(platform, finance, hr, domestic(team))
    const s = (await holder.post(url(), { agreementId: agreement.id })).body.data
    // A listener after the payments and settlements ones, failing for this agreement only.
    onAgreementCancelled(async (id) => {
      if (id === agreement.id) throw new Error('listener failed')
    })
    const res = await cancelAgreement(agreement.id)
    expect(res.status).toBe(500)
    expect((await finance.get(`${API}/agreements/${agreement.id}`)).body.data.status).toBe('approved')
    expect((await finance.get(url(`/${s.id}`))).body.data.status).toBe('draft')
    const payments = await finance.get(`${API}/payments?filter[agreementId][eq]=${agreement.id}`)
    expect(payments.body.data.map((p: any) => p.status)).toEqual(['exported'])
  })
})
