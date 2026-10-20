import { testSourceUrl } from '@elvine-sk/platform-db/testing'

/** The `hrm` data source as tests configure it: the database `global-setup.ts` loads, in HRM's time zone. */
export function hrmTestSource(url = testSourceUrl('hrm')) {
  return { name: 'hrm', url, poolSize: 2, timeoutMs: 1000, timezone: '+07:00' }
}
