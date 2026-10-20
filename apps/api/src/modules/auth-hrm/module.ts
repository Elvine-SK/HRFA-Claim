import { defineModule } from '@elvine-sk/platform-server'
import { authHrmMigrations } from './migrations.ts'
import { authHrmRoutes } from './routes.ts'

const messages = {
  en: {
    'auth_hrm.code_invalid': 'The sign-in link expired or is invalid. Open the system again from HRM',
    'auth_hrm.code_used': 'This sign-in link was already used. Open the system again from HRM',
    'auth_hrm.not_selectable': 'Your HRM record does not allow access to this system',
    'auth_hrm.account_inactive': 'This account is not active',
    'auth_hrm.unavailable': 'HRM is unavailable. Try again later',
    'auth_hrm.rate_limited': 'Too many sign-in attempts. Try again later',
    'auth_hrm.failed': 'Sign-in from HRM failed',
  },
  lo: {
    'auth_hrm.code_invalid': 'ລິ້ງເຂົ້າສູ່ລະບົບໝົດອາຍຸ ຫຼື ບໍ່ຖືກຕ້ອງ. ກະລຸນາເປີດລະບົບໃໝ່ຈາກ HRM',
    'auth_hrm.code_used': 'ລິ້ງເຂົ້າສູ່ລະບົບນີ້ຖືກໃຊ້ແລ້ວ. ກະລຸນາເປີດລະບົບໃໝ່ຈາກ HRM',
    'auth_hrm.not_selectable': 'ຂໍ້ມູນຂອງທ່ານໃນ HRM ບໍ່ອະນຸຍາດໃຫ້ເຂົ້າໃຊ້ລະບົບນີ້',
    'auth_hrm.account_inactive': 'ບັນຊີນີ້ບໍ່ໄດ້ເປີດໃຊ້ງານ',
    'auth_hrm.unavailable': 'ລະບົບ HRM ບໍ່ພ້ອມໃຊ້ງານ. ກະລຸນາລອງໃໝ່ພາຍຫຼັງ',
    'auth_hrm.rate_limited': 'ພະຍາຍາມເຂົ້າສູ່ລະບົບຫຼາຍເກີນໄປ. ກະລຸນາລອງໃໝ່ພາຍຫຼັງ',
    'auth_hrm.failed': 'ການເຂົ້າສູ່ລະບົບຈາກ HRM ບໍ່ສຳເລັດ',
  },
}

/**
 * Sign-in handed over from the HRM portal (spec §6): a one-time code from HRM's `tb_app_handoff`, spent in this
 * app's database, opens a platform session for the linked (or new) user. App-local for now; shaped like the
 * proposed platform M2 provider so it can be replaced by that package.
 */
export const authHrmModule = defineModule({
  name: 'auth-hrm',
  dependsOn: ['auth', 'authorization', 'audit', 'hrm'],
  migrations: authHrmMigrations,
  auditActions: ['auth.hrm.login', 'auth.hrm.failed', 'auth.hrm.user_created'],
  publicRoutes: ['GET /auth/hrm'],
  messages,
  routes: (api, c) => authHrmRoutes(api, c),
})
