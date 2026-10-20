import { defineModule } from '@elvine-sk/platform-server'
import { hrmRoutes } from './routes.ts'

/**
 * Read layer over HRM (`bcel_hrm_v3`, data source `hrm`, read-only): selectable employees with their organisation
 * and position, accounts per currency, and HRM sessions. Nothing here writes to HRM.
 */
export const hrmModule = defineModule({
  name: 'hrm',
  dependsOn: ['authorization'],
  permissions: { hrm_employee: ['read'] },
  routes: (api, c) => hrmRoutes(api, c),
})
