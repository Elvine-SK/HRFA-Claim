import { runWithContext, SYSTEM_CONTEXT } from '@elvine-sk/platform-db'
import { dbTestsEnabled } from '@elvine-sk/platform-db/testing'
import type { PlatformApp } from '@elvine-sk/platform-server'
import type { TestClient } from '@elvine-sk/platform-server/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findAgreement, membersOf, type AgreementRow, type MemberRow } from '../src/modules/agreements/queries.ts'
import { renderPdf, type Block } from '../src/modules/print/pdf.ts'
import { settlementPrintModel } from '../src/modules/print/settlement.ts'
import { findSettlement, totalsOfRow, type LineRow, type SettlementRow } from '../src/modules/settlements/queries.ts'
import { domesticBodies, roleIds } from './agreement-fixtures.ts'
import { adminClient, API, bootApp, hrmClient } from './helpers.ts'
import { exportedPayment } from './payment-fixtures.ts'
import { pageCount } from './pdf-helpers.ts'

const domestic = domesticBodies(2040, '10127')
/** Leader 10127 (888010), advance holder 10131 (branch 888050). */
const team = (over: Record<string, unknown> = {}) =>
  domestic({
    hasAdvance: true,
    members: [{ eid: '10127', isLeader: true }, { eid: '10131', isAdvanceHolder: true }],
    ...over,
  })

const block = <K extends Block['kind']>(blocks: Block[], kind: K) =>
  blocks.find((b) => b.kind === kind) as Extract<Block, { kind: K }>

const line = (over: Partial<LineRow>): LineRow => ({
  id: 'x',
  description: 'ຄ່ານ້ຳມັນ',
  expenseType: 'fuel',
  currency: 'LAK',
  amount: '500000.00',
  crossRate: null,
  settledAmount: '500000.00',
  receiptFileId: 'f',
  noReceiptReason: null,
  rateProofFileId: null,
  ...over,
})
const none = { submittedBy: null, steps: {} }

describe.skipIf(!dbTestsEnabled)('settlement PDF (forms 5–6)', () => {
  let platform: PlatformApp
  let admin: TestClient
  let finance: TestClient // 10125, finance officer at head office
  let hr: TestClient // 10126, HR officer at head office
  let holder: TestClient // 10131, at branch 888050
  let stranger: TestClient // 10129, no role, not a member

  beforeAll(async () => {
    platform = await bootApp()
    admin = await adminClient(platform)
    const [fin, officer] = await roleIds('finance_officer', 'hr_officer')
    finance = (await hrmClient(platform, admin, '10125', [fin!])).client
    hr = (await hrmClient(platform, admin, '10126', [officer!])).client
    holder = (await hrmClient(platform, admin, '10131')).client
    stranger = (await hrmClient(platform, admin, '10129')).client
  })
  afterAll(async () => {
    await platform?.ctx.db.destroy()
  })

  /** A draft settlement filed by the holder, with the rows the model reads. */
  async function filed(body: Record<string, unknown>) {
    const { agreement } = await exportedPayment(platform, finance, hr, body)
    const res = await holder.post(`${API}/settlements`, { agreementId: agreement.id })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    const id = res.body.data.id as string
    return runWithContext(SYSTEM_CONTEXT, async () => ({
      id,
      settlement: (await findSettlement(id)) as SettlementRow,
      agreement: (await findAgreement(agreement.id)) as AgreementRow,
      members: (await membersOf(agreement.id)) as MemberRow[],
    }))
  }

  it('lays out form 5: the case, the lines and the balance', async () => {
    const { settlement, agreement, members } = await filed(team())
    const lines = [line({}), line({ description: 'ຄ່າປີ້ຍົນ', expenseType: 'fare', amount: '1000000.00', settledAmount: '1000000.00' })]
    const model = settlementPrintModel({
      settlement: { ...settlement, caseKind: 'partly_used' },
      lines,
      totals: totalsOfRow(settlement, lines),
      agreement,
      members,
      place: 'ຫຼວງພະບາງ',
      signers: none,
      today: '2026-11-03',
    })
    expect(model.title).toBe('ໃບສະຫຼຸບເງິນແຮເດີນທາງ')
    expect(model.mark).toBe('ຮ່າງ / DRAFT')
    const checks = block(model.blocks, 'checks')
    expect(checks.options.map((o) => o.checked)).toEqual([false, true, false, false])
    const table = block(model.blocks, 'table')
    expect(table.columns).toHaveLength(3)
    expect(table.rows).toHaveLength(2)
    expect(table.rows[0]).toEqual(['1', 'ຄ່ານ້ຳມັນ (ຄ່ານ້ຳມັນ / Fuel)', '500,000.00'])
    const advance = Number(settlement.advance)
    expect(table.footer).toEqual([
      ['', 'ລວມຄ່າໃຊ້ຈ່າຍທັງໝົດ (Total Expenses)', '1,500,000.00'],
      [
        '',
        'ເງິນແຮທີ່ຍັງເຫຼືອ / ຕ້ອງມອບຄືນ (Remaining / Balance Due)',
        (advance - 1500000).toLocaleString('en-US', { minimumFractionDigits: 2 }),
      ],
    ])
    const boxes = block(model.blocks, 'signatures').boxes.map((b) => b.role)
    expect(boxes).toEqual(['ຄະນະເດີນທາງ', 'ຜູ້ສະຫຼຸບ', 'ພະແນກຫ້ອງການບໍລິຫານ-ການເງິນ', 'ຂະແໜງການເງິນ', 'ຜູ້ກວດສອບ'])
  })

  it('lays out form 6 with the cross rate and USD columns', async () => {
    const { settlement, agreement, members } = await filed(
      team({ formType: 'overseas', countryIso2: 'FR', fromProvinceCode: undefined, toProvinceCode: undefined }),
    )
    const lines = [
      line({ description: 'Hotel', expenseType: null, currency: 'THB', amount: '3500.00', crossRate: '35.123456', settledAmount: '99.65' }),
      line({ description: 'Taxi', expenseType: null, currency: 'USD', amount: '20.00', settledAmount: '20.00', receiptFileId: null, noReceiptReason: 'lost' }),
    ]
    const model = settlementPrintModel({
      settlement: { ...settlement, lateReason: 'sick' },
      lines,
      totals: totalsOfRow(settlement, lines),
      agreement,
      members,
      place: 'ຝຣັ່ງ',
      signers: none,
      today: '2026-11-03',
    })
    const table = block(model.blocks, 'table')
    expect(table.columns).toHaveLength(5)
    expect(table.rows[0]).toEqual(['1', 'Hotel', '3,500.00 THB', '35.123456', '99.65'])
    expect(table.rows[1]![1]).toBe('Taxi — ບໍ່ມີໃບບິນ (no receipt): lost')
    expect(table.footer![0]!.at(-1)).toBe('119.65')
    expect(block(model.blocks, 'note').text).toContain('sick')
  })

  it('renders thirty long lines on several pages', async () => {
    const { settlement, agreement, members } = await filed(team())
    const lines = Array.from({ length: 30 }, () => line({ description: 'ຄ່າໃຊ້ຈ່າຍ '.repeat(27).slice(0, 300) }))
    const pdf = await renderPdf(
      settlementPrintModel({
        settlement,
        lines,
        totals: totalsOfRow(settlement, lines),
        agreement,
        members,
        place: 'x',
        signers: none,
        today: '2026-11-03',
      }),
    )
    expect(pageCount(pdf)).toBeGreaterThan(1)
  })

  it('downloads the PDF for a member, not for someone else', async () => {
    const { id, settlement } = await filed(team())
    const res = await platform.app.request(`${API}/settlements/${id}/pdf`, { headers: holder.rawHeaders() })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toContain(`${settlement.ref}-settlement.pdf`)
    expect((await platform.app.request(`${API}/settlements/${id}/pdf`, { headers: finance.rawHeaders() })).status).toBe(200)
    expect((await platform.app.request(`${API}/settlements/${id}/pdf`, { headers: stranger.rawHeaders() })).status).toBe(404)
  })
})
