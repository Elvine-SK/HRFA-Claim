import { defineModule } from '@elvine-sk/platform-server'
import { travelMasterMigrations } from './migrations.ts'
import { travelMasterRoutes } from './routes.ts'
import { countryFields } from './schema.ts'

const messages = {
  en: {
    'travel_master.country_exists': 'A country with this ISO code already exists',
    'travel_master.unknown_rank': 'This rank does not exist',
    'travel_master.unknown_zone': 'This zone does not exist',
  },
  lo: {
    'travel_master.country_exists': 'ມີປະເທດທີ່ໃຊ້ລະຫັດ ISO ນີ້ຢູ່ແລ້ວ',
    'travel_master.unknown_rank': 'ບໍ່ມີຊັ້ນນີ້',
    'travel_master.unknown_zone': 'ບໍ່ມີເຂດນີ້',
  },
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
  lists: { travel_countries: { fields: countryFields } },
  menus: [
    {
      key: 'master',
      label: 'master.nav.title',
      to: '/master',
      icon: 'i-lucide-database',
      group: 'admin',
      permission: 'travel_master.manage',
    },
  ],
  messages,
  routes: (api, c) => travelMasterRoutes(api, c),
})
