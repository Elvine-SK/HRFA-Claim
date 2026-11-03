import { defineModule, type ModuleContext } from '@elvine-sk/platform-server'
import { agreementApproval, agreementResolvers } from './approval.ts'
import { agreementFiles, keepSignedCopies } from './files.ts'
import { agreementsMigrations } from './migrations.ts'
import { agreementRoutes } from './routes.ts'
import { agreementFields } from './schema.ts'

const messages = {
  en: {
    'agreements.bad_transition': 'The agreement cannot move to this status from its current one',
    'agreements.reason_required': 'Give the reason for the cancellation',
    'agreements.doc_no_taken': 'Another agreement that is not cancelled has this Doc.no',
    'agreements.not_draft': 'Only a draft agreement can be changed',
    'agreements.signed_copy_locked': 'The signed copy of a submitted agreement is kept',
    'notify.agreements.approved.title': 'Agreement {ref} is approved',
    'notify.agreements.approved.body': 'Calculate its payment.',
    'notify.agreements.cancelled.title': 'Agreement {ref} is cancelled',
    'notify.agreements.cancelled.body': 'Reason: {reason}. File a new agreement if the trip goes ahead.',
  },
  lo: {
    'agreements.bad_transition': 'ສັນຍາບໍ່ສາມາດປ່ຽນໄປເປັນສະຖານະນີ້ຈາກສະຖານະປັດຈຸບັນໄດ້',
    'agreements.reason_required': 'ກະລຸນາລະບຸເຫດຜົນຂອງການຍົກເລີກ',
    'agreements.doc_no_taken': 'ມີສັນຍາອື່ນທີ່ຍັງບໍ່ຖືກຍົກເລີກ ໃຊ້ເລກທີເອກະສານນີ້ແລ້ວ',
    'agreements.not_draft': 'ແກ້ໄຂໄດ້ສະເພາະສັນຍາທີ່ເປັນສະບັບຮ່າງ',
    'agreements.signed_copy_locked': 'ສຳເນົາທີ່ເຊັນແລ້ວຂອງສັນຍາທີ່ສົ່ງແລ້ວ ຕ້ອງເກັບໄວ້',
    'notify.agreements.approved.title': 'ສັນຍາ {ref} ໄດ້ຮັບອະນຸມັດແລ້ວ',
    'notify.agreements.approved.body': 'ກະລຸນາຄິດໄລ່ການຈ່າຍເງິນ.',
    'notify.agreements.cancelled.title': 'ສັນຍາ {ref} ຖືກຍົກເລີກ',
    'notify.agreements.cancelled.body': 'ເຫດຜົນ: {reason}. ຖ້າຍັງເດີນທາງ ໃຫ້ສ້າງສັນຍາໃໝ່.',
  },
}

let moduleCtx: ModuleContext | undefined
const ctx = () => {
  if (!moduleCtx) throw new Error('agreements module is not set up')
  return moduleCtx
}

/**
 * Travel agreements, forms 1–4 (spec §8): members filled from HRM, REF issued by the system, Doc.no checked,
 * branch-scoped approval and cancellation with a reason.
 */
export const agreementsModule = defineModule({
  name: 'agreements',
  dependsOn: ['authorization', 'hrm', 'auth-hrm', 'travel-master', 'audit', 'approval', 'files', 'notifications'],
  migrations: agreementsMigrations,
  permissions: { agreement: ['read', 'create', 'cancel'] },
  lists: { agreements: { fields: agreementFields } },
  // No permission: every signed-in user has the agreements they are a member of.
  menus: [{ key: 'agreements', label: 'agreements.nav.title', to: '/agreements', icon: 'i-lucide-plane', group: 'workspace' }],
  approvalEntities: [agreementApproval(ctx)],
  approvalResolvers: agreementResolvers,
  fileEntities: [agreementFiles(ctx)],
  notificationTypes: { 'agreements.approved': {}, 'agreements.cancelled': {} },
  auditActions: ['agreements.cancelled', 'agreements.printed'],
  messages,
  setup(c) {
    moduleCtx = c
  },
  middleware: () => keepSignedCopies(),
  routes: (api, c) => agreementRoutes(api, c),
})
