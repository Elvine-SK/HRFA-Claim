import { defineModule } from '@elvine-sk/platform-server'
import { travelMasterMigrations } from './migrations.ts'

const messages = {
  en: {},
  lo: {},
}

/**
 * Travel reference data (spec §7): ranks and the PostType map, zones, countries, border routes, effective-dated
 * rates, flat rates and advance bands, and GL accounts, with the lookups the agreement and settlement modules use.
 */
export const travelMasterModule = defineModule({
  name: 'travel-master',
  dependsOn: ['authorization', 'hrm'],
  migrations: travelMasterMigrations,
  permissions: { travel_master: ['manage'] },
  messages,
})
