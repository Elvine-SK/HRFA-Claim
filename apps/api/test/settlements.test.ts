import { runWithContext, SYSTEM_CONTEXT } from '@elvine-sk/platform-db'
import { dbTestsEnabled } from '@elvine-sk/platform-db/testing'
import type { PlatformApp } from '@elvine-sk/platform-server'
import type { TestClient } from '@elvine-sk/platform-server/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { transition } from '../src/modules/settlements/procedures.ts'
import { addDays, todayHrm } from '../src/shared/dates.ts'
import { approvedAgreement, domesticBodies, roleIds } from './agreement-fixtures.ts'
import { adminClient, API, bootApp, hrmClient } from './helpers.ts'
import { attachFile, exportedPayment } from './payment-fixtures.ts'

const url = (p = '') => `${API}/settlements${p}`
const domestic = domesticBodies(2033, '10102')
/** Leader 10102, advance holder 10103, deputy 10104. */
const team = {
  hasAdvance: true,
  members: [
    { eid: '10102', isLeader: true },
    { eid: '10103', isAdvanceHolder: true },
    { eid: '10104', isDeputy: true },
  ],
}
const overseas = (over: Record<string, unknown> = {}) =>
  domestic({
    formType: 'overseas',
    countryIso2: 'FR',
    fromProvinceCode: undefined,
    toProvinceCode: undefined,
    ...team,
    ...over,
  })

describe.skipIf(!dbTestsEnabled)('settlements (draft, lines, receipts)', () => {
  let platform: PlatformApp
  let admin: TestClient
  let finance: TestClient // 10100, finance officer at head office
  let hr: TestClient // 10101, HR officer at head office
  let leader: TestClient // 10102
  let holder: TestClient // 10103
  let deputy: TestClient // 10104
  let brFinance: TestClient // 10110, finance officer at branch 888050

  beforeAll(async () => {
    platform = await bootApp()
    admin = await adminClient(platform)
    const [fin, officer] = await roleIds('finance_officer', 'hr_officer')
    finance = (await hrmClient(platform, admin, '10100', [fin!])).client
    hr = (await hrmClient(platform, admin, '10101', [officer!])).client
    leader = (await hrmClient(platform, admin, '10102')).client
    holder = (await hrmClient(platform, admin, '10103')).client
    deputy = (await hrmClient(platform, admin, '10104')).client
    brFinance = (await hrmClient(platform, admin, '10110', [fin!])).client
  })
  afterAll(async () => {
    await platform?.ctx.db.destroy()
  })

  /** A settlement filed by `by` on a fresh agreement with an exported payment. */
  async function filed(by: TestClient, body: Record<string, unknown> = domestic(team)) {
    const { agreement, payment } = await exportedPayment(platform, finance, hr, body)
    const res = await by.post(url(), { agreementId: agreement.id })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    return { agreement, payment, settlement: res.body.data }
  }

  const receipt = async (settlementId: string, by: TestClient = deputy) => {
    const f = await attachFile(platform, by, 'settlement', settlementId)
    expect(f.status, JSON.stringify(f.body)).toBe(201)
    return f.body.data.id as string
  }

  it('a member who is not the holder files it', async () => {
    const { payment, settlement } = await filed(
      deputy,
      domestic({ ...team, travelFrom: '2033-11-01', travelTo: '2033-11-04' }),
    )
    const advance = payment.members.flatMap((m: any) => m.items).find((i: any) => i.component === 'advance')
    expect(settlement).toMatchObject({
      status: 'draft',
      zoneKind: 'domestic',
      currency: 'LAK',
      advance: advance.amount,
      holderEid: '10103',
      filedByEid: '10104',
      caseKind: null,
      // Friday 4 November; Monday 7 is an HRM holiday.
      dueDate: '2033-11-14',
      isLate: false,
      version: 1,
    })
    expect(settlement.totals).toMatchObject({ total: '0.00', caseKind: 'unused', returned: advance.amount })
    // Step 2 candidates: the leader and the deputy, less the filer.
    expect(settlement.candidates.map((c: any) => c.eid)).toEqual(['10102'])
  })

  it('refuses what cannot be settled', async () => {
    const code = (res: any) => [res.status, res.body.error?.code]
    const noAdvance = await exportedPayment(platform, finance, hr, domestic({ members: [{ eid: '10102', isLeader: true }] }))
    expect(code(await leader.post(url(), { agreementId: noAdvance.agreement.id }))).toEqual([409, 'settlements.no_advance'])

    const notExported = await approvedAgreement(platform, hr, domestic(team))
    expect(code(await leader.post(url(), { agreementId: notExported.id }))).toEqual([409, 'settlements.advance_not_paid'])

    const { agreement } = await filed(holder)
    expect(code(await leader.post(url(), { agreementId: agreement.id }))).toEqual([409, 'settlements.exists'])
    // Not a member (the HR officer who wrote the agreement), and Finance: 404.
    expect(code(await hr.post(url(), { agreementId: agreement.id }))[0]).toBe(404)
    expect(code(await finance.post(url(), { agreementId: agreement.id }))[0]).toBe(404)
  })

  it('saves domestic lines with receipts and works out the case', async () => {
    const { settlement: s } = await filed(deputy)
    const [r1, r2] = [await receipt(s.id), await receipt(s.id)]
    const res = await deputy.put(url(`/${s.id}`), {
      version: 1,
      caseKind: 'partly_used',
      lines: [
        { description: 'Fuel to Luang Prabang', expenseType: 'fuel', currency: 'LAK', amount: '500000', receiptFileId: r1 },
        { description: 'Bus tickets', expenseType: 'fare', currency: 'LAK', amount: '1000000', receiptFileId: r2 },
      ],
    })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const d = res.body.data
    expect(d.version).toBe(2)
    expect(d.caseKind).toBe('partly_used')
    expect(d.lines.map((l: any) => [l.expenseType, l.settledAmount, l.receiptFileId])).toEqual([
      ['fuel', '500000.00', r1],
      ['fare', '1000000.00', r2],
    ])
    expect(d.totals).toMatchObject({ total: '1500000.00', caseKind: 'partly_used', byType: { fuel: '500000.00', fare: '1000000.00' } })
    // Any member may change the draft.
    const again = await leader.put(url(`/${s.id}`), { version: 2, lines: [] })
    expect(again.status, JSON.stringify(again.body)).toBe(200)
    expect(again.body.data.lines).toEqual([])
  })

  it('refuses incomplete lines', async () => {
    const { settlement: s } = await filed(deputy)
    const r = await receipt(s.id)
    const put = (lines: unknown[]) => deputy.put(url(`/${s.id}`), { version: 1, lines })
    const paths = async (lines: unknown[]) => {
      const res = await put(lines)
      expect(res.status, JSON.stringify(res.body)).toBe(422)
      return res.body.error.details.map((e: any) => `${e.path} ${e.code}`)
    }
    const line = { description: 'Taxi', expenseType: 'fare', currency: 'LAK', amount: '50000' }
    expect(await paths([line])).toEqual(['lines.0.receiptFileId settlements.receipt_required'])
    expect(await paths([{ ...line, expenseType: undefined, receiptFileId: r }])).toEqual([
      'lines.0.expenseType settlements.expense_type_required',
    ])
    expect(await paths([{ ...line, currency: 'USD', receiptFileId: r }])).toEqual([
      'lines.0.crossRate settlements.cross_rate_required',
    ])
    // A line without a receipt but with a reason is accepted.
    expect((await put([{ ...line, noReceiptReason: 'Tuk-tuk, no receipt given' }])).status).toBe(200)
  })

  it('refuses a zero amount or cross rate at the line', async () => {
    const { settlement: s } = await filed(deputy, overseas())
    const [r, proof] = [await receipt(s.id), await receipt(s.id)]
    const put = (line: Record<string, unknown>) =>
      deputy.put(url(`/${s.id}`), {
        version: 1,
        lines: [{ description: 'Hotel', currency: 'THB', amount: '3500', crossRate: '35', receiptFileId: r, rateProofFileId: proof, ...line }],
      })
    const zeroRate = await put({ crossRate: '0.000000' })
    expect([zeroRate.status, zeroRate.body.error?.details?.[0]?.path, zeroRate.body.error?.details?.[0]?.code]).toEqual([
      422,
      'lines.0.crossRate',
      'settlements.cross_rate_invalid',
    ])
    const zeroAmount = await put({ amount: '0' })
    expect([zeroAmount.status, zeroAmount.body.error?.details?.[0]?.path, zeroAmount.body.error?.details?.[0]?.code]).toEqual([
      422,
      'lines.0.amount',
      'settlements.amount_invalid',
    ])
  })

  it('lets a branch reader who is a member of a head office trip work on its settlement', async () => {
    const body = domestic({
      hasAdvance: true,
      members: [
        { eid: '10102', isLeader: true },
        { eid: '10103', isAdvanceHolder: true },
        { eid: '10110' },
      ],
    })
    const { settlement: s } = await filed(brFinance, body)
    expect((await brFinance.get(url(`/${s.id}`))).status).toBe(200)
    const listed = await brFinance.get(url(`?filter[agreementId][eq]=${s.agreementId}`))
    expect(listed.body.data.map((r: any) => r.id)).toEqual([s.id])
    const saved = await brFinance.put(url(`/${s.id}`), { version: 1, lines: [] })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
  })

  it('converts overseas lines at their cross rate and needs proof of the rate', async () => {
    const { settlement: s } = await filed(deputy, overseas())
    expect(s).toMatchObject({ zoneKind: 'overseas', currency: 'USD' })
    const [r, proof] = [await receipt(s.id), await receipt(s.id)]
    const thb = { description: 'Hotel in Bangkok', currency: 'THB', amount: '3500.00', crossRate: '35.123456', receiptFileId: r }
    const missing = await deputy.put(url(`/${s.id}`), { version: 1, lines: [thb] })
    expect([missing.status, missing.body.error.details[0].path]).toEqual([422, 'lines.0.rateProofFileId'])
    const typed = await deputy.put(url(`/${s.id}`), { version: 1, lines: [{ ...thb, rateProofFileId: proof, expenseType: 'fare' }] })
    expect([typed.status, typed.body.error.details[0].code]).toEqual([422, 'settlements.expense_type_not_allowed'])
    const ok = await deputy.put(url(`/${s.id}`), { version: 1, lines: [{ ...thb, rateProofFileId: proof }] })
    expect(ok.status, JSON.stringify(ok.body)).toBe(200)
    expect(ok.body.data.lines[0].settledAmount).toBe('99.65')
    const usd = await deputy.put(url(`/${s.id}`), {
      version: 2,
      lines: [{ description: 'Taxi', currency: 'USD', amount: '20', crossRate: '1', receiptFileId: r }],
    })
    expect([usd.status, usd.body.error.details[0].code]).toEqual([422, 'settlements.cross_rate_not_allowed'])
  })

  it('takes only its own receipts, as PDF, and keeps them once submitted', async () => {
    const { settlement: s } = await filed(deputy)
    const { settlement: other } = await filed(deputy)
    const foreign = await receipt(other.id)
    const res = await deputy.put(url(`/${s.id}`), {
      version: 1,
      lines: [{ description: 'Taxi', expenseType: 'fare', currency: 'LAK', amount: '50000', receiptFileId: foreign }],
    })
    expect([res.status, res.body.error.details?.[0]?.code]).toEqual([422, 'settlements.file_unknown'])

    expect((await attachFile(platform, deputy, 'settlement', s.id, { name: 'x.png', png: true })).status).not.toBe(201)
    // Not a member: the HR officer cannot attach.
    expect((await attachFile(platform, hr, 'settlement', s.id)).status).not.toBe(201)

    const own = await receipt(s.id)
    await runWithContext(SYSTEM_CONTEXT, () => transition(s.id, 1, 'in_approval'))
    const del = await deputy.delete(`${API}/files/${own}`)
    expect([del.status, del.body.error?.code]).toEqual([409, 'settlements.receipt_locked'])
    const edit = await deputy.put(url(`/${s.id}`), { version: 2, lines: [] })
    expect([edit.status, edit.body.error.code]).toEqual([409, 'settlements.not_draft'])
  })

  it('shows settlements by branch and membership', async () => {
    const { agreement, settlement: s } = await filed(holder)
    expect((await finance.get(url(`/${s.id}`))).status).toBe(200)
    expect((await leader.get(url(`/${s.id}`))).status).toBe(200)
    expect((await brFinance.get(url(`/${s.id}`))).status).toBe(404)
    expect((await hr.get(url(`/${s.id}`))).status).toBe(404)
    const mine = await leader.get(url(`?filter[agreementId][eq]=${agreement.id}`))
    expect(mine.body.data.map((r: any) => r.id)).toEqual([s.id])
    const branch = await brFinance.get(url(`?filter[agreementId][eq]=${agreement.id}`))
    expect(branch.body.data).toEqual([])

    const found = await leader.get(url(`/lookup?number=${encodeURIComponent(agreement.ref)}`))
    expect(found.body.data).toEqual({ agreementId: agreement.id, settlementId: s.id, canFile: false })
    expect((await brFinance.get(url(`/lookup?number=${encodeURIComponent(agreement.ref)}`))).status).toBe(404)
  })

  it('lists overdue settlements for Finance', async () => {
    // Returned Monday 5 January 2026, due 12 January: overdue today.
    const past = { ...team, travelFrom: '2026-01-02', travelTo: '2026-01-05' }
    const unfiled = await exportedPayment(platform, finance, hr, domestic(past))
    const { agreement: drafted, settlement: draft } = await filed(deputy, domestic(past))
    const { agreement: sent, settlement: submitted } = await filed(deputy, domestic(past))
    await runWithContext(SYSTEM_CONTEXT, () => transition(submitted.id, 1, 'in_approval'))
    const future = await exportedPayment(platform, finance, hr, domestic(team))

    const res = await finance.get(url('/overdue?sort=-travelTo'))
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const byAgreement = new Map(res.body.data.map((r: any) => [r.agreementId, r]))
    expect(byAgreement.get(unfiled.agreement.id)).toMatchObject({
      ref: unfiled.agreement.ref,
      travelTo: '2026-01-05',
      dueDate: '2026-01-12',
      holderEid: '10103',
      settlementId: null,
    })
    expect(byAgreement.get(drafted.id)).toMatchObject({ settlementId: draft.id })
    expect(byAgreement.has(sent.id)).toBe(false)
    expect(byAgreement.has(future.agreement.id)).toBe(false)

    const branch = await brFinance.get(url('/overdue'))
    expect(branch.status).toBe(200)
    expect(branch.body.data.some((r: any) => r.agreementId === unfiled.agreement.id)).toBe(false)
    expect((await leader.get(url('/overdue'))).status).toBe(403)
  })

  it('lets only members change or submit it, readers are refused with a reason', async () => {
    const { settlement: s } = await filed(deputy)
    // Finance at head office reads every settlement but is not on this trip.
    expect((await finance.get(url(`/${s.id}`))).status).toBe(200)
    const put = await finance.put(url(`/${s.id}`), { version: 1, lines: [] })
    expect(put.status).toBe(403)
    expect(put.body.error.code).toBe('settlements.not_member')
    const submit = await finance.post(url(`/${s.id}/submit`), { version: 1 })
    expect(submit.status).toBe(403)
    expect(submit.body.error.code).toBe('settlements.not_member')
  })

  it('pages the overdue list exactly', async () => {
    // Returned five calendar days ago: due today at the earliest, so never overdue yet.
    const today = todayHrm()
    const recent = await exportedPayment(
      platform,
      finance,
      hr,
      domestic({ ...team, travelFrom: addDays(today, -7), travelTo: addDays(today, -5) }),
    )
    const all = await finance.get(url('/overdue?pageSize=100'))
    expect(all.status, JSON.stringify(all.body)).toBe(200)
    expect(all.body.data.some((r: any) => r.agreementId === recent.agreement.id)).toBe(false)
    expect(all.body.meta.total).toBe(all.body.data.length)
    const first = await finance.get(url('/overdue?pageSize=1'))
    expect(first.body.data).toHaveLength(1)
  })
})
