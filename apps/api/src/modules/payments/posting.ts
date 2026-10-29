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

  const memberLines = new Map<string, { line: UploadLine; total: bigint }>()
  const memberOrder: string[] = []

  const out: Record<'DR' | 'CR', UploadLine[]> = { DR: [], CR: [] }
  for (const e of entries) {
    for (const ccy of CURRENCIES) {
      if (e.accountKind === 'gl') {
        const total = byComponent.get(`${e.component}|${ccy}`) ?? 0n
        if (total === 0n) continue
        if (total < 0n || !fitsAmount(fromCents(total))) throw tooLarge(total)
        out[e.side].push({
          account: `${branch}${ccy}${e.gl ?? ''}${e.seq ?? ''}`,
          branch,
          name: e.glNameEn ?? '',
          ccy,
          chequeNo: '',
          amount: fromCents(total),
          rvsNo: '',
          side: e.side,
          remark,
        })
      } else {
        for (const eid of eids) {
          const total = byMember.get(`${e.component}|${ccy}|${eid}`) ?? 0n
          if (total === 0n) continue
          const key = `${e.side}|${ccy}|${eid}`
          const prev = memberLines.get(key)
          if (prev) {
            prev.total += total
            continue
          }
          const m = memberOf.get(eid)
          const account = ccy === 'LAK' ? m?.accountLak : m?.accountUsd
          if (!m || !account) throw accountMissing(eid, ccy)
          const line: UploadLine = {
            account,
            branch: m.branchCode,
            name: m.name,
            ccy,
            chequeNo: '',
            amount: '0.00',
            rvsNo: '',
            side: e.side,
            remark,
          }
          memberLines.set(key, { line, total })
          memberOrder.push(key)
          out[e.side].push(line)
        }
      }
    }
  }
  for (const key of memberOrder) {
    const { line, total } = memberLines.get(key)!
    if (total < 0n || !fitsAmount(fromCents(total))) throw tooLarge(total)
    line.amount = fromCents(total)
  }
  return [...out.DR, ...out.CR]
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
