import { uuidv7 } from '@elvine-sk/platform-core'
import {
  createTable,
  datetimeType,
  inCheck,
  sql,
  uuidBin,
  uuidType,
  withStandardColumns,
  type Kysely,
  type MigrationSet,
} from '@elvine-sk/platform-db'
import { SEED_COUNTRIES } from './countries.ts'
import {
  SEED_ADVANCE_BANDS,
  SEED_BORDER_ROUTES,
  SEED_EFFECTIVE_FROM,
  SEED_FLAT_RATES,
  SEED_GL_ACCOUNTS,
  SEED_POSTING_ENTRIES,
  SEED_RANK_MAP,
  SEED_RANKS,
  SEED_RATES,
  SEED_SETTLEMENT_ENTRIES,
  SEED_ZONES,
} from './seed.ts'

const money = sql`decimal(15,2)`

export const travelMasterMigrations: MigrationSet = {
  '202610220100_travel-master_create': {
    async up(db: Kysely<any>) {
      await createTable(db, 'travel_ranks')
        .addColumn('code', sql`varchar(2)`, (c) => c.primaryKey())
        .addColumn('name_lo', sql`varchar(200)`, (c) => c.notNull())
        .addColumn('name_en', sql`varchar(200)`, (c) => c.notNull())
        .addColumn('sort_order', sql`int`, (c) => c.notNull())
        .execute()

      await withStandardColumns(createTable(db, 'travel_rank_map'))
        .addColumn('post_type', sql`int`, (c) => c.notNull().unique())
        .addColumn('rank_code', sql`varchar(2)`, (c) => c.notNull().references('travel_ranks.code'))
        .execute()

      await createTable(db, 'travel_zones')
        .addColumn('code', sql`varchar(4)`, (c) => c.primaryKey())
        .addColumn('kind', sql`varchar(10)`, (c) => c.notNull())
        .addColumn('currency', sql`char(3)`, (c) => c.notNull())
        .addColumn('name_lo', sql`varchar(200)`, (c) => c.notNull())
        .addColumn('name_en', sql`varchar(200)`, (c) => c.notNull())
        .addColumn('sort_order', sql`int`, (c) => c.notNull())
        .addCheckConstraint('ck_travel_zones_kind', inCheck('kind', ['domestic', 'border', 'overseas']))
        .addCheckConstraint('ck_travel_zones_currency', inCheck('currency', ['LAK', 'USD']))
        .execute()

      await withStandardColumns(createTable(db, 'travel_countries'))
        .addColumn('iso2', sql`char(2)`, (c) => c.notNull().unique())
        .addColumn('name_lo', sql`varchar(200)`, (c) => c.notNull())
        .addColumn('name_en', sql`varchar(200)`, (c) => c.notNull())
        .addColumn('zone_code', sql`varchar(4)`, (c) => c.notNull().references('travel_zones.code'))
        .execute()

      await withStandardColumns(createTable(db, 'travel_border_routes'))
        .addColumn('name_lo', sql`varchar(200)`, (c) => c.notNull())
        .addColumn('name_en', sql`varchar(200)`, (c) => c.notNull())
        .addColumn('active', sql`tinyint(1)`, (c) => c.notNull().defaultTo(1))
        .execute()

      await createTable(db, 'travel_rates')
        .addColumn('id', uuidType, (c) => c.primaryKey().notNull())
        .addColumn('zone_code', sql`varchar(4)`, (c) => c.notNull().references('travel_zones.code'))
        .addColumn('rank_code', sql`varchar(2)`, (c) => c.notNull().references('travel_ranks.code'))
        .addColumn('effective_from', sql`date`, (c) => c.notNull())
        .addColumn('daily', money, (c) => c.notNull())
        .addColumn('accommodation', money, (c) => c.notNull())
        .addColumn('personal', money)
        .addColumn('created_at', datetimeType, (c) => c.notNull())
        .addColumn('created_by', uuidType)
        .addUniqueConstraint('uq_travel_rates_set', ['zone_code', 'rank_code', 'effective_from'])
        .execute()

      await createTable(db, 'travel_flat_rates')
        .addColumn('id', uuidType, (c) => c.primaryKey().notNull())
        .addColumn('key', sql`varchar(20)`, (c) => c.notNull())
        .addColumn('effective_from', sql`date`, (c) => c.notNull())
        .addColumn('amount', money, (c) => c.notNull())
        .addColumn('created_at', datetimeType, (c) => c.notNull())
        .addColumn('created_by', uuidType)
        .addCheckConstraint('ck_travel_flat_rates_key', inCheck('key', ['same_day', 'fuel_price', 'km_per_litre']))
        .addUniqueConstraint('uq_travel_flat_rates_set', ['key', 'effective_from'])
        .execute()

      await createTable(db, 'travel_advance_bands')
        .addColumn('id', uuidType, (c) => c.primaryKey().notNull())
        .addColumn('kind', sql`varchar(20)`, (c) => c.notNull())
        .addColumn('effective_from', sql`date`, (c) => c.notNull())
        .addColumn('min_count', sql`int`, (c) => c.notNull())
        .addColumn('max_count', sql`int`)
        .addColumn('amount', money, (c) => c.notNull())
        .addColumn('created_at', datetimeType, (c) => c.notNull())
        .addColumn('created_by', uuidType)
        .addCheckConstraint('ck_travel_advance_bands_kind', inCheck('kind', ['domestic_days', 'group_size']))
        .addUniqueConstraint('uq_travel_advance_bands_set', ['kind', 'effective_from', 'min_count'])
        .execute()

      await createTable(db, 'travel_gl_accounts')
        .addColumn('gl', sql`char(10)`, (c) => c.notNull())
        .addColumn('seq', sql`char(4)`, (c) => c.notNull())
        .addColumn('name_en', sql`varchar(200)`, (c) => c.notNull())
        .addColumn('name_lo', sql`varchar(300)`, (c) => c.notNull())
        .addPrimaryKeyConstraint('pk_travel_gl_accounts', ['gl', 'seq'])
        .execute()
    },
  },

  // Rows from seed.ts and countries.ts; seed rows have no `created_by`.
  '202610220110_travel-master_seed': {
    async up(db: Kysely<any>) {
      const now = new Date()
      const stamp = () => ({ id: uuidBin(uuidv7()), created_at: now, updated_at: now })
      const setRow = () => ({ id: uuidBin(uuidv7()), effective_from: SEED_EFFECTIVE_FROM, created_at: now })

      await db
        .insertInto('travel_ranks')
        .values(SEED_RANKS.map((r, i) => ({ code: r.code, name_lo: r.nameLo, name_en: r.nameEn, sort_order: i + 1 })))
        .execute()
      await db
        .insertInto('travel_rank_map')
        .values(SEED_RANK_MAP.map((m) => ({ ...stamp(), post_type: m.postType, rank_code: m.rankCode })))
        .execute()
      await db
        .insertInto('travel_zones')
        .values(
          SEED_ZONES.map((z, i) => ({
            code: z.code,
            kind: z.kind,
            currency: z.currency,
            name_lo: z.nameLo,
            name_en: z.nameEn,
            sort_order: i + 1,
          })),
        )
        .execute()
      await db
        .insertInto('travel_countries')
        .values(
          SEED_COUNTRIES.map((c) => ({
            ...stamp(),
            iso2: c.iso2,
            name_lo: c.nameLo,
            name_en: c.nameEn,
            zone_code: c.zoneCode,
          })),
        )
        .execute()
      await db
        .insertInto('travel_border_routes')
        .values(SEED_BORDER_ROUTES.map((r) => ({ ...stamp(), name_lo: r.nameLo, name_en: r.nameEn })))
        .execute()
      await db
        .insertInto('travel_rates')
        .values(
          SEED_RATES.map((r) => ({
            ...setRow(),
            zone_code: r.zoneCode,
            rank_code: r.rankCode,
            daily: r.daily,
            accommodation: r.accommodation,
            personal: r.personal,
          })),
        )
        .execute()
      await db
        .insertInto('travel_flat_rates')
        .values(SEED_FLAT_RATES.map((f) => ({ ...setRow(), key: f.key, amount: f.amount })))
        .execute()
      await db
        .insertInto('travel_advance_bands')
        .values(
          SEED_ADVANCE_BANDS.map((b) => ({
            ...setRow(),
            kind: b.kind,
            min_count: b.minCount,
            max_count: b.maxCount,
            amount: b.amount,
          })),
        )
        .execute()
      await db
        .insertInto('travel_gl_accounts')
        .values(SEED_GL_ACCOUNTS.map((g) => ({ gl: g.gl, seq: g.seq, name_en: g.nameEn, name_lo: g.nameLo })))
        .execute()
    },
  },

  // Which GL account is debited or credited for each payment component (plan 4); the settlement cases follow in 202611020100.
  '202610300100_travel-master_posting_entries': {
    async up(db: Kysely<any>) {
      await createTable(db, 'travel_posting_entries')
        .addColumn('id', uuidType, (c) => c.primaryKey().notNull())
        .addColumn('case_key', sql`varchar(30)`, (c) => c.notNull())
        .addColumn('zone_kind', sql`varchar(10)`, (c) => c.notNull())
        .addColumn('component', sql`varchar(30)`, (c) => c.notNull())
        .addColumn('side', sql`char(2)`, (c) => c.notNull())
        .addColumn('account_kind', sql`varchar(10)`, (c) => c.notNull())
        .addColumn('gl', sql`char(10)`)
        .addColumn('seq', sql`char(4)`)
        .addColumn('sort_order', sql`int`, (c) => c.notNull())
        .addForeignKeyConstraint('fk_travel_posting_entries_gl', ['gl', 'seq'], 'travel_gl_accounts', ['gl', 'seq'])
        .addCheckConstraint('ck_travel_posting_entries_zone_kind', inCheck('zone_kind', ['domestic', 'border', 'overseas']))
        .addCheckConstraint('ck_travel_posting_entries_side', inCheck('side', ['DR', 'CR']))
        .addCheckConstraint('ck_travel_posting_entries_account_kind', inCheck('account_kind', ['gl', 'member']))
        .addCheckConstraint(
          'ck_travel_posting_entries_account',
          sql`(account_kind = 'member') = (gl IS NULL) and (gl IS NULL) = (seq IS NULL)`,
        )
        .addUniqueConstraint('uq_travel_posting_entries', ['case_key', 'zone_kind', 'component', 'side'])
        .execute()

      await db
        .insertInto('travel_posting_entries')
        .values(
          SEED_POSTING_ENTRIES.map((e, i) => ({
            id: uuidBin(uuidv7()),
            case_key: e.caseKey,
            zone_kind: e.zoneKind,
            component: e.component,
            side: e.side,
            account_kind: e.accountKind,
            gl: e.gl,
            seq: e.seq,
            sort_order: i + 1,
          })),
        )
        .execute()
    },
  },

  // The settlement and clearing cases (plan 5), after the payment rows.
  '202611020100_travel-master_settlement_entries': {
    async up(db: Kysely<any>) {
      await db
        .insertInto('travel_posting_entries')
        .values(
          SEED_SETTLEMENT_ENTRIES.map((e, i) => ({
            id: uuidBin(uuidv7()),
            case_key: e.caseKey,
            zone_kind: e.zoneKind,
            component: e.component,
            side: e.side,
            account_kind: e.accountKind,
            gl: e.gl,
            seq: e.seq,
            sort_order: 1000 + i,
          })),
        )
        .execute()
    },
  },
}
