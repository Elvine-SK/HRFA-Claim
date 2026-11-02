import { AppError } from '@elvine-sk/platform-core'
import type { PostingMember, UploadLine } from '../payments/posting.ts'
import type { Currency, PostingEntry, ZoneKind } from '../travel-master/lookups.ts'
import { fromCents, toCents, type Amount } from '../travel-master/money.ts'
import type { Totals } from './totals.ts'

function entryMissing(component: string): AppError {
  const message = `The posting entry of "${component}" is missing or duplicated`
  return new AppError('posting.entry_missing', message, {
    status: 422,
    details: [{ path: 'entries', code: 'posting.entry_missing', message }],
  })
}

function accountMissing(currency: Currency): AppError {
  const message = `The advance holder has no ${currency} account to post to`
  return new AppError('posting.account_missing', message, {
    status: 422,
    details: [{ path: 'members', code: 'posting.account_missing', message }],
  })
}

/**
 * One line per component with money, on the side its entry gives. Order as in plan 4: DR GL lines, DR holder, CR
 * GL lines, CR holder. Each component with money needs exactly one entry.
 */
function linesFor(
  amounts: Map<string, bigint>,
  entries: PostingEntry[],
  input: { currency: Currency; holder?: PostingMember; branch: string; remark: string; rvsNo?: string },
): UploadLine[] {
  const { currency, holder, branch, remark } = input
  for (const [component, amount] of amounts)
    if (amount !== 0n && entries.filter((e) => e.component === component).length !== 1) throw entryMissing(component)

  const out = { DR: { gl: [] as UploadLine[], member: [] as UploadLine[] }, CR: { gl: [] as UploadLine[], member: [] as UploadLine[] } }
  for (const e of entries) {
    const amount = amounts.get(e.component) ?? 0n
    if (amount === 0n) continue
    const base = { ccy: currency, chequeNo: '', amount: fromCents(amount), side: e.side, remark }
    if (e.accountKind === 'gl') {
      out[e.side].gl.push({
        ...base,
        account: `${branch}${currency}${e.gl ?? ''}${e.seq ?? ''}`,
        branch,
        name: e.glNameEn ?? '',
        // The suspense number goes on the holding account's line of the clearing file only (ກ25).
        rvsNo: e.component === 'holding' && e.side === 'DR' ? (input.rvsNo ?? '') : '',
      })
      continue
    }
    const account = holder ? (currency === 'LAK' ? holder.accountLak : holder.accountUsd) : null
    if (!holder || !account) throw accountMissing(currency)
    out[e.side].member.push({ ...base, account, branch: holder.branchCode, name: holder.name, rvsNo: '' })
  }
  return [...out.DR.gl, ...out.DR.member, ...out.CR.gl, ...out.CR.member]
}

/**
 * The settlement's upload file (spec §11, plan 5 working answers). Domestic and border: expenses by type and the
 * holder's remainder or excess against the whole advance. Overseas: the spent part, at most the advance, is credited
 * to the holding account instead, and the advance account takes only what the holder returns.
 */
export function buildSettlementLines(input: {
  zoneKind: ZoneKind
  currency: Currency
  totals: Totals
  holder: PostingMember
  entries: PostingEntry[]
  branch: string
  remark: string
}): UploadLine[] {
  const { totals } = input
  const holding = toCents(totals.holding)
  // advance = total + returned − excess (remaining = advance − total).
  const advance = toCents(totals.total) + toCents(totals.returned) - toCents(totals.excess)
  const amounts = new Map<string, bigint>([
    ['fuel', toCents(totals.byType.fuel)],
    ['fare', toCents(totals.byType.fare)],
    ['returned', toCents(totals.returned)],
    ['advance', advance - holding],
    ['holding', holding],
    ['excess', toCents(totals.excess)],
  ])
  return linesFor(amounts, input.entries, input)
}

/** The clearing file of an overseas settlement: the holding account back to the advance account, with `RVS_NO`. */
export function buildClearingLines(input: {
  currency: Currency
  holding: Amount
  entries: PostingEntry[]
  branch: string
  remark: string
  rvsNo: string
}): UploadLine[] {
  const holding = toCents(input.holding)
  return linesFor(
    new Map([
      ['holding', holding],
      ['advance', holding],
    ]),
    input.entries,
    input,
  )
}
