import { uuidv7 } from '@elvine-sk/platform-core'
import { createTable, datetimeType, sql, uuidBin, uuidType, type Kysely, type MigrationSet } from '@elvine-sk/platform-db'

export const EMPLOYEE_ROLE_KEY = 'employee'

export const authHrmMigrations: MigrationSet = {
  '202610200100_auth_hrm_create': {
    async up(db: Kysely<any>) {
      // One platform user per HRM employee, like auth-oidc's user_identities with provider `hrm`, subject EID.
      await createTable(db, 'hrm_user_links')
        .addColumn('eid', sql`varchar(5)`, (c) => c.primaryKey())
        .addColumn('user_id', uuidType, (c) => c.notNull().unique())
        .addColumn('created_at', datetimeType, (c) => c.notNull())
        .addColumn('last_login_at', datetimeType)
        .execute()

      // HRM's handoff table is read-only to the app, so single use is enforced here: the key refuses a second insert.
      await createTable(db, 'hrm_handoff_redemptions')
        .addColumn('code_hash', sql`char(64)`, (c) => c.primaryKey())
        .addColumn('eid', sql`varchar(5)`, (c) => c.notNull())
        .addColumn('redeemed_at', datetimeType, (c) => c.notNull())
        .execute()
      await db.schema
        .createIndex('ix_hrm_handoff_redemptions_redeemed')
        .on('hrm_handoff_redemptions')
        .column('redeemed_at')
        .execute()

      // Every HRM user gets this role on first sign-in (ຂ8). Later modules add its permissions.
      const now = new Date()
      await db
        .insertInto('roles')
        .values({
          id: uuidBin(uuidv7()),
          key: EMPLOYEE_ROLE_KEY,
          name: 'Employee',
          description: 'Every user signed in from HRM: their own agreements and settlements.',
          is_super: 0,
          is_system: 1,
          created_at: now,
          updated_at: now,
        })
        .execute()
    },
  },
}
