import type { PlatformModule } from '@elvine-sk/platform-server'
import { agreementsModule } from './agreements/module.ts'
import { authHrmModule } from './auth-hrm/module.ts'
import { hrmModule } from './hrm/module.ts'
import { travelMasterModule } from './travel-master/module.ts'

/** Your modules, registered after the platform modules. Each can bring routes, migrations and permissions. */
export const appModules: PlatformModule[] = [hrmModule, authHrmModule, travelMasterModule, agreementsModule]
