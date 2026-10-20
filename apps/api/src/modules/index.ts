import type { PlatformModule } from '@elvine-sk/platform-server'
import { hrmModule } from './hrm/module.ts'

/** Your modules, registered after the platform modules. Each can bring routes, migrations and permissions. */
export const appModules: PlatformModule[] = [hrmModule]
