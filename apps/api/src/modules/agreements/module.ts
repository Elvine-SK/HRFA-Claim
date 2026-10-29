import { defineModule } from '@elvine-sk/platform-server'
import { agreementsMigrations } from './migrations.ts'
import { agreementRoutes } from './routes.ts'
import { agreementFields } from './schema.ts'

const messages = {
  en: {
    'agreements.bad_transition': 'The agreement cannot move to this status from its current one',
    'agreements.reason_required': 'Give the reason for the cancellation',
    'agreements.doc_no_taken': 'Another agreement that is not cancelled has this Doc.no',
    'agreements.not_draft': 'Only a draft agreement can be changed',
  },
  lo: {
    'agreements.bad_transition': 'ສັນຍາບໍ່ສາມາດປ່ຽນໄປເປັນສະຖານະນີ້ຈາກສະຖານະປັດຈຸບັນໄດ້',
    'agreements.reason_required': 'ກະລຸນາລະບຸເຫດຜົນຂອງການຍົກເລີກ',
    'agreements.doc_no_taken': 'ມີສັນຍາອື່ນທີ່ຍັງບໍ່ຖືກຍົກເລີກ ໃຊ້ເລກທີເອກະສານນີ້ແລ້ວ',
    'agreements.not_draft': 'ແກ້ໄຂໄດ້ສະເພາະສັນຍາທີ່ເປັນສະບັບຮ່າງ',
  },
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
  messages,
  routes: (api, c) => agreementRoutes(api, c),
})
