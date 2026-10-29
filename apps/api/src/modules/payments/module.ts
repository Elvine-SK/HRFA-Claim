import { defineModule, type ModuleContext } from '@elvine-sk/platform-server'
import { onAgreementCancelled } from '../agreements/events.ts'
import { paymentApproval, paymentResolvers } from './approval.ts'
import { cancelPaymentOf } from './batches.ts'
import { paymentsMigrations } from './migrations.ts'
import { paymentRoutes } from './routes.ts'
import { paymentFields } from './schema.ts'

const messages = {
  en: {
    'payments.bad_transition': 'The payment cannot move to this status from its current one',
    'payments.exists': 'This agreement already has a payment that is not void',
    'payments.agreement_not_approved': 'Only an approved agreement is paid',
    'payments.not_calculated': 'Only a payment in the calculated status can be changed',
    'payments.nothing_to_pay': 'There is nothing to pay: the payment has no items',
    'payments.night_invalid': 'A bill is for a night that takes no bill',
    'payments.rate_missing': 'No rate for this member on the departure date',
    'payments.same_day_rate_missing': 'No same-day rate on the departure date',
    'payments.fuel_price_missing': 'No fuel price on the departure date',
    'payments.fuel_not_overseas': 'Fuel is not paid on an overseas trip',
    'payments.advance_band_missing': 'No advance band covers this trip',
    'payments.amount_too_large': 'An amount has more than 13 whole digits',
    'posting.entry_missing': 'The posting entries of a component are missing, duplicated or on the same side',
    'posting.account_missing': 'A member has no account in the currency to be paid',
    'payments.bills_missing': 'A night from day 8 has no bill; enter 0 if there is none',
    'payments.no_branch': 'Your HRM record has no branch, which the upload file needs for its GL accounts',
    'posting.batch_exists': 'This agreement already has a posting batch of this kind',
    'posting.unbalanced': 'Debits and credits of the batch differ in a currency',
    'notify.payments.approved.title': 'Payment {ref} is approved',
    'notify.payments.approved.body': 'It is ready for the upload file.',
    'notify.payments.cancelled_after_export.title': 'Payment {ref} was cancelled after its upload file',
    'notify.payments.cancelled_after_export.body': 'The agreement was cancelled: {reason}. No reversal file is made; settle it with the bank.',
  },
  lo: {
    'payments.bad_transition': 'ການຈ່າຍເງິນບໍ່ສາມາດປ່ຽນໄປເປັນສະຖານະນີ້ຈາກສະຖານະປັດຈຸບັນໄດ້',
    'payments.exists': 'ສັນຍານີ້ມີການຈ່າຍເງິນທີ່ຍັງບໍ່ຖືກຍົກເລີກແລ້ວ',
    'payments.agreement_not_approved': 'ຈ່າຍເງິນໄດ້ສະເພາະສັນຍາທີ່ໄດ້ຮັບອະນຸມັດແລ້ວ',
    'payments.not_calculated': 'ແກ້ໄຂໄດ້ສະເພາະການຈ່າຍເງິນທີ່ຢູ່ໃນສະຖານະຄິດໄລ່ແລ້ວ',
    'payments.nothing_to_pay': 'ບໍ່ມີຫຍັງຕ້ອງຈ່າຍ: ການຈ່າຍເງິນບໍ່ມີລາຍການ',
    'payments.night_invalid': 'ມີໃບບິນຂອງຄືນທີ່ບໍ່ຕ້ອງໃຊ້ໃບບິນ',
    'payments.rate_missing': 'ບໍ່ມີອັດຕາຂອງພະນັກງານຄົນນີ້ ໃນວັນເດີນທາງໄປ',
    'payments.same_day_rate_missing': 'ບໍ່ມີອັດຕາໄປ-ກັບພາຍໃນວັນ ໃນວັນເດີນທາງໄປ',
    'payments.fuel_price_missing': 'ບໍ່ມີລາຄານ້ຳມັນ ໃນວັນເດີນທາງໄປ',
    'payments.fuel_not_overseas': 'ບໍ່ຈ່າຍຄ່ານ້ຳມັນສຳລັບການເດີນທາງໄປຕ່າງປະເທດ',
    'payments.advance_band_missing': 'ບໍ່ມີຂັ້ນເງິນລ່ວງໜ້າທີ່ກວມເອົາການເດີນທາງນີ້',
    'payments.amount_too_large': 'ມີຈຳນວນເງິນເກີນ 13 ຫຼັກ',
    'posting.entry_missing': 'ລາຍການບັນຊີຂອງປະເພດຄ່າໃຊ້ຈ່າຍຂາດ, ຊ້ຳກັນ ຫຼື ຢູ່ຝັ່ງດຽວກັນ',
    'posting.account_missing': 'ມີພະນັກງານທີ່ບໍ່ມີບັນຊີໃນສະກຸນເງິນທີ່ຈະຈ່າຍ',
    'payments.bills_missing': 'ມີຄືນຕັ້ງແຕ່ມື້ທີ 8 ທີ່ບໍ່ມີໃບບິນ; ໃສ່ 0 ຖ້າບໍ່ມີ',
    'payments.no_branch': 'ຂໍ້ມູນ HRM ຂອງທ່ານບໍ່ມີສາຂາ ເຊິ່ງໄຟລ໌ອັບໂຫຼດຕ້ອງໃຊ້ສຳລັບບັນຊີ GL',
    'posting.batch_exists': 'ສັນຍານີ້ມີຊຸດລົງບັນຊີປະເພດນີ້ແລ້ວ',
    'posting.unbalanced': 'ຍອດ DR ແລະ CR ຂອງຊຸດລົງບັນຊີບໍ່ເທົ່າກັນໃນສະກຸນເງິນໃດໜຶ່ງ',
    'notify.payments.approved.title': 'ການຈ່າຍເງິນ {ref} ໄດ້ຮັບອະນຸມັດແລ້ວ',
    'notify.payments.approved.body': 'ພ້ອມສຳລັບໄຟລ໌ອັບໂຫຼດ.',
    'notify.payments.cancelled_after_export.title': 'ການຈ່າຍເງິນ {ref} ຖືກຍົກເລີກຫຼັງສ້າງໄຟລ໌ອັບໂຫຼດ',
    'notify.payments.cancelled_after_export.body': 'ສັນຍາຖືກຍົກເລີກ: {reason}. ບໍ່ມີໄຟລ໌ກັບລາຍການ; ໃຫ້ແກ້ໄຂກັບທະນາຄານ.',
  },
}

let moduleCtx: ModuleContext | undefined
const ctx = () => {
  if (!moduleCtx) throw new Error('payments module is not set up')
  return moduleCtx
}

/**
 * Payments of approved agreements (spec §9): Finance calculates the checking table, enters bills for nights from
 * day 8, and the payment moves on to approval, the upload file and posting.
 */
export const paymentsModule = defineModule({
  name: 'payments',
  dependsOn: ['authorization', 'auth-hrm', 'travel-master', 'agreements', 'audit', 'approval', 'notifications'],
  migrations: paymentsMigrations,
  permissions: { payment: ['read', 'calculate', 'export'] },
  lists: { payments: { fields: paymentFields } },
  menus: [
    {
      key: 'payments',
      label: 'payments.nav.title',
      to: '/payments',
      icon: 'i-lucide-banknote',
      group: 'workspace',
      permission: 'payment.read',
    },
  ],
  approvalEntities: [paymentApproval(ctx)],
  approvalResolvers: paymentResolvers,
  notificationTypes: { 'payments.approved': {}, 'payments.cancelled_after_export': {} },
  auditActions: ['payments.exported', 'payments.downloaded', 'payments.posted', 'payments.cancelled_after_export'],
  messages,
  setup(c) {
    moduleCtx = c
    onAgreementCancelled((agreementId, reason) => cancelPaymentOf(c, agreementId, reason))
  },
  routes: (api, c) => paymentRoutes(api, c),
})
