import { daysInclusive } from '../../shared/dates.ts'
import { formatDocNo, parseDocNo } from '../agreements/doc-no.ts'
import type { AgreementRow, MemberRow } from '../agreements/queries.ts'
import type { LineRow, SettlementRow } from '../settlements/queries.ts'
import type { Totals } from '../settlements/totals.ts'
import type { CaseKind, ExpenseType } from '../settlements/types.ts'
import { groupAmount } from '../travel-master/money.ts'
import { CANCELLED, DRAFT, type Block, type PrintModel } from './pdf.ts'
import { dmy, type Signers } from './signers.ts'

/** The four cases of the "Advance Status" line, in the sheet's order. */
const CASES: [CaseKind, string][] = [
  ['unused', '1. ບໍ່ໄດ້ນຳໃຊ້ເງິນແຮ (Unused)'],
  ['partly_used', '2. ນຳໃຊ້ບາງສ່ວນ (Partly used)'],
  ['fully_used', '3. ນຳໃຊ້ໝົດ (Fully used)'],
  ['overspent', '4. ນຳໃຊ້ເກີນ (Overspent)'],
]

const EXPENSE: Record<ExpenseType, string> = { fuel: 'ຄ່ານ້ຳມັນ / Fuel', fare: 'ຄ່າເດີນທາງ / Fare' }

const docNoLo = (stored: string) => {
  const d = parseDocNo(stored)
  return d ? formatDocNo(d, 'lo') : stored
}

/** A line's description as printed: its expense type (forms 5) and, without a receipt, the reason. */
function describe(l: LineRow): string {
  let text = l.description
  if (l.expenseType) text += ` (${EXPENSE[l.expenseType]})`
  if (!l.receiptFileId && l.noReceiptReason) text += ` — ບໍ່ມີໃບບິນ (no receipt): ${l.noReceiptReason}`
  return text
}

/**
 * Forms 5–6 as on the paper sheets `5.ເງິນແຮພາຍໃນ` (domestic and border) and `6.ເງິນແຮຕ່າງປະເທດ` (overseas): the case,
 * the trip, the lines with their totals, and the five signatures of the approval chain (ກ19). Pure.
 */
export function settlementPrintModel(input: {
  settlement: SettlementRow
  lines: LineRow[]
  totals: Totals
  agreement: AgreementRow
  members: MemberRow[]
  place: string
  signers: Signers
  today: string
}): PrintModel {
  const { settlement: s, lines, totals, agreement: a, members, place, signers } = input
  const overseas = s.zoneKind === 'overseas'
  const holder = members.find((m) => m.eid === s.holderEid)
  const holderName = holder ? `${holder.nameLao} ${holder.snameLao}` : s.holderEid
  const money = (amount: string) => groupAmount(amount)
  const blocks: Block[] = [
    {
      kind: 'checks',
      label: 'ປະເພດການສົ່ງເງິນແຮ (Advance Status):',
      options: CASES.map(([key, text]) => ({ text, checked: s.caseKind === key })),
    },
    {
      kind: 'fields',
      rows: [
        ['ຂໍ້ຕົກລົງ / ແຈ້ງການ ເລກທີ (Doc No.):', `${docNoLo(a.docNo)} · REF ${a.ref}`],
        [
          'ຊື່ ແລະ ນາມສະກຸນ ຜູ້ຮັບເງິນແຮ (Advance Holder):',
          overseas && holder?.departmentName ? `${holderName} · ພະແນກ: ${holder.departmentName}` : holderName,
        ],
        ['ການເດີນທາງໄປ (ແຂວງ)', place],
        [
          'ວັນທີເດີນທາງ (Travel Period):',
          `ຈາກວັນທີ (From): ${dmy(a.travelFrom)}   ຫາວັນທີ (To): ${dmy(a.travelTo)}   ຈຳນວນ ${daysInclusive(a.travelFrom, a.travelTo)} ວັນ`,
        ],
        ['ຈຳນວນເງິນແຮທີ່ໄດ້ຮັບ (Advance Amount Received):', `${money(s.advance)} ${s.currency}`],
      ],
    },
    overseas
      ? {
          kind: 'table',
          columns: [
            { header: 'ລຳດັບ\nNo.', width: 40 },
            { header: 'ລາຍການຄ່າໃຊ້ຈ່າຍ\nExpense Description', width: 225 },
            { header: 'ຈຳນວນເງິນ\nAmount', width: 95, align: 'right' },
            { header: 'Cross Rate', width: 70, align: 'right' },
            { header: `ຈຳນວນເງິນ (${s.currency})\nAmount`, width: 85, align: 'right' },
          ],
          rows: lines.map((l, i) => [
            String(i + 1),
            describe(l),
            `${money(l.amount)} ${l.currency}`,
            l.crossRate ?? '',
            money(l.settledAmount),
          ]),
          footer: [
            ['', 'ລວມຄ່າໃຊ້ຈ່າຍທັງໝົດ (Total Expenses)', '', '', money(totals.total)],
            ['', 'ເງິນແຮທີ່ຍັງເຫຼືອ / ຕ້ອງມອບຄືນ (Remaining / Balance Due)', '', '', money(totals.remaining)],
          ],
        }
      : {
          kind: 'table',
          columns: [
            { header: 'ລຳດັບ\nNo.', width: 40 },
            { header: 'ລາຍການຄ່າໃຊ້ຈ່າຍ\nExpense Description', width: 325 },
            { header: `ຈຳນວນເງິນ (${s.currency})\nAmount (${s.currency})`, width: 150, align: 'right' },
          ],
          rows: lines.map((l, i) => [String(i + 1), describe(l), money(l.settledAmount)]),
          footer: [
            ['', 'ລວມຄ່າໃຊ້ຈ່າຍທັງໝົດ (Total Expenses)', money(totals.total)],
            ['', 'ເງິນແຮທີ່ຍັງເຫຼືອ / ຕ້ອງມອບຄືນ (Remaining / Balance Due)', money(totals.remaining)],
          ],
        },
  ]
  if (s.lateReason) blocks.push({ kind: 'note', text: `ໝາຍເຫດ (Note): ສົ່ງຊ້າ (late): ${s.lateReason}` })
  blocks.push({
    kind: 'checks',
    label: 'ເອກະສານແນບ (Attach File):',
    options: [
      { text: 'ຂໍ້ຕົກລົງ', checked: false },
      { text: 'ໃບບິນ', checked: lines.some((l) => l.receiptFileId) },
    ],
  })
  // Step 2 is skipped (no leader EID) when the filer is the only leader: the group's box is then the filer's.
  // Otherwise it stays empty until the leader or deputy approves.
  const group = s.leaderEid ? signers.steps.leader : signers.submittedBy
  const box = (role: string, signer: { name: string; date: string } | null | undefined) => ({
    role,
    name: signer?.name ?? '',
    date: signer?.date ?? '',
  })
  blocks.push({
    kind: 'signatures',
    boxes: [
      box('ຄະນະເດີນທາງ', group),
      box('ຜູ້ສະຫຼຸບ', signers.submittedBy),
      box('ພະແນກຫ້ອງການບໍລິຫານ-ການເງິນ', signers.steps.final),
      box('ຂະແໜງການເງິນ', signers.steps.finance_section_head),
      box('ຜູ້ກວດສອບ', signers.steps.finance_officer),
    ],
  })
  const mark =
    s.status === 'void' || s.status === 'cancelled_after_export'
      ? CANCELLED
      : s.status === 'draft' || s.status === 'in_approval'
        ? DRAFT
        : null
  return { title: 'ໃບສະຫຼຸບເງິນແຮເດີນທາງ', mark, date: dmy(input.today), blocks }
}
