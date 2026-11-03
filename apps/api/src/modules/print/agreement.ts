import { uuidBin } from '@elvine-sk/platform-db'
import { daysInclusive } from '../../shared/dates.ts'
import { appDb } from '../../shared/db.ts'
import { formatDocNo, parseDocNo } from '../agreements/doc-no.ts'
import type { AgreementRow, MemberRow } from '../agreements/queries.ts'
import { findDistrict, findProvince } from '../hrm/geography.ts'
import { countryByIso2, zoneOf, type ZoneCode } from '../travel-master/lookups.ts'
import { CANCELLED, DRAFT, type Block, type PrintModel } from './pdf.ts'
import { dmy, type Signers } from './signers.ts'

/** The policy options as the paper form names them (spec §8, sheet "Policy Details"). */
const POLICY: Record<AgreementRow['policyOption'], string> = {
  bcel_all: 'ທຄຕລ ຮັບຜິດຊອບທັງໝົດ (BCEL pays everything)',
  host_travel: 'ເຈົ້າພາບຮັບຜິດຊອບການເດີນທາງ (Host pays travel)',
  host_accommodation: 'ເຈົ້າພາບຮັບຜິດຊອບທີ່ພັກ (Host pays accommodation)',
  host_meals: 'ເຈົ້າພາບຮັບຜິດຊອບອາຫານ (Host pays meals)',
  host_meals_accommodation: 'ເຈົ້າພາບຮັບຜິດຊອບອາຫານ ແລະ ທີ່ພັກ (Host pays meals and accommodation)',
}

/** The trip kind ticked in the Subject line of each sheet. */
const KIND: Record<AgreementRow['formType'], string> = {
  domestic: 'ພາຍໃນປະເທດ',
  district: 'ພາຍໃນປະເທດ',
  overseas: 'ຕ່າງປະເທດ / Overseas',
  border: 'ເຂດຊາຍແດນ / Border',
}

/**
 * Where the trip goes, as the sheets show it: form 1 "from province - to province", form 2 "province (from district
 * - to district)", form 3 "country (zone)", form 4 the border route.
 */
export async function printPlace(row: AgreementRow): Promise<string> {
  const province = async (code: string | null) => (code ? ((await findProvince(code))?.nameLo ?? code) : '')
  switch (row.formType) {
    case 'domestic':
      return `${await province(row.fromProvinceCode)} - ${await province(row.toProvinceCode)}`
    case 'district': {
      const p = row.provinceCode ?? ''
      const district = async (code: string | null) => (code ? ((await findDistrict(p, code))?.nameLo ?? code) : '')
      return `${await province(p)} (${await district(row.fromDistrictCode)} - ${await district(row.toDistrictCode)})`
    }
    case 'overseas': {
      const country = await countryByIso2(row.countryIso2 ?? '')
      if (!country) return row.countryIso2 ?? ''
      return `${country.nameLo} (${(await zoneOf(country.zoneCode as ZoneCode)).nameLo})`
    }
    case 'border': {
      if (!row.borderRouteId) return row.borderRouteOther ?? ''
      const route = await appDb()
        .selectFrom('travelBorderRoutes')
        .select('nameLo')
        .where('id', '=', uuidBin(row.borderRouteId))
        .executeTakeFirst()
      return route?.nameLo ?? ''
    }
  }
}

const docNoLo = (stored: string) => {
  const d = parseDocNo(stored)
  return d ? formatDocNo(d, 'lo') : stored
}

/**
 * Forms 1–4 as on the paper sheets of `3. Format form HRM.xlsx` (`1.ພາຍໃນ update`, `2.ເມືອງ update`, `3.ຕ່າງປະເທດ`,
 * `4.ຊາຍແດນ`): header fields, members, attachments and the three signatures. Pure.
 */
export function agreementPrintModel(input: {
  agreement: AgreementRow
  members: MemberRow[]
  place: string
  signers: Signers
  today: string
}): PrintModel {
  const { agreement: a, members, place, signers } = input
  const overseas = a.formType === 'overseas'
  const days = daysInclusive(a.travelFrom, a.travelTo)
  const blocks: Block[] = [
    {
      kind: 'fields',
      rows: [
        ['ເລື່ອງ (Subject):', `ການເດີນທາງປະຕິບັດງານ ( ${KIND[a.formType]} ) [${place}]`],
        ['ເລກທີ (Doc No.):', `${docNoLo(a.docNo)} · REF ${a.ref}`],
        ['ວັນທີ (Date):', dmy(a.docDate)],
        ['ອ້າງອີງ (Reference):', a.reference ?? '-'],
        ['ຫົວຂໍ້ (Title):', `${a.subject} · ${a.title}`],
        [
          'ຂໍ້ມູນການເດີນທາງ (Travel Details):',
          `ຈາກວັນທີ (From): ${dmy(a.travelFrom)}   ຫາວັນທີ (To): ${dmy(a.travelTo)}   ຈຳນວນ ${days} ວັນ`,
        ],
        ['ຂໍ້ມູນນະໂຍບາຍ (Policy Details):', POLICY[a.policyOption]],
        ['ຂໍ້ມູນພະນັກງານ (Employee Information):', `ຈຳນວນ ${members.length} ຄົນ`],
      ],
    },
    {
      kind: 'table',
      // 8 pt and these widths (515 pt in all) keep a date, a 13-digit account and an EID on one line each.
      size: 8,
      columns: [
        { header: 'ລຳດັບ\nNo.', width: 24 },
        { header: 'ລະຫັດ\nUser ID', width: 34 },
        { header: 'ຊື່ ແລະ ນາມສະກຸນ\nFull Name', width: overseas ? 110 : 55 },
        { header: 'ຕຳແໜ່ງງານ\nPosition', width: overseas ? 85 : 50 },
        { header: 'ພາກສ່ວນ\nDepartment', width: overseas ? 87 : 57 },
        { header: 'Code Rank', width: 30 },
        { header: 'Account Number', width: 84 },
        ...(overseas
          ? []
          : [
              { header: 'ວັນທີ\nເດີນທາງໄປ', width: 54 },
              { header: 'ວັນທີ\nເດີນທາງກັບ', width: 54 },
              { header: 'ຈຳນວນ\nວັນ', width: 30, align: 'right' as const },
            ]),
        { header: 'Advance Holder', width: overseas ? 61 : 43 },
      ],
      rows: members.map((m, i) => [
        String(i + 1),
        m.eid,
        `${m.nameLao} ${m.snameLao}`,
        m.actingPositionName ? `${m.actingPositionName} (ວ່າການ)` : (m.positionName ?? ''),
        m.departmentName ?? '',
        m.rankCode ?? '',
        (overseas ? m.accountUsd : m.accountLak) ?? '',
        ...(overseas
          ? []
          : [dmy(m.departureDate), dmy(m.returnDate), String(daysInclusive(m.departureDate, m.returnDate) - m.daysSubtracted)]),
        m.isAdvanceHolder ? 'Advance Holder' : '',
      ]),
    },
    {
      kind: 'checks',
      label: 'ເອກະສານແນບ (Attach File):',
      // A signed copy is required to submit (spec §8); the app does not record which kind of paper it is.
      options: [
        { text: 'ຂໍ້ຕົກລົງ', checked: true },
        ...(overseas ? [] : [{ text: 'ແຈ້ງການ', checked: false }]),
        { text: 'ອື່ນໆ', checked: false },
      ],
    },
  ]
  const approvedBy = signers.steps.management ?? signers.steps.department_head ?? signers.steps.section_head
  blocks.push({
    kind: 'signatures',
    boxes: [
      { role: 'ຜູ້ອະນຸມັດ (Approved By)', name: approvedBy?.name ?? '', date: approvedBy?.date ?? '' },
      { role: 'ຜູ້ກວດສອບ (Checked By)', name: signers.steps.section_head?.name ?? '', date: signers.steps.section_head?.date ?? '' },
      { role: 'ຜູ້ຄີຂໍ້ມູນ (Prepared By)', name: signers.submittedBy?.name ?? '', date: signers.submittedBy?.date ?? '' },
    ],
  })
  return {
    title: overseas ? 'ຂໍ້ຕົກລົງ' : 'ຂໍ້ຕົກລົງ ຫຼື ແຈ້ງການ',
    mark: a.status === 'cancelled' ? CANCELLED : a.status === 'approved' ? null : DRAFT,
    date: dmy(input.today),
    blocks,
  }
}
