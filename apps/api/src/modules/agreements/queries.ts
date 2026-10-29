import { AppError, uuidv7, type FieldError } from '@elvine-sk/platform-core'
import { createdStamp, fromJson, inTransaction, sql, updateVersioned, uuidBin, writeHistory } from '@elvine-sk/platform-db'
import { toIso } from '@elvine-sk/platform-server'
import { activeAccount } from '../hrm/accounts.ts'
import { findEmployee } from '../hrm/employees.ts'
import { findDistrict, findProvince } from '../hrm/geography.ts'
import { findPosition } from '../hrm/positions.ts'
import { countryByIso2, rankForPostType } from '../travel-master/lookups.ts'
import { daysInclusive, yearOf } from '../../shared/dates.ts'
import { appDb, type AgreementMembersTable, type AgreementsTable } from '../../shared/db.ts'
import { formatDocNo, parseDocNo, parseRef, type DocNo } from './doc-no.ts'
import { agreementHistory, nextRef } from './procedures.ts'
import type { AgreementInput, MemberInput } from './schema.ts'

const AGREEMENT_COLUMNS = [
  'a.id',
  'a.ref',
  'a.formType',
  'a.status',
  'a.subject',
  'a.title',
  'a.reference',
  'a.docNo',
  'a.docDate',
  'a.branchCode',
  'a.travelFrom',
  'a.travelTo',
  'a.fromProvinceCode',
  'a.toProvinceCode',
  'a.provinceCode',
  'a.fromDistrictCode',
  'a.toDistrictCode',
  'a.overnight',
  'a.sameDayOver50km',
  'a.countryIso2',
  'a.zoneCode',
  'a.borderRouteId',
  'a.borderRouteOther',
  'a.policyOption',
  'a.hasAdvance',
  'a.submittedAt',
  'a.cancelReason',
  'a.cancelledAt',
  'a.createdBy',
  'a.createdAt',
  'a.updatedAt',
  'a.version',
] as const

export type AgreementRow = Omit<AgreementsTable, 'status' | 'docNoLive' | 'version' | 'updatedBy' | 'cancelledBy'> & {
  status: 'draft' | 'in_approval' | 'approved' | 'cancelled'
  version: number
}
export type MemberRow = AgreementMembersTable

/** Agreements as lists read them (`a`), before scope. */
export const agreementRows = () => appDb().selectFrom('agreements as a').select(AGREEMENT_COLUMNS)

export async function findAgreement(id: string): Promise<AgreementRow | null> {
  const row = await agreementRows().where('a.id', '=', uuidBin(id)).executeTakeFirst()
  return (row as AgreementRow | undefined) ?? null
}

export async function membersOf(id: string): Promise<MemberRow[]> {
  return appDb()
    .selectFrom('agreementMembers')
    .selectAll()
    .where('agreementId', '=', uuidBin(id))
    .orderBy('sortOrder')
    .execute()
}

/** The agreement and its members, or 404. */
export async function loadAgreement(id: string) {
  const row = await findAgreement(id)
  if (!row) throw AppError.notFound()
  return { row, members: await membersOf(id) }
}

const displayDocNo = (stored: string, lang: string) => {
  const d = parseDocNo(stored)
  return d ? formatDocNo(d, lang === 'lo' ? 'lo' : 'en') : stored
}

export function toListItem(row: AgreementRow, lang: string) {
  return {
    ...row,
    docNo: displayDocNo(row.docNo, lang),
    submittedAt: toIso(row.submittedAt),
    cancelledAt: toIso(row.cancelledAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

export function toAgreement(row: AgreementRow, members: MemberRow[], lang: string) {
  return {
    ...toListItem(row, lang),
    members: members.map(({ agreementId: _a, sortOrder: _s, ...m }) => {
      const calculatedDays = daysInclusive(m.departureDate, m.returnDate)
      return { ...m, calculatedDays, paidDays: calculatedDays - m.daysSubtracted }
    }),
  }
}

// Validation and the HRM snapshot

const invalid = (path: string, code: string, message: string): FieldError => ({ path, code, message })

type Snapshot = Omit<MemberRow, 'id' | 'agreementId' | 'sortOrder'>

/** A member row filled from HRM (spec §5): names, organisation, position, rank and accounts. */
async function snapshotMember(m: MemberInput, from: string, to: string, n: number, errors: FieldError[]) {
  const at = (field: string) => `members.${n}.${field}`
  const employee = await findEmployee(m.eid)
  if (!employee) {
    errors.push(invalid(at('eid'), 'agreements.member_not_found', 'This EID is not a selectable HRM employee'))
    return null
  }
  const acting = m.actingPositionCode ? await findPosition(m.actingPositionCode) : null
  if (m.actingPositionCode && !acting)
    errors.push(invalid(at('actingPositionCode'), 'agreements.unknown_position', 'This HRM position does not exist'))
  const postType = acting ? acting.postType : employee.postType
  const [lak, usd] = await Promise.all([activeAccount(m.eid, 'LAK'), activeAccount(m.eid, 'USD')])
  const snapshot: Snapshot = {
    eid: m.eid,
    departureDate: m.departureDate ?? from,
    returnDate: m.returnDate ?? to,
    daysSubtracted: m.daysSubtracted,
    isLeader: m.isLeader,
    isDeputy: m.isDeputy,
    isAdvanceHolder: m.isAdvanceHolder,
    hostMeals: m.hostMeals,
    privateCarKm: m.privateCarKm,
    actingPositionCode: acting ? acting.code : null,
    nameLao: employee.nameLao,
    snameLao: employee.snameLao,
    nameEng: employee.nameEng,
    snameEng: employee.snameEng,
    branchCode: employee.branchCode,
    departmentName: employee.departmentName,
    sectionName: employee.sectionName,
    positionCode: employee.positionCode,
    positionName: employee.positionName,
    postType: employee.postType,
    actingPositionName: acting?.name ?? null,
    rankCode: postType === null ? null : await rankForPostType(postType),
    accountLak: lak?.accountNo ?? null,
    accountUsd: usd?.accountNo ?? null,
  }
  return snapshot
}

function checkMemberDates(s: Snapshot, from: string, to: string, n: number, errors: FieldError[]) {
  const at = (field: string) => `members.${n}.${field}`
  if (s.returnDate < s.departureDate) {
    errors.push(invalid(at('returnDate'), 'agreements.dates_invalid', 'Return is before departure'))
    return
  }
  if (s.departureDate < from)
    errors.push(invalid(at('departureDate'), 'agreements.dates_invalid', 'Departure is before the travel dates'))
  if (s.returnDate > to)
    errors.push(invalid(at('returnDate'), 'agreements.dates_invalid', 'Return is after the travel dates'))
  const days = daysInclusive(s.departureDate, s.returnDate)
  if (s.daysSubtracted > days)
    errors.push(invalid(at('daysSubtracted'), 'agreements.days_invalid', `At most ${days} days can be subtracted`))
  if (s.hostMeals > days * 3)
    errors.push(invalid(at('hostMeals'), 'agreements.meals_invalid', `At most ${days * 3} meals in ${days} days`))
}

/** Form-specific header fields, normalised: every column of the other forms is `null`. */
function placeColumns(input: AgreementInput) {
  const none = {
    fromProvinceCode: null as string | null,
    toProvinceCode: null as string | null,
    provinceCode: null as string | null,
    fromDistrictCode: null as string | null,
    toDistrictCode: null as string | null,
    overnight: null as boolean | null,
    sameDayOver50km: null as boolean | null,
    countryIso2: null as string | null,
    borderRouteId: null as string | null,
    borderRouteOther: null as string | null,
  }
  switch (input.formType) {
    case 'domestic':
      return { ...none, fromProvinceCode: input.fromProvinceCode, toProvinceCode: input.toProvinceCode }
    case 'district':
      return {
        ...none,
        provinceCode: input.provinceCode,
        fromDistrictCode: input.fromDistrictCode,
        toDistrictCode: input.toDistrictCode,
        overnight: input.overnight,
        sameDayOver50km: input.overnight ? null : input.sameDayOver50km,
      }
    case 'overseas':
      return { ...none, countryIso2: input.countryIso2 }
    case 'border':
      return {
        ...none,
        fromProvinceCode: input.fromProvinceCode,
        borderRouteId: input.borderRouteId,
        borderRouteOther: input.borderRouteId ? null : input.borderRouteOther,
      }
  }
}

async function checkPlaces(input: AgreementInput, errors: FieldError[]) {
  const unknown = (path: string) => errors.push(invalid(path, 'agreements.unknown_place', 'Not a known place'))
  const province = async (path: string, code: string) => {
    if (!(await findProvince(code))) unknown(path)
  }
  switch (input.formType) {
    case 'domestic':
      await province('fromProvinceCode', input.fromProvinceCode)
      await province('toProvinceCode', input.toProvinceCode)
      if (input.fromProvinceCode === input.toProvinceCode)
        errors.push(invalid('toProvinceCode', 'agreements.same_place', 'Choose two different provinces'))
      return
    case 'district':
      if (!(await findProvince(input.provinceCode))) return unknown('provinceCode')
      if (!(await findDistrict(input.provinceCode, input.fromDistrictCode))) unknown('fromDistrictCode')
      if (!(await findDistrict(input.provinceCode, input.toDistrictCode))) unknown('toDistrictCode')
      if (input.fromDistrictCode === input.toDistrictCode)
        errors.push(invalid('toDistrictCode', 'agreements.same_place', 'Choose two different districts'))
      if (!input.overnight) {
        if (input.travelFrom !== input.travelTo)
          errors.push(invalid('travelTo', 'agreements.same_day', 'A trip without an overnight stay is one day'))
        if (input.sameDayOver50km === null)
          errors.push(invalid('sameDayOver50km', 'agreements.required', 'Say whether the trip is 50 km or more'))
      }
      return
    case 'overseas':
      if (!(await countryByIso2(input.countryIso2))) unknown('countryIso2')
      return
    case 'border':
      await province('fromProvinceCode', input.fromProvinceCode)
      if (input.borderRouteId && input.borderRouteOther)
        errors.push(invalid('borderRouteId', 'agreements.route_twice', 'Choose a route or type one, not both'))
      else if (!input.borderRouteId && !input.borderRouteOther)
        errors.push(invalid('borderRouteOther', 'agreements.required', 'Choose a route or type one'))
      else if (input.borderRouteId) {
        const route = await appDb()
          .selectFrom('travelBorderRoutes')
          .select('id')
          .where('id', '=', uuidBin(input.borderRouteId))
          .where('active', '=', true)
          .executeTakeFirst()
        if (!route) unknown('borderRouteId')
      }
  }
}

/** The Doc.no as typed, or a 422 on `docNo`. */
export function docNoOf(input: { docNo: string }): DocNo {
  const d = parseDocNo(input.docNo)
  if (!d)
    throw AppError.validation([
      invalid('docNo', 'agreements.doc_no_invalid', 'Doc.no reads NNNN.BCEL.<branch>.YYYY (or ທຄຕລ, or with /)'),
    ])
  return d
}

/** Every check of a draft (spec §8), and the member rows to store. Throws 422 with all field errors at once. */
export async function checkDraft(input: AgreementInput, docNo: DocNo): Promise<Snapshot[]> {
  const errors: FieldError[] = []
  if (docNo.year !== yearOf(input.docDate))
    errors.push(invalid('docNo', 'agreements.doc_no_year', 'The Doc.no year is the year of the document date'))
  if (input.travelTo < input.travelFrom)
    errors.push(invalid('travelTo', 'agreements.dates_invalid', 'Return is before departure'))
  await checkPlaces(input, errors)

  const seen = new Set<string>()
  const members: Snapshot[] = []
  for (const [n, m] of input.members.entries()) {
    if (seen.has(m.eid)) {
      errors.push(invalid(`members.${n}.eid`, 'agreements.member_twice', 'This EID is already a member'))
      continue
    }
    seen.add(m.eid)
    const s = await snapshotMember(m, input.travelFrom, input.travelTo, n, errors)
    if (!s) continue
    checkMemberDates(s, input.travelFrom, input.travelTo, n, errors)
    members.push(s)
  }
  const flagged = (flag: 'isLeader' | 'isAdvanceHolder') => input.members.flatMap((m, n) => (m[flag] ? [n] : []))
  for (const n of flagged('isLeader').slice(1))
    errors.push(invalid(`members.${n}.isLeader`, 'agreements.one_leader', 'An agreement has one team leader'))
  const holders = flagged('isAdvanceHolder')
  if (!input.hasAdvance)
    for (const n of holders)
      errors.push(invalid(`members.${n}.isAdvanceHolder`, 'agreements.no_advance', 'This agreement has no advance'))
  else
    for (const n of holders.slice(1))
      errors.push(invalid(`members.${n}.isAdvanceHolder`, 'agreements.one_holder', 'The advance has one holder'))
  if (errors.length) throw AppError.validation(errors)
  return members
}

async function refuseTakenDocNo(docNo: string, selfId: string | null) {
  let qb = appDb().selectFrom('agreements').select('id').where('docNoLive', '=', docNo)
  if (selfId) qb = qb.where('id', '<>', uuidBin(selfId))
  if (await qb.executeTakeFirst())
    throw new AppError('agreements.doc_no_taken', 'Another agreement that is not cancelled has this Doc.no', {
      status: 409,
    })
}

async function writeMembers(agreementId: string, members: Snapshot[]) {
  await appDb().deleteFrom('agreementMembers').where('agreementId', '=', uuidBin(agreementId)).execute()
  await appDb()
    .insertInto('agreementMembers')
    .values(
      members.map((m, n) => ({ ...m, id: uuidBin(uuidv7()), agreementId: uuidBin(agreementId), sortOrder: n })),
    )
    .execute()
}

const historyOf = (input: AgreementInput, docNo: string, branchCode: string, members: Snapshot[]) => ({
  ...input,
  ...placeColumns(input),
  docNo,
  branchCode,
  members: members.map((m) => [m.eid, m.isLeader, m.isDeputy, m.isAdvanceHolder].join(':')).join(', '),
})

const headerColumns = (input: AgreementInput, docNo: string, branchCode: string) => ({
  formType: input.formType,
  subject: input.subject,
  title: input.title,
  reference: input.reference,
  docNo,
  docDate: input.docDate,
  branchCode,
  travelFrom: input.travelFrom,
  travelTo: input.travelTo,
  policyOption: input.policyOption,
  hasAdvance: input.hasAdvance,
  ...withRouteBin(placeColumns(input)),
})

const withRouteBin = (p: ReturnType<typeof placeColumns>) => ({
  ...p,
  borderRouteId: p.borderRouteId ? uuidBin(p.borderRouteId) : null,
})

/** A new draft with its REF. `docNo` is the parsed Doc.no, whose branch is the agreement's. */
export async function createDraft(input: AgreementInput, docNo: DocNo) {
  const members = await checkDraft(input, docNo)
  const stored = formatDocNo(docNo)
  const id = uuidv7()
  return inTransaction(async () => {
    await refuseTakenDocNo(stored, null)
    const ref = await nextRef()
    await appDb()
      .insertInto('agreements')
      .values({ ...createdStamp(id), ref, ...headerColumns(input, stored, docNo.branch) })
      .execute()
    await writeMembers(id, members)
    await writeHistory(agreementHistory, {
      entityId: id,
      version: 1,
      action: 'create',
      after: { ref, ...historyOf(input, stored, docNo.branch, members) },
    })
    return loadAgreement(id)
  })
}

const notDraft = () =>
  new AppError('agreements.not_draft', 'Only a draft agreement can be changed', { status: 409 })

/** The whole draft replaced, members included (optimistic locking on `version`). */
export async function updateDraft(id: string, version: number, input: AgreementInput, docNo: DocNo) {
  const members = await checkDraft(input, docNo)
  const stored = formatDocNo(docNo)
  return inTransaction(async () => {
    const before = await loadAgreement(id)
    if (before.row.status !== 'draft') throw notDraft()
    await refuseTakenDocNo(stored, id)
    const next = await updateVersioned('agreements', id, version, headerColumns(input, stored, docNo.branch), {
      softDelete: false,
    })
    await writeMembers(id, members)
    await writeHistory(agreementHistory, {
      entityId: id,
      version: next,
      action: 'update',
      before: {
        ...before.row,
        members: before.members.map((m) => [m.eid, m.isLeader, m.isDeputy, m.isAdvanceHolder].join(':')).join(', '),
      },
      after: historyOf(input, stored, docNo.branch, members),
    })
    return loadAgreement(id)
  })
}

export { notDraft }

/** An agreement by REF or by any spelling of its Doc.no: the live one, else the latest cancelled one. */
export async function findByNumber(number: string): Promise<AgreementRow | null> {
  const ref = parseRef(number)
  if (ref) return ((await agreementRows().where('a.ref', '=', ref).executeTakeFirst()) as AgreementRow) ?? null
  const d = parseDocNo(number)
  if (!d) return null
  const row = await agreementRows()
    .where('a.docNo', '=', formatDocNo(d))
    .orderBy(sql`a.doc_no_live IS NULL`) // the live one first
    .orderBy('a.createdAt', 'desc')
    .executeTakeFirst()
  return (row as AgreementRow | undefined) ?? null
}

export async function historyOfAgreement(id: string) {
  const rows = await appDb()
    .selectFrom('recordHistory')
    .select(['id', 'version', 'action', 'changes', 'changedBy', 'changedAt'])
    .where('entityType', '=', agreementHistory.entityType)
    .where('entityId', '=', uuidBin(id))
    .orderBy('changedAt', 'desc')
    .orderBy('id', 'desc')
    .limit(200)
    .execute()
  return rows.map((r) => ({
    ...r,
    action: r.action as 'create' | 'update' | 'delete' | 'restore',
    changes: fromJson<Record<string, [unknown, unknown]>>(r.changes),
    changedAt: toIso(r.changedAt),
  }))
}
