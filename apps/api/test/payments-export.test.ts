import { uuidv7 } from '@elvine-sk/platform-core'
import { runWithContext, SYSTEM_CONTEXT, uuidBin } from '@elvine-sk/platform-db'
import { dbTestsEnabled } from '@elvine-sk/platform-db/testing'
import type { PlatformApp } from '@elvine-sk/platform-server'
import type { TestClient } from '@elvine-sk/platform-server/testing'
import ExcelJS from 'exceljs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createBatch } from '../src/modules/payments/batches.ts'
import type { UploadLine } from '../src/modules/payments/posting.ts'
import { transition } from '../src/modules/payments/procedures.ts'
import { addAmounts } from '../src/modules/travel-master/money.ts'
import { appDb } from '../src/shared/db.ts'
import { approvedAgreement, domesticBodies, roleIds } from './agreement-fixtures.ts'
import { adminClient, API, bootApp, hrmClient } from './helpers.ts'

const url = (p = '') => `${API}/payments${p}`
const domestic = domesticBodies(2032, '10082')
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

describe.skipIf(!dbTestsEnabled)('payments (batch, upload file, posted)', () => {
  let platform: PlatformApp
  let admin: TestClient
  let finance: TestClient // 10080, finance officer at head office
  let hr: TestClient // 10081, HR officer at head office
  let brFinance: TestClient // 10083, finance officer at branch 888020

  beforeAll(async () => {
    platform = await bootApp()
    admin = await adminClient(platform)
    const [fin, officer] = await roleIds('finance_officer', 'hr_officer')
    finance = (await hrmClient(platform, admin, '10080', [fin!])).client
    hr = (await hrmClient(platform, admin, '10081', [officer!])).client
    brFinance = (await hrmClient(platform, admin, '10083', [fin!])).client
  })
  afterAll(async () => {
    await platform?.ctx.db.destroy()
  })

  /** An approved payment of a fresh head office agreement (approved as the system, without the workflow). */
  async function approved() {
    const a = await approvedAgreement(platform, hr, domestic({ members: [{ eid: '10082', isLeader: true }] }))
    const res = await finance.post(url(), { agreementId: a.id })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    const id = res.body.data.id as string
    await runWithContext(SYSTEM_CONTEXT, async () => {
      await transition(id, 1, 'in_approval')
      await transition(id, 2, 'approved')
    })
    const p = (await finance.get(url(`/${id}`))).body.data
    expect(p.status).toBe('approved')
    return p
  }

  /** The upload file as `client` downloads it. */
  const download = (client: TestClient, batchId: string) =>
    platform.app.request(`${API}/posting-batches/${batchId}/file`, { headers: client.rawHeaders() })

  const batchCount = (agreementId: string) =>
    runWithContext(SYSTEM_CONTEXT, () =>
      appDb()
        .selectFrom('postingBatches')
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .where('agreementId', '=', uuidBin(agreementId))
        .executeTakeFirstOrThrow(),
    ).then((r) => Number(r.n))

  const line = (side: 'DR' | 'CR', amount: string): UploadLine => ({
    account: side === 'DR' ? '888010LAK44087200010001' : '0082-LAK',
    branch: '888010',
    name: 'X',
    ccy: 'LAK',
    chequeNo: '',
    amount,
    rvsNo: '',
    side,
    remark: 'R',
  })

  const directBatch = (agreementId: string, sourceId: string, lines: UploadLine[]) =>
    runWithContext(SYSTEM_CONTEXT, () =>
      createBatch({ id: uuidv7(), agreementId, kind: 'payment', sourceId, branch: '888010', fileName: 'x.xlsx', lines }),
    )

  it('exports a balanced file', async () => {
    const p = await approved()
    const res = await finance.post(url(`/${p.id}/export`), { version: p.version })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(res.body.data.status).toBe('exported')
    const batch = res.body.data.batch
    expect(batch).toMatchObject({ kind: 'payment', branchCode: '888010', fileName: `${p.ref}-payment.xlsx` })

    const file = await download(finance, batch.id)
    expect(file.status).toBe(200)
    expect(file.headers.get('content-type')).toBe(XLSX)
    expect(file.headers.get('content-disposition')).toBe(`attachment; filename="${p.ref}-payment.xlsx"`)

    const book = new ExcelJS.Workbook()
    await book.xlsx.load(await file.arrayBuffer())
    const sheet = book.getWorksheet('Upload file')!
    expect(sheet.getRow(1).values).toEqual([
      undefined,
      'ACCOUNT',
      'BRANCH',
      'NAME',
      'CCY',
      'CHEQUE_NO',
      'AMT',
      'RVS_NO',
      'DR_CR',
      'REMARK',
    ])
    const rows = [] as { account: string; branch: string; name: string; amt: number; side: string; remark: string }[]
    sheet.eachRow((row, n) => {
      if (n === 1) return
      const cell = (i: number) => row.getCell(i)
      expect(cell(6).numFmt).toBe('#,##0.00')
      expect(typeof cell(6).value).toBe('number')
      rows.push({
        account: cell(1).value as string,
        branch: cell(2).value as string,
        name: cell(3).value as string,
        amt: cell(6).value as number,
        side: cell(8).value as string,
        remark: cell(9).value as string,
      })
    })
    const dr = rows.filter((r) => r.side === 'DR')
    const cr = rows.filter((r) => r.side === 'CR')
    expect(dr.map((r) => r.account)).toEqual(['888010LAK44087200010001', '888010LAK44087300010001'])
    expect(cr).toEqual([expect.objectContaining({ account: '0082-LAK', branch: '888010', name: 'VANH XAY' })])
    const sum = (rs: typeof rows) => rs.reduce((s, r) => addAmounts(s, r.amt.toFixed(2)), '0.00')
    expect(sum(dr)).toBe(sum(cr))
    expect(sum(cr)).toBe(p.totals.LAK)
    const { docNo } = await runWithContext(SYSTEM_CONTEXT, () =>
      appDb().selectFrom('agreements').select('docNo').where('id', '=', uuidBin(p.agreementId)).executeTakeFirstOrThrow(),
    )
    for (const r of rows) expect(r.remark).toBe(`D ວັນ ໄຊ 4 ແຂວງ ຫຼວງພະບາງ ${docNo} 02/11/2026-05/11/2026 ${p.ref}`)
  })

  it('exports once', async () => {
    const p = await approved()
    const first = await finance.post(url(`/${p.id}/export`), { version: p.version })
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    const again = await finance.post(url(`/${p.id}/export`), { version: first.body.data.version })
    expect([again.status, again.body.error.code]).toEqual([409, 'payments.bad_transition'])
    expect(await batchCount(p.agreementId)).toBe(1)

    await expect(directBatch(p.agreementId, p.id, [line('DR', '10.00'), line('CR', '10.00')])).rejects.toMatchObject({
      code: 'posting.batch_exists',
      status: 409,
    })
  })

  it('refuses an unbalanced batch', async () => {
    const p = await approved()
    await expect(directBatch(p.agreementId, p.id, [line('DR', '10.00')])).rejects.toMatchObject({
      code: 'posting.unbalanced',
      status: 422,
    })
    expect(await batchCount(p.agreementId)).toBe(0)
    // Not exported yet: the payment is still approved.
    expect((await finance.get(url(`/${p.id}`))).body.data).toMatchObject({ status: 'approved', batch: null })
  })

  it('marks posted', async () => {
    const p = await approved()
    // Not exported yet.
    const early = await finance.post(url(`/${p.id}/posted`), { version: p.version })
    expect([early.status, early.body.error.code]).toEqual([409, 'payments.bad_transition'])

    const exported = (await finance.post(url(`/${p.id}/export`), { version: p.version })).body.data
    const res = await finance.post(url(`/${p.id}/posted`), { version: exported.version, coreRef: 'CORE-123' })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(res.body.data).toMatchObject({ status: 'posted', coreRef: 'CORE-123' })
    expect(res.body.data.postedAt).toBeTruthy()

    const again = await finance.post(url(`/${p.id}/posted`), { version: res.body.data.version })
    expect([again.status, again.body.error.code]).toEqual([409, 'payments.bad_transition'])
    // HR has no payment.export.
    expect((await hr.post(url(`/${p.id}/posted`), { version: res.body.data.version })).status).toBe(404)
  })

  it('branch scope', async () => {
    const p = await approved()
    // Another branch's finance officer neither exports nor downloads it.
    expect((await brFinance.post(url(`/${p.id}/export`), { version: p.version })).status).toBe(404)
    // A super administrator without an HRM record has no branch for the GL accounts.
    const noBranch = await admin.post(url(`/${p.id}/export`), { version: p.version })
    expect([noBranch.status, noBranch.body.error.code]).toEqual([422, 'payments.no_branch'])
    const batch = (await finance.post(url(`/${p.id}/export`), { version: p.version })).body.data.batch
    expect((await download(brFinance, batch.id)).status).toBe(404)
    expect((await download(hr, batch.id)).status).toBe(404)
    expect((await brFinance.post(url(`/${p.id}/posted`), { version: p.version + 1 })).status).toBe(404)
  })

  const cancelAgreement = (agreementId: string, version: number) =>
    finance.post(`${API}/agreements/${agreementId}/cancel`, { version, reason: 'Trip dropped' })

  it('cancel before export voids the payment', async () => {
    const p = await approved()
    const ag = (await hr.get(`${API}/agreements/${p.agreementId}`)).body.data
    const res = await cancelAgreement(p.agreementId, ag.version)
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect((await finance.get(url(`/${p.id}`))).body.data.status).toBe('void')
    // The Doc.no is free again, and the replacement can be paid.
    const again = await approvedAgreement(
      platform,
      hr,
      domestic({ docNo: ag.docNo, members: [{ eid: '10082', isLeader: true }] }),
    )
    const paid = await finance.post(url(), { agreementId: again.id })
    expect(paid.status, JSON.stringify(paid.body)).toBe(201)
  })

  it('cancel after export marks it', async () => {
    const p = await approved()
    const exported = (await finance.post(url(`/${p.id}/export`), { version: p.version })).body.data
    const ag = (await hr.get(`${API}/agreements/${p.agreementId}`)).body.data
    const res = await cancelAgreement(p.agreementId, ag.version)
    expect(res.status, JSON.stringify(res.body)).toBe(200)

    const read = (await finance.get(url(`/${p.id}`))).body.data
    expect(read.status).toBe('cancelled_after_export')
    const listed = await finance.get(url('?status=cancelled_after_export'))
    expect(listed.body.data.map((x: any) => x.id)).toContain(p.id)
    const told = await finance
      .get(`${API}/notifications`)
      .then((r) => r.body.data.filter((n: any) => n.type === 'payments.cancelled_after_export'))
    expect(told.map((n: any) => n.link)).toContain(`/payments/${p.id}`)
    expect((await brFinance.get(`${API}/notifications`)).body.data.filter((n: any) => n.link === `/payments/${p.id}`)).toHaveLength(0)
    const stamp = await runWithContext(SYSTEM_CONTEXT, () =>
      appDb().selectFrom('postingBatches').select('cancelledAfterExportAt').where('id', '=', uuidBin(exported.batch.id)).executeTakeFirstOrThrow(),
    )
    expect(stamp.cancelledAfterExportAt).toBeTruthy()
    // No reversal file: the file still downloads.
    expect((await download(finance, exported.batch.id)).status).toBe(200)
  })
})
