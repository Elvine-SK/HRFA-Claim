import { AppError } from '@elvine-sk/platform-core'
import type { Currency, PostingEntry } from '../travel-master/lookups.ts'
import { fitsAmount, fromCents, toCents, type Amount } from '../travel-master/money.ts'
import type { PaymentItem } from './calculate.ts'
import { POSTING_COMPONENT } from './types.ts'

/** One row of the CORE upload file (spec §11); `chequeNo` and `rvsNo` stay empty for payments. */
export interface UploadLine {
  account: string
  branch: string
  name: string
  ccy: Currency
  chequeNo: string
  amount: Amount
  rvsNo: string
  side: 'DR' | 'CR'
  remark: string
}

/** A member as posted: `name` is `NAME_ENG SNAME_ENG` upper-case, else the Lao name. */
export interface PostingMember {
  eid: string
  name: string
  branchCode: string
  accountLak: string | null
  accountUsd: string | null
}

const CURRENCIES: Currency[] = ['LAK', 'USD']

/** Exact sum in cents; items may be negative (meal deduction), so no validating parser here. */
function cents(a: Amount): bigint {
  const neg = a.startsWith('-')
  const c = toCents(neg ? a.slice(1) : a)
  return neg ? -c : c
}

function tooLarge(total: bigint): AppError {
  return new AppError('payments.amount_too_large', 'An amount has more than 13 whole digits', {
    status: 422,
    details: [{ path: 'items', code: 'payments.amount_too_large', message: `total ${fromCents(total)}` }],
  })
}

function entryInvalid(component: string): AppError {
  const message = `The posting entries of "${component}" are missing, duplicated or on the same side`
  return new AppError('posting.entry_missing', message, {
    status: 422,
    details: [{ path: 'entries', code: 'posting.entry_missing', message }],
  })
}

/** A GL entry without its account, SEQ or English name cannot make a line of the upload file. */
export function glEntryInvalid(component: string): AppError {
  const message = `The GL entry of "${component}" has no account, SEQ or name`
  return new AppError('posting.entry_invalid', message, {
    status: 422,
    details: [{ path: 'entries', code: 'posting.entry_invalid', message }],
  })
}

/** A component whose items sum below zero (a deduction larger than what it lowers). */
export function amountNegative(component: string, total: bigint): AppError {
  const message = `The total of "${component}" is below zero: ${fromCents(total)}`
  return new AppError('posting.amount_negative', message, {
    status: 422,
    details: [{ path: 'items', code: 'posting.amount_negative', message }],
  })
}

function accountMissing(eid: string, ccy: Currency): AppError {
  const message = `Member ${eid} has no ${ccy} account to post to`
  return new AppError('posting.account_missing', message, {
    status: 422,
    details: [{ path: 'members', code: 'posting.account_missing', message }],
  })
}

/**
 * The lines of the upload file: items summed by posting component and currency, then spread over the entries.
 * Order: all DR lines in entry order, then all CR lines. A zero total is left out.
 */
export function buildPaymentLines(input: {
  items: PaymentItem[]
  entries: PostingEntry[]
  members: PostingMember[]
  branch: string
  remark: string
}): UploadLine[] {
  const { items, entries, members, branch, remark } = input
  const byComponent = new Map<string, bigint>() // component|ccy
  const byMember = new Map<string, bigint>() // component|ccy|eid
  for (const it of items) {
    const c = cents(it.amount)
    const k = `${POSTING_COMPONENT[it.component]}|${it.currency}`
    byComponent.set(k, (byComponent.get(k) ?? 0n) + c)
    const mk = `${k}|${it.eid}`
    byMember.set(mk, (byMember.get(mk) ?? 0n) + c)
  }
  const memberOf = new Map(members.map((m) => [m.eid, m]))
  const eids = [...new Set([...members.map((m) => m.eid), ...items.map((i) => i.eid)])]


  // Every component with money needs exactly one GL entry and one member entry, on opposite sides.
  for (const component of new Set([...byComponent].filter(([, t]) => t !== 0n).map(([k]) => k.split('|')[0]!))) {
    const gl = entries.filter((e) => e.component === component && e.accountKind === 'gl')
    const mem = entries.filter((e) => e.component === component && e.accountKind === 'member')
    if (gl.length !== 1 || mem.length !== 1 || gl[0]!.side === mem[0]!.side) throw entryInvalid(component)
  }

  const glLines: Record<'DR' | 'CR', UploadLine[]> = { DR: [], CR: [] }
  for (const e of entries) {
    if (e.accountKind !== 'gl') continue
    for (const ccy of CURRENCIES) {
      const total = byComponent.get(`${e.component}|${ccy}`) ?? 0n
      if (total === 0n) continue
      if (total < 0n) throw amountNegative(e.component, total)
      if (!fitsAmount(fromCents(total))) throw tooLarge(total)
      if (!e.gl || !e.seq || !e.glNameEn) throw glEntryInvalid(e.component)
      glLines[e.side].push({
        account: `${branch}${ccy}${e.gl}${e.seq}`,
        branch,
        name: e.glNameEn,
        ccy,
        chequeNo: '',
        amount: fromCents(total),
        rvsNo: '',
        side: e.side,
        remark,
      })
    }
  }

  // Member lines: per side, in member order, currencies inside each member.
  const memberLines: Record<'DR' | 'CR', UploadLine[]> = { DR: [], CR: [] }
  for (const side of ['DR', 'CR'] as const) {
    const components = entries.filter((e) => e.accountKind === 'member' && e.side === side).map((e) => e.component)
    for (const eid of eids) {
      for (const ccy of CURRENCIES) {
        const total = components.reduce((s, c) => s + (byMember.get(`${c}|${ccy}|${eid}`) ?? 0n), 0n)
        if (total === 0n) continue
        if (total < 0n) throw amountNegative(components.join(', '), total)
        if (!fitsAmount(fromCents(total))) throw tooLarge(total)
        const m = memberOf.get(eid)
        const account = ccy === 'LAK' ? m?.accountLak : m?.accountUsd
        if (!m || !account) throw accountMissing(eid, ccy)
        memberLines[side].push({
          account,
          branch: m.branchCode,
          name: m.name,
          ccy,
          chequeNo: '',
          amount: fromCents(total),
          rvsNo: '',
          side,
          remark,
        })
      }
    }
  }
  return [...glLines.DR, ...memberLines.DR, ...glLines.CR, ...memberLines.CR]
}

/** dd/mm/yyyy of a YYYY-MM-DD date. */
function dmy(date: string): string {
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y}`
}

/** `<zone> <leader> <days> <place> <doc no> <from>-<to> <ref>` with single spaces (spec §11). */
export function paymentRemark(input: {
  zoneCode: string
  leaderName: string
  days: number
  placeLo: string
  docNo: string
  travelFrom: string
  travelTo: string
  ref: string
}): string {
  const { zoneCode, leaderName, days, placeLo, docNo, travelFrom, travelTo, ref } = input
  return [zoneCode, leaderName, String(days), placeLo, docNo, `${dmy(travelFrom)}-${dmy(travelTo)}`, ref]
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' ')
}

/** Currencies whose DR and CR totals differ. */
export function unbalancedCurrencies(lines: UploadLine[]): Currency[] {
  return CURRENCIES.filter((ccy) => {
    let diff = 0n
    for (const l of lines) if (l.ccy === ccy) diff += l.side === 'DR' ? cents(l.amount) : -cents(l.amount)
    return diff !== 0n
  })
}
