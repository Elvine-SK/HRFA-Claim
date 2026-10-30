import type { PlatformOptions } from './platform.modules.ts'

/**
 * Options for the platform modules. `platform.modules.ts` passes each entry to its module, so this is where
 * code goes that an environment variable cannot hold: a storage adapter, a mail transport, a retention
 * period. `nelv` created this file and never changes it. Keys are checked against the installed packages:
 *
 *   notifications: { retentionDays: 180 },
 *   audit: { recordChanges: false },
 *
 * Subject attributes for policies are better declared by the app module that knows them
 * (`subjectAttributes` on `defineModule`); `authorization.subjectAttributes` here works too.
 */
export const platformOptions: PlatformOptions = {}
