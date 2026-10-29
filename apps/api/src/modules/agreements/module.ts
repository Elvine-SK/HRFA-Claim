import { defineModule } from '@elvine-sk/platform-server'
import { agreementsMigrations } from './migrations.ts'

const messages = {
  en: {
    'agreements.bad_transition': 'The agreement cannot move to this status from its current one',
    'agreements.reason_required': 'Give the reason for the cancellation',
  },
  lo: {
    'agreements.bad_transition': 'ສັນຍາບໍ່ສາມາດປ່ຽນໄປເປັນສະຖານະນີ້ຈາກສະຖານະປັດຈຸບັນໄດ້',
    'agreements.reason_required': 'ກະລຸນາລະບຸເຫດຜົນຂອງການຍົກເລີກ',
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
  messages,
})
