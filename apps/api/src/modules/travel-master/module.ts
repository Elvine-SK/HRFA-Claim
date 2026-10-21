import { defineModule } from '@elvine-sk/platform-server'
import { travelMasterMigrations } from './migrations.ts'
import { travelMasterRoutes } from './routes.ts'
import { countryFields } from './schema.ts'

const messages = {
  en: {
    'travel_master.country_exists': 'A country with this ISO code already exists',
    'travel_master.bands_invalid': 'The advance bands must start at 1, follow each other and end open',
    'travel_master.rates_invalid': 'The rate set must hold one row for each of the nine ranks',
    'travel_master.set_in_effect': 'A set already in effect cannot be changed or deleted',
    'travel_master.unknown_rank': 'This rank does not exist',
    'travel_master.unknown_zone': 'This zone does not exist',
  },
  lo: {
    'travel_master.country_exists': 'ມີປະເທດທີ່ໃຊ້ລະຫັດ ISO ນີ້ຢູ່ແລ້ວ',
    'travel_master.bands_invalid': 'ຊ່ວງເງິນລ່ວງໜ້າຕ້ອງເລີ່ມທີ່ 1, ຕໍ່ເນື່ອງກັນ ແລະ ຊ່ວງສຸດທ້າຍບໍ່ມີຂີດຈຳກັດ',
    'travel_master.rates_invalid': 'ຊຸດອັດຕາຕ້ອງມີຄົບທັງ 9 ຊັ້ນ, ຊັ້ນລະ 1 ແຖວ',
    'travel_master.set_in_effect': 'ຊຸດທີ່ມີຜົນບັງຄັບໃຊ້ແລ້ວ ບໍ່ສາມາດແກ້ໄຂ ຫຼື ລຶບໄດ້',
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
  dependsOn: ['authorization', 'hrm', 'audit'],
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
  auditActions: ['travel_master.set_published', 'travel_master.set_deleted'],
  messages,
  routes: (api, c) => travelMasterRoutes(api, c),
})
