import { AppError, now, uuidv7, type FieldError } from '@elvine-sk/platform-core'
import { createdStamp, inTransaction, updateVersioned, uuidBin, writeHistory } from '@elvine-sk/platform-db'
import { toIso } from '@elvine-sk/platform-server'
import { daysInclusive } from '../../shared/dates.ts'
import { appDb, type PaymentItemsTable, type PaymentsTable } from '../../shared/db.ts'
import { formatDocNo, parseDocNo } from '../agreements/doc-no.ts'
import { membersOf, type MemberRow } from '../agreements/queries.ts'
import { fromCents, toCents, type Amount } from '../travel-master/money.ts'
import { billedNights, calculate, CalcError } from './calculate.ts'
import { paymentHistory } from './procedures.ts'
import { loadCalcInput, toCalcMember } from './rates.ts'
import type { Component, PaymentStatus } from './types.ts'

const PAYMENT_COLUMNS = [
  'p.id',
  'p.agreementId',
  'a.ref',
  'a.docNo',
  'a.formType',
  'a.subject',
  'a.zoneCode',
  'a.policyOption',
  'p.branchCode',
  'a.travelFrom',
  'a.travelTo',
  'p.status',
  'p.calculatedAt',
  'p.submittedAt',
  'p.exportedAt',
  'p.postedAt',
  'p.coreRef',
  'p.cancelledAt',
  'p.createdBy',
  'p.createdAt',
  'p.updatedAt',
  'p.version',
] as const

export type PaymentRow = Omit<PaymentsTable, 'status' | 'version' | 'updatedBy' | 'agreementLive'> & {
  status: PaymentStatus
  version: number
  ref: string
  docNo: string
  formType: 'domestic' | 'district' | 'overseas' | 'border'
  subject: string
  zoneCode: string | null
  policyOption: 'bcel_all' | 'host_travel' | 'host_accommodation' | 'host_meals' | 'host_meals_accommodation'
  travelFrom: string
  travelTo: string
}
export type ItemRow = Omit<PaymentItemsTable, 'id' | 'paymentId'>
export interface Bill {
  eid: string
  night: number
  amount: Amount
}

/** Payments with their agreement's header (`p`, `a`), before scope. */
export const paymentRows = () =>
  appDb().selectFrom('payments as p').innerJoin('agreements as a', 'a.id', 'p.agreementId').select(PAYMENT_COLUMNS)

export async function findPayment(id: string): Promise<PaymentRow | null> {
  const row = await paymentRows().where('p.id', '=', uuidBin(id)).executeTakeFirst()
  return (row as PaymentRow | undefined) ?? null
}

/** The agreement's payment that is not void, if any. */
export async function livePaymentOf(agreementId: string): Promise<string | null> {
  const row = await appDb()
    .selectFrom('payments')
    .select('id')
    .where('agreementLive', '=', uuidBin(agreementId))
    .executeTakeFirst()
  return row?.id ?? null
}

export async function itemsOf(paymentId: string): Promise<ItemRow[]> {
  return appDb()
    .selectFrom('paymentItems')
    .select(['sortOrder', 'eid', 'component', 'currency', 'rate', 'count', 'amount', 'basis'])
    .where('paymentId', '=', uuidBin(paymentId))
    .orderBy('sortOrder')
    .execute()
}

export async function billsOf(paymentId: string): Promise<Bill[]> {
  return appDb()
    .selectFrom('paymentBills')
    .select(['eid', 'night', 'amount'])
    .where('paymentId', '=', uuidBin(paymentId))
    .orderBy('eid')
    .orderBy('night')
    .execute()
}

/** Cents of a stored amount, which may be negative (a meal deduction). */
const signed = (a: Amount): bigint => (a.startsWith('-') ? -toCents(a.slice(1)) : toCents(a))

/** Sum of the items per currency, e.g. `{ LAK: '1200000.00' }`. */
export function totalsOf(items: { currency: string; amount: Amount }[]): Record<string, Amount> {
  const sums = new Map<string, bigint>()
  for (const it of items) sums.set(it.currency, (sums.get(it.currency) ?? 0n) + signed(it.amount))
  return Object.fromEntries([...sums].map(([ccy, cents]) => [ccy, fromCents(cents)]))
}

const totalsLine = (items: { currency: string; amount: Amount }[]) =>
  Object.entries(totalsOf(items))
    .map(([ccy, amount]) => `${ccy} ${amount}`)
    .join(', ')

const billsLine = (bills: Bill[]) => bills.map((b) => `${b.eid}:${b.night}=${b.amount}`).join(', ')

/** English text of the calculation's errors; the module's `messages` hold both languages. */
const CALC_MESSAGES: Record<string, string> = {
  'payments.rate_missing': 'No rate for this member on the departure date',
  'payments.same_day_rate_missing': 'No same-day rate on the departure date',
  'payments.fuel_price_missing': 'No fuel price on the departure date',
  'payments.fuel_not_overseas': 'Fuel is not paid on an overseas trip',
  'payments.advance_band_missing': 'No advance band covers this trip',
  'payments.amount_too_large': 'An amount has more than 13 whole digits',
}

/** A calculation error as a 422 with the member's field, e.g. `members.0.departureDate`. */
function calcFailure(err: CalcError): AppError {
  const message = CALC_MESSAGES[err.code] ?? err.code
  return new AppError(err.code, message, {
    status: 422,
    details: [{ path: err.path, code: err.code, message }],
  })
}

/**
 * Replaces the payment's items with a fresh calculation from its agreement, the rates and Finance's bills. A
 * calculation error is a 422 and, like any error, rolls back the caller's transaction.
 */
export async function recalculate(paymentId: string): Promise<void> {
  await inTransaction(async () => {
    const payment = await appDb()
      .selectFrom('payments')
      .select('agreementId')
      .where('id', '=', uuidBin(paymentId))
      .executeTakeFirst()
    if (!payment) throw AppError.notFound()
    const { agreement, rates, advance } = await loadCalcInput(payment.agreementId)
    const bills = new Map<string, Map<number, Amount>>()
    for (const b of await billsOf(paymentId)) {
      if (!bills.has(b.eid)) bills.set(b.eid, new Map())
      bills.get(b.eid)!.set(b.night, b.amount)
    }
    let items
    try {
      items = calculate(agreement, rates, advance, bills)
    } catch (err) {
      if (err instanceof CalcError) throw calcFailure(err)
      throw err
    }
    await appDb().deleteFrom('paymentItems').where('paymentId', '=', uuidBin(paymentId)).execute()
    if (items.length)
      await appDb()
        .insertInto('paymentItems')
        .values(
          items.map((it, n) => ({
            id: uuidBin(uuidv7()),
            paymentId: uuidBin(paymentId),
            sortOrder: n,
            eid: it.eid,
            component: it.component,
            currency: it.currency,
            rate: it.rate,
            count: it.count,
            amount: it.amount,
            basis: it.basis,
          })),
        )
        .execute()
    await appDb().updateTable('payments').set({ calculatedAt: now() }).where('id', '=', uuidBin(paymentId)).execute()
  })
}

const conflict = (code: string, message: string) => new AppError(code, message, { status: 409 })

/** A new payment of an approved agreement, calculated (spec §9). One live payment per agreement. */
export async function createPayment(agreementId: string): Promise<string> {
  const id = uuidv7()
  return inTransaction(async () => {
    // The agreement's row lock serialises two Finance users creating at once.
    const agreement = await appDb()
      .selectFrom('agreements')
      .select(['status', 'branchCode'])
      .where('id', '=', uuidBin(agreementId))
      .forUpdate()
      .executeTakeFirst()
    if (!agreement) throw AppError.notFound()
    if (agreement.status !== 'approved')
      throw conflict('payments.agreement_not_approved', 'Only an approved agreement is paid')
    if (await livePaymentOf(agreementId))
      throw conflict('payments.exists', 'This agreement already has a payment that is not void')
    await appDb()
      .insertInto('payments')
      .values({
        ...createdStamp(id),
        agreementId: uuidBin(agreementId),
        branchCode: agreement.branchCode,
        calculatedAt: now(),
      })
      .execute()
    await recalculate(id)
    await writeHistory(paymentHistory, {
      entityId: id,
      version: 1,
      action: 'create',
      after: {
        agreementId,
        branchCode: agreement.branchCode,
        status: 'calculated',
        bills: '',
        totals: totalsLine(await itemsOf(id)),
      },
    })
    return id
  })
}

export const notCalculated = () =>
  conflict('payments.not_calculated', 'Only a payment in the calculated status can be changed')

/** The payment calculated again (the rates or the agreement's members changed); optimistic locking on `version`. */
export async function recalculatePayment(id: string, version: number): Promise<void> {
  await inTransaction(async () => {
    const before = await findPayment(id)
    if (!before) throw AppError.notFound()
    if (before.status !== 'calculated') throw notCalculated()
    const beforeItems = await itemsOf(id)
    const next = await updateVersioned('payments', id, version, {}, { softDelete: false })
    await recalculate(id)
    await writeHistory(paymentHistory, {
      entityId: id,
      version: next,
      action: 'update',
      before: { totals: totalsLine(beforeItems) },
      after: { totals: totalsLine(await itemsOf(id)) },
    })
  })
}

/** Nights each member takes a bill for, by EID (members without such nights left out). */
export function billedNightsOf(row: PaymentRow, members: MemberRow[]): Map<string, number[]> {
  const out = new Map<string, number[]>()
  for (const m of members) {
    const nights = billedNights(row, toCalcMember(m))
    if (nights.length) out.set(m.eid, nights)
  }
  return out
}

/**
 * Finance's bills for nights from day 8 replace the stored ones, then the payment is calculated again. Every bill
 * must be for a night that takes one (422 `payments.night_invalid` at `bills.<n>.night`).
 */
export async function saveBills(id: string, version: number, bills: Bill[]): Promise<void> {
  await inTransaction(async () => {
    const before = await findPayment(id)
    if (!before) throw AppError.notFound()
    if (before.status !== 'calculated') throw notCalculated()
    const nights = billedNightsOf(before, await membersOf(before.agreementId))
    const errors: FieldError[] = []
    const seen = new Set<string>()
    bills.forEach((b, n) => {
      const key = `${b.eid}:${b.night}`
      if (!nights.get(b.eid)?.includes(b.night) || seen.has(key))
        errors.push({
          path: `bills.${n}.night`,
          code: 'payments.night_invalid',
          message: 'Not a night from day 8 of this member, or given twice',
        })
      seen.add(key)
    })
    if (errors.length)
      throw new AppError('payments.night_invalid', 'A bill is for a night that takes no bill', {
        status: 422,
        details: errors,
      })
    const beforeBills = await billsOf(id)
    const beforeItems = await itemsOf(id)
    const next = await updateVersioned('payments', id, version, {}, { softDelete: false })
    await appDb().deleteFrom('paymentBills').where('paymentId', '=', uuidBin(id)).execute()
    if (bills.length)
      await appDb()
        .insertInto('paymentBills')
        .values(bills.map((b) => ({ paymentId: uuidBin(id), eid: b.eid, night: b.night, amount: b.amount })))
        .execute()
    await recalculate(id)
    await writeHistory(paymentHistory, {
      entityId: id,
      version: next,
      action: 'update',
      before: { bills: billsLine(beforeBills), totals: totalsLine(beforeItems) },
      after: { bills: billsLine(await billsOf(id)), totals: totalsLine(await itemsOf(id)) },
    })
  })
}

// Presentation

const displayDocNo = (stored: string, lang: string) => {
  const d = parseDocNo(stored)
  return d ? formatDocNo(d, lang === 'lo' ? 'lo' : 'en') : stored
}

export function toListItem(row: PaymentRow, lang: string) {
  const { policyOption: _p, ...rest } = row
  return {
    ...rest,
    docNo: displayDocNo(row.docNo, lang),
    calculatedAt: toIso(row.calculatedAt),
    submittedAt: toIso(row.submittedAt),
    exportedAt: toIso(row.exportedAt),
    postedAt: toIso(row.postedAt),
    cancelledAt: toIso(row.cancelledAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

/** The checking table: the header, each member with their items, day-8 flags, totals per currency and the bills. */
export async function loadPayment(id: string, lang: string) {
  const row = await findPayment(id)
  if (!row) throw AppError.notFound()
  const [members, items, bills] = await Promise.all([membersOf(row.agreementId), itemsOf(id), billsOf(id)])
  const flags = [...billedNightsOf(row, members)].map(([eid, billedNights]) => ({ eid, billedNights }))
  return {
    ...toListItem(row, lang),
    members: members.map((m) => ({
      eid: m.eid,
      nameLao: m.nameLao,
      snameLao: m.snameLao,
      nameEng: m.nameEng,
      snameEng: m.snameEng,
      branchCode: m.branchCode,
      rankCode: m.rankCode,
      accountLak: m.accountLak,
      accountUsd: m.accountUsd,
      departureDate: m.departureDate,
      returnDate: m.returnDate,
      paidDays: Math.max(daysInclusive(m.departureDate, m.returnDate) - m.daysSubtracted, 0),
      hostMeals: m.hostMeals,
      privateCarKm: m.privateCarKm,
      isLeader: m.isLeader,
      isAdvanceHolder: m.isAdvanceHolder,
      items: items
        .filter((it) => it.eid === m.eid)
        .map(({ sortOrder: _s, eid: _e, ...it }) => ({ ...it, component: it.component as Component })),
    })),
    flags,
    totals: totalsOf(items),
    bills,
  }
}
