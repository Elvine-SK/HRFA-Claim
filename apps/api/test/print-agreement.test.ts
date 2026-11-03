import { dbTestsEnabled } from '@elvine-sk/platform-db/testing'
import { runWithContext, SYSTEM_CONTEXT } from '@elvine-sk/platform-db'
import type { PlatformApp } from '@elvine-sk/platform-server'
import type { TestClient } from '@elvine-sk/platform-server/testing'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findAgreement, membersOf, type AgreementRow, type MemberRow } from '../src/modules/agreements/queries.ts'
import { agreementPrintModel } from '../src/modules/print/agreement.ts'
import { cellLineCounts, renderPdf, type Block } from '../src/modules/print/pdf.ts'
import { signersOf } from '../src/modules/print/signers.ts'
import { approve, approvedAgreement, createWorkflow, domesticBodies, roleIds } from './agreement-fixtures.ts'
import { adminClient, API, bootApp, hrmClient } from './helpers.ts'
import { pageCount } from './pdf-helpers.ts'

const domestic = domesticBodies(2039, '10127')
/** Leader 10127 (888010), advance holder 10131 (branch 888050). */
const team = (over: Record<string, unknown> = {}) =>
  domestic({
    hasAdvance: true,
    members: [{ eid: '10127', isLeader: true }, { eid: '10131', isAdvanceHolder: true }],
    ...over,
  })

const block = <K extends Block['kind']>(blocks: Block[], kind: K) =>
  blocks.find((b) => b.kind === kind) as Extract<Block, { kind: K }>

describe.skipIf(!dbTestsEnabled)('agreement PDF (forms 1–4)', () => {
  let platform: PlatformApp
  let admin: TestClient
  let finance: TestClient // 10125, finance officer at head office
  let sectionHead: TestClient // 10128, finance section head at head office
  let hr: TestClient // 10126, HR officer at head office
  let member: TestClient // 10131, member at branch 888050
  let brFinance: TestClient // 10130, finance officer at branch 888050

  beforeAll(async () => {
    platform = await bootApp()
    admin = await adminClient(platform)
    await createWorkflow(admin, join(import.meta.dirname, '../src/modules/payments/workflow.json'))
    const [fin, head, officer] = await roleIds('finance_officer', 'finance_section_head', 'hr_officer')
    finance = (await hrmClient(platform, admin, '10125', [fin!])).client
    sectionHead = (await hrmClient(platform, admin, '10128', [head!])).client
    hr = (await hrmClient(platform, admin, '10126', [officer!])).client
    member = (await hrmClient(platform, admin, '10131')).client
    brFinance = (await hrmClient(platform, admin, '10130', [fin!])).client
  })
  afterAll(async () => {
    await platform?.ctx.db.destroy()
  })

  const rowsOf = (id: string) =>
    runWithContext(SYSTEM_CONTEXT, async () => ({
      agreement: (await findAgreement(id)) as AgreementRow,
      members: (await membersOf(id)) as MemberRow[],
    }))
  const none = { submittedBy: null, steps: {} }

  it('lays out form 1 like the paper sheet', async () => {
    const draft = await hr.post(`${API}/agreements`, team())
    expect(draft.status, JSON.stringify(draft.body)).toBe(201)
    const { agreement, members } = await rowsOf(draft.body.data.id)
    const model = agreementPrintModel({ agreement, members, place: 'ນະຄອນຫຼວງ - ຫຼວງພະບາງ', signers: none, today: '2026-11-03' })
    expect(model.title).toBe('ຂໍ້ຕົກລົງ ຫຼື ແຈ້ງການ')
    expect(model.mark).toBe('ຮ່າງ / DRAFT')
    expect(model.date).toBe('03/11/2026')
    const fields = new Map(block(model.blocks, 'fields').rows)
    expect(fields.get('ເລກທີ (Doc No.):')).toContain(`.ທຄຕລ.888010.2039 · REF ${agreement.ref}`)
    expect(fields.get('ເລື່ອງ (Subject):')).toContain('[ນະຄອນຫຼວງ - ຫຼວງພະບາງ]')
    expect(fields.get('ຂໍ້ມູນພະນັກງານ (Employee Information):')).toBe('ຈຳນວນ 2 ຄົນ')
    const table = block(model.blocks, 'table')
    expect(table.columns).toHaveLength(11)
    expect(table.rows).toHaveLength(2)
    expect(table.rows[1]).toEqual(
      expect.arrayContaining(['2', '10131', '02/11/2026', '05/11/2026', '4', 'Advance Holder']),
    )
    expect(table.rows[0]!.at(-1)).toBe('')
  })

  it('leaves out the member dates overseas and marks an approved one as final', async () => {
    const a = await approvedAgreement(platform, hr, team({ formType: 'overseas', countryIso2: 'FR', fromProvinceCode: undefined, toProvinceCode: undefined }))
    const { agreement, members } = await rowsOf(a.id)
    const model = agreementPrintModel({ agreement, members, place: 'ຝຣັ່ງ', signers: none, today: '2026-11-03' })
    expect(model.title).toBe('ຂໍ້ຕົກລົງ')
    expect(model.mark).toBeNull()
    expect(block(model.blocks, 'table').columns).toHaveLength(8)
    expect(block(model.blocks, 'table').rows[1]!.at(-2)).toBe('0131-USD')
  })

  it('keeps dates, accounts and IDs on one line in the members table', async () => {
    for (const body of [team(), team({ formType: 'overseas', countryIso2: 'FR', fromProvinceCode: undefined, toProvinceCode: undefined })]) {
      const draft = await hr.post(`${API}/agreements`, body)
      expect(draft.status, JSON.stringify(draft.body)).toBe(201)
      const { agreement, members } = await rowsOf(draft.body.data.id)
      // Thirteen-digit accounts, as the bank's are.
      const real = members.map((m) => ({ ...m, accountLak: '0101000000001', accountUsd: '0101000000002' }))
      const model = agreementPrintModel({ agreement, members: real, place: 'x', signers: none, today: '2026-11-03' })
      const table = block(model.blocks, 'table')
      const counts = cellLineCounts(table)
      const oneLine = table.columns
        .map((c, i) => [c.header, i] as const)
        .filter(([h]) => /User ID|Code Rank|Account|ເດີນທາງ|ຈຳນວນ/.test(h))
        .map(([, i]) => i)
      for (const row of counts) for (const i of oneLine) expect(row[i], table.columns[i]!.header).toBe(1)
      // The holder's cell breaks at its space, not inside a word.
      expect(Math.max(...counts.map((r) => r.at(-1)!))).toBeLessThanOrEqual(2)
    }
  })

  it('renders forty members on several pages', async () => {
    const draft = await hr.post(`${API}/agreements`, team())
    const { agreement, members } = await rowsOf(draft.body.data.id)
    const many = Array.from({ length: 40 }, (_, i) => ({ ...members[0]!, eid: String(20000 + i) }))
    const pdf = await renderPdf(agreementPrintModel({ agreement, members: many, place: 'x', signers: none, today: '2026-11-03' }))
    expect(pageCount(pdf)).toBeGreaterThan(1)
  })

  it('names who submitted and who approved', async () => {
    // The payment chain is the shortest real workflow: the finance officer submits, the section head approves.
    const a = await approvedAgreement(platform, hr, team())
    const created = await finance.post(`${API}/payments`, { agreementId: a.id })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    const paymentId = created.body.data.id as string
    expect((await finance.post(`${API}/payments/${paymentId}/submit`, {})).status).toBe(200)
    let signers = await runWithContext(SYSTEM_CONTEXT, () => signersOf('payment', paymentId))
    expect(signers.submittedBy?.name).toBe('ນ້ອຍ ໄຊ')
    expect(signers.steps).toEqual({})
    await approve(sectionHead, paymentId)
    signers = await runWithContext(SYSTEM_CONTEXT, () => signersOf('payment', paymentId))
    expect(signers.steps.finance_section_head?.name).toBe('ຈັນທາ ພອນ')
    expect(signers.steps.finance_section_head?.date).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
    expect(await runWithContext(SYSTEM_CONTEXT, () => signersOf('agreement', a.id))).toEqual(none)
  })

  it('downloads the PDF for whoever may read the agreement', async () => {
    const a = await approvedAgreement(platform, hr, team())
    const res = await platform.app.request(`${API}/agreements/${a.id}/pdf`, { headers: hr.rawHeaders() })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toContain(`${a.ref}.pdf`)
    expect(new TextDecoder().decode(new Uint8Array(await res.arrayBuffer()).slice(0, 5))).toBe('%PDF-')
    // A member at another branch reads it; that branch's Finance does not.
    expect((await platform.app.request(`${API}/agreements/${a.id}/pdf`, { headers: member.rawHeaders() })).status).toBe(200)
    expect((await platform.app.request(`${API}/agreements/${a.id}/pdf`, { headers: brFinance.rawHeaders() })).status).toBe(404)
  })

  it('lets a member with a role at another branch open the agreement they travel on', async () => {
    // 10130 is a finance officer at 888050 (branch scope) and travels on this 888010 trip: their reminder links here.
    const a = await approvedAgreement(
      platform,
      hr,
      domestic({ members: [{ eid: '10127', isLeader: true }, { eid: '10130' }] }),
    )
    expect((await brFinance.get(`${API}/agreements/${a.id}`)).status).toBe(200)
    expect((await platform.app.request(`${API}/agreements/${a.id}/pdf`, { headers: brFinance.rawHeaders() })).status).toBe(200)
    const list = await brFinance.get(`${API}/agreements?pageSize=100`)
    expect(list.body.data.map((r: any) => r.id)).toContain(a.id)
  })
})
