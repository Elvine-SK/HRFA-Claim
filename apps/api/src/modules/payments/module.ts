import { defineModule, type ModuleContext } from '@elvine-sk/platform-server'
import { paymentApproval, paymentResolvers } from './approval.ts'
import { paymentsMigrations } from './migrations.ts'
import { paymentRoutes } from './routes.ts'
import { paymentFields } from './schema.ts'

const messages = {
  en: {
    'payments.bad_transition': 'The payment cannot move to this status from its current one',
    'payments.exists': 'This agreement already has a payment that is not void',
    'payments.agreement_not_approved': 'Only an approved agreement is paid',
    'payments.not_calculated': 'Only a payment in the calculated status can be changed',
    'payments.night_invalid': 'A bill is for a night that takes no bill',
    'payments.rate_missing': 'No rate for this member on the departure date',
    'payments.same_day_rate_missing': 'No same-day rate on the departure date',
    'payments.fuel_price_missing': 'No fuel price on the departure date',
    'payments.fuel_not_overseas': 'Fuel is not paid on an overseas trip',
    'payments.advance_band_missing': 'No advance band covers this trip',
    'payments.amount_too_large': 'An amount has more than 13 whole digits',
    'posting.account_missing': 'A member has no account in the currency to be paid',
    'payments.bills_missing': 'A night from day 8 has no bill; enter 0 if there is none',
    'notify.payments.approved.title': 'Payment {ref} is approved',
    'notify.payments.approved.body': 'It is ready for the upload file.',
  },
  lo: {
    'payments.bad_transition': 'ການຈ່າຍເງິນບໍ່ສາມາດປ່ຽນໄປເປັນສະຖານະນີ້ຈາກສະຖານະປັດຈຸບັນໄດ້',
    'payments.exists': 'ສັນຍານີ້ມີການຈ່າຍເງິນທີ່ຍັງບໍ່ຖືກຍົກເລີກແລ້ວ',
    'payments.agreement_not_approved': 'ຈ່າຍເງິນໄດ້ສະເພາະສັນຍາທີ່ໄດ້ຮັບອະນຸມັດແລ້ວ',
    'payments.not_calculated': 'ແກ້ໄຂໄດ້ສະເພາະການຈ່າຍເງິນທີ່ຢູ່ໃນສະຖານະຄິດໄລ່ແລ້ວ',
    'payments.night_invalid': 'ມີໃບບິນຂອງຄືນທີ່ບໍ່ຕ້ອງໃຊ້ໃບບິນ',
    'payments.rate_missing': 'ບໍ່ມີອັດຕາຂອງພະນັກງານຄົນນີ້ ໃນວັນເດີນທາງໄປ',
    'payments.same_day_rate_missing': 'ບໍ່ມີອັດຕາໄປ-ກັບພາຍໃນວັນ ໃນວັນເດີນທາງໄປ',
    'payments.fuel_price_missing': 'ບໍ່ມີລາຄານ້ຳມັນ ໃນວັນເດີນທາງໄປ',
    'payments.fuel_not_overseas': 'ບໍ່ຈ່າຍຄ່ານ້ຳມັນສຳລັບການເດີນທາງໄປຕ່າງປະເທດ',
    'payments.advance_band_missing': 'ບໍ່ມີຂັ້ນເງິນລ່ວງໜ້າທີ່ກວມເອົາການເດີນທາງນີ້',
    'payments.amount_too_large': 'ມີຈຳນວນເງິນເກີນ 13 ຫຼັກ',
    'posting.account_missing': 'ມີພະນັກງານທີ່ບໍ່ມີບັນຊີໃນສະກຸນເງິນທີ່ຈະຈ່າຍ',
    'payments.bills_missing': 'ມີຄືນຕັ້ງແຕ່ມື້ທີ 8 ທີ່ບໍ່ມີໃບບິນ; ໃສ່ 0 ຖ້າບໍ່ມີ',
    'notify.payments.approved.title': 'ການຈ່າຍເງິນ {ref} ໄດ້ຮັບອະນຸມັດແລ້ວ',
    'notify.payments.approved.body': 'ພ້ອມສຳລັບໄຟລ໌ອັບໂຫຼດ.',
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
  approvalEntities: [paymentApproval(ctx)],
  approvalResolvers: paymentResolvers,
  notificationTypes: { 'payments.approved': {} },
  messages,
  setup(c) {
    moduleCtx = c
  },
  routes: (api, c) => paymentRoutes(api, c),
})
