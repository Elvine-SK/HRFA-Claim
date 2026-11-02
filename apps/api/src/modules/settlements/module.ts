import { defineModule, type ModuleContext } from '@elvine-sk/platform-server'
import { settlementApproval, settlementResolvers } from './approval.ts'
import { keepReceipts, settlementFiles } from './files.ts'
import { settlementsMigrations } from './migrations.ts'
import { settlementRoutes } from './routes.ts'
import { settlementFields } from './schema.ts'

const messages = {
  en: {
    'settlements.bad_transition': 'The settlement cannot move to this status from its current one',
    'settlements.no_advance': 'This agreement has no advance to settle',
    'settlements.advance_not_paid': 'The advance is not paid yet: its payment has no upload file',
    'settlements.exists': 'This agreement already has a settlement that is not void',
    'settlements.not_draft': 'Only a draft settlement can be changed',
    'settlements.expense_type_required': 'Choose fuel or fare',
    'settlements.expense_type_not_allowed': 'Overseas lines have no expense type',
    'settlements.cross_rate_required': 'A line in another currency needs its cross rate',
    'settlements.cross_rate_not_allowed': 'A line in the advance currency takes no cross rate',
    'settlements.receipt_required': 'Attach the receipt or say why there is none',
    'settlements.rate_proof_required': 'Attach the proof of the cross rate',
    'settlements.file_unknown': 'Not a file attached to this settlement',
    'settlements.receipt_locked': 'The receipts of a submitted settlement are kept',
    'settlements.case_required': 'Choose the case of the settlement',
    'settlements.case_mismatch': 'The case does not match the totals',
    'settlements.late_reason_required': 'The settlement is late: give the reason',
    'settlements.leader_required': 'Choose the leader or deputy who checks it',
    'settlements.not_leader': 'Not the leader or a deputy of this agreement',
    'settlements.own_eid': 'Step 2 is taken by someone other than you',
    'settlements.leader_no_account': 'This leader or deputy has not signed in to the app yet, so the step cannot reach them',
    'settlements.no_clearing': 'This settlement does not pass through the holding account',
    'settlements.rvs_no_required': "Type CORE's suspense number of the holding entry",
    'settlements.rvs_no_not_allowed': 'This settlement does not pass through the holding account',
    'notify.settlements.approved.title': 'Settlement {ref} is approved',
    'notify.settlements.approved.body': 'It is ready for the upload file.',
    'notify.settlements.returned.title': 'Settlement {ref} came back to you',
    'notify.settlements.returned.body': 'Correct it and submit it again.',
  },
  lo: {
    'settlements.bad_transition': 'ການສະສາງບໍ່ສາມາດປ່ຽນໄປເປັນສະຖານະນີ້ຈາກສະຖານະປັດຈຸບັນໄດ້',
    'settlements.no_advance': 'ສັນຍານີ້ບໍ່ມີເງິນແຮທີ່ຕ້ອງສະສາງ',
    'settlements.advance_not_paid': 'ເງິນແຮຍັງບໍ່ໄດ້ຈ່າຍ: ການຈ່າຍເງິນຍັງບໍ່ມີໄຟລ໌ອັບໂຫຼດ',
    'settlements.exists': 'ສັນຍານີ້ມີການສະສາງທີ່ຍັງບໍ່ຖືກຍົກເລີກແລ້ວ',
    'settlements.not_draft': 'ແກ້ໄຂໄດ້ສະເພາະການສະສາງທີ່ເປັນສະບັບຮ່າງ',
    'settlements.expense_type_required': 'ກະລຸນາເລືອກ ຄ່ານ້ຳມັນ ຫຼື ຄ່າໂດຍສານ',
    'settlements.expense_type_not_allowed': 'ລາຍການຕ່າງປະເທດບໍ່ມີປະເພດລາຍຈ່າຍ',
    'settlements.cross_rate_required': 'ລາຍການໃນສະກຸນເງິນອື່ນ ຕ້ອງມີອັດຕາແລກປ່ຽນ',
    'settlements.cross_rate_not_allowed': 'ລາຍການໃນສະກຸນເງິນແຮ ບໍ່ຕ້ອງມີອັດຕາແລກປ່ຽນ',
    'settlements.receipt_required': 'ກະລຸນາແນບໃບບິນ ຫຼື ບອກເຫດຜົນທີ່ບໍ່ມີ',
    'settlements.rate_proof_required': 'ກະລຸນາແນບຫຼັກຖານອັດຕາແລກປ່ຽນ',
    'settlements.file_unknown': 'ບໍ່ແມ່ນໄຟລ໌ທີ່ແນບກັບການສະສາງນີ້',
    'settlements.receipt_locked': 'ໃບບິນຂອງການສະສາງທີ່ສົ່ງແລ້ວ ຕ້ອງເກັບໄວ້',
    'settlements.case_required': 'ກະລຸນາເລືອກກໍລະນີຂອງການສະສາງ',
    'settlements.case_mismatch': 'ກໍລະນີທີ່ເລືອກ ບໍ່ກົງກັບຍອດລວມ',
    'settlements.late_reason_required': 'ການສະສາງຊ້າກວ່າກຳນົດ: ກະລຸນາບອກເຫດຜົນ',
    'settlements.leader_required': 'ກະລຸນາເລືອກຫົວໜ້າຄະນະ ຫຼື ຮອງຫົວໜ້າ ທີ່ກວດກາ',
    'settlements.not_leader': 'ບໍ່ແມ່ນຫົວໜ້າ ຫຼື ຮອງຫົວໜ້າຄະນະຂອງສັນຍານີ້',
    'settlements.own_eid': 'ຂັ້ນຕອນທີ 2 ຕ້ອງແມ່ນຄົນອື່ນ ບໍ່ແມ່ນທ່ານ',
    'settlements.leader_no_account': 'ຫົວໜ້າ ຫຼື ຮອງຫົວໜ້າຄົນນີ້ ຍັງບໍ່ເຄີຍເຂົ້າລະບົບ, ຂັ້ນຕອນນີ້ຈຶ່ງສົ່ງຫາບໍ່ໄດ້',
    'settlements.no_clearing': 'ການສະສາງນີ້ບໍ່ຜ່ານບັນຊີລໍຖ້າ',
    'settlements.rvs_no_required': 'ກະລຸນາໃສ່ເລກ suspense ຂອງລາຍການບັນຊີລໍຖ້າຈາກ CORE',
    'settlements.rvs_no_not_allowed': 'ການສະສາງນີ້ບໍ່ຜ່ານບັນຊີລໍຖ້າ',
    'notify.settlements.approved.title': 'ການສະສາງ {ref} ໄດ້ຮັບອະນຸມັດແລ້ວ',
    'notify.settlements.approved.body': 'ພ້ອມສຳລັບໄຟລ໌ອັບໂຫຼດ.',
    'notify.settlements.returned.title': 'ການສະສາງ {ref} ຖືກສົ່ງກັບຄືນຫາທ່ານ',
    'notify.settlements.returned.body': 'ກະລຸນາແກ້ໄຂ ແລະ ສົ່ງໃໝ່.',
  },
}

let moduleCtx: ModuleContext | undefined
const ctx = () => {
  if (!moduleCtx) throw new Error('settlements module is not set up')
  return moduleCtx
}

/**
 * Advance settlements, forms 5–6 (spec §10): a member of the agreement files the expense lines with their
 * receipts; the settlement moves on to approval, the upload file and, overseas, the clearing file.
 */
export const settlementsModule = defineModule({
  name: 'settlements',
  dependsOn: ['authorization', 'auth-hrm', 'hrm', 'travel-master', 'agreements', 'payments', 'audit', 'approval', 'files', 'notifications'],
  migrations: settlementsMigrations,
  permissions: { settlement: ['read', 'export'] },
  lists: { settlements: { fields: settlementFields } },
  // No permission: members file the settlements of their own trips.
  menus: [
    { key: 'settlements', label: 'settlements.nav.title', to: '/settlements', icon: 'i-lucide-receipt', group: 'workspace' },
  ],
  approvalEntities: [settlementApproval(ctx)],
  approvalResolvers: settlementResolvers,
  fileEntities: [settlementFiles(ctx)],
  notificationTypes: { 'settlements.approved': {}, 'settlements.returned': {} },
  auditActions: [
    'settlements.submitted_late',
    'settlements.exported',
    'settlements.posted',
    'settlements.clearing_exported',
    'settlements.cleared',
    'settlements.downloaded',
  ],
  messages,
  setup(c) {
    moduleCtx = c
  },
  middleware: () => keepReceipts(),
  routes: (api, c) => settlementRoutes(api, c),
})
