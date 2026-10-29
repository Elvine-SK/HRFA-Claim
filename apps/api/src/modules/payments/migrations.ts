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
import { COMPONENTS, PAYMENT_STATUSES } from './types.ts'

const STAMP_IN = `IN p_actor BINARY(16), IN p_at DATETIME(3), IN p_request_id VARCHAR(64), IN p_history_id BINARY(16)`

/** Signed: a meal deduction is negative. */
const money = sql`decimal(15,2)`

const PROCEDURES = {
  // Status changes (plan 4): calculated → in_approval → approved → exported → posted; void before export,
  // cancelled_after_export after it; back to calculated when the approver returns it.
  payments_transition: `CREATE PROCEDURE payments_transition(IN p_id BINARY(16), IN p_version INT UNSIGNED,
    IN p_to VARCHAR(24), IN p_core_ref VARCHAR(50), ${STAMP_IN})
  BEGIN
    DECLARE v_version INT UNSIGNED;
    DECLARE v_status VARCHAR(24);
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_version = NULL;
    SELECT version, status INTO v_version, v_status FROM payments WHERE id = p_id FOR UPDATE;
    IF v_version IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'resource.not_found'; END IF;
    IF v_version <> p_version THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'resource.stale_version'; END IF;
    IF NOT ((v_status = 'calculated' AND p_to IN ('in_approval', 'void'))
        OR (v_status = 'in_approval' AND p_to IN ('calculated', 'approved', 'void'))
        OR (v_status = 'approved' AND p_to IN ('exported', 'void'))
        OR (v_status = 'exported' AND p_to IN ('posted', 'cancelled_after_export'))
        OR (v_status = 'posted' AND p_to = 'cancelled_after_export')) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'payments.bad_transition';
    END IF;
    UPDATE payments
      SET status = p_to, version = v_version + 1, updated_at = p_at, updated_by = p_actor,
        submitted_at = IF(p_to = 'in_approval', p_at, submitted_at),
        exported_at = IF(p_to = 'exported', p_at, exported_at),
        posted_at = IF(p_to = 'posted', p_at, posted_at),
        core_ref = IF(p_to = 'posted', NULLIF(TRIM(p_core_ref), ''), core_ref),
        cancelled_at = IF(p_to IN ('void', 'cancelled_after_export'), p_at, cancelled_at)
      WHERE id = p_id;
    INSERT INTO record_history (id, entity_type, entity_id, version, action, changes, changed_by, changed_at,
      request_id)
    VALUES (p_history_id, 'payment', p_id, v_version + 1, 'update',
      JSON_OBJECT('status', JSON_ARRAY(v_status, p_to)), p_actor, p_at, p_request_id);
    SELECT v_version + 1 AS version;
  END`,
}

/** Finance's roles of spec §12 for payments (administrators change them later). */
const NEW_ROLES: { key: string; name: string; description: string; permissions: string[] }[] = [
  {
    key: 'finance_section_head',
    name: 'Finance section head',
    description: 'Approves the payments of their branch (ກ18).',
    permissions: ['payment.read', 'agreement.read'],
  },
]
const GRANTS: Record<string, string[]> = {
  finance_officer: ['payment.read', 'payment.calculate', 'payment.export'],
}

export const paymentsMigrations: MigrationSet = {
  '202610300200_payments_create': {
    async up(db: Kysely<any>) {
      await withStandardColumns(createTable(db, 'payments'))
        .addColumn('agreement_id', uuidType, (c) => c.notNull().references('agreements.id'))
        .addColumn('branch_code', sql`char(6)`, (c) => c.notNull())
        .addColumn('status', sql`varchar(24)`, (c) => c.notNull().defaultTo('calculated'))
        .addColumn('calculated_at', datetimeType, (c) => c.notNull())
        .addColumn('submitted_at', datetimeType)
        .addColumn('exported_at', datetimeType)
        .addColumn('posted_at', datetimeType)
        .addColumn('core_ref', sql`varchar(50)`)
        .addColumn('cancelled_at', datetimeType)
        // One live payment per agreement; a voided one's agreement may be paid again.
        .addColumn('agreement_live', uuidType, (c) =>
          c.generatedAlwaysAs(sql`IF(status <> 'void', agreement_id, NULL)`).stored(),
        )
        .addCheckConstraint('ck_payments_status', inCheck('status', PAYMENT_STATUSES))
        .addUniqueConstraint('uq_payments_agreement_live', ['agreement_live'])
        .execute()
      await db.schema.createIndex('ix_payments_branch_status').on('payments').columns(['branch_code', 'status']).execute()
      await db.schema.createIndex('ix_payments_agreement').on('payments').column('agreement_id').execute()

      await createTable(db, 'payment_items')
        .addColumn('id', uuidType, (c) => c.primaryKey().notNull())
        .addColumn('payment_id', uuidType, (c) => c.notNull().references('payments.id').onDelete('cascade'))
        .addColumn('sort_order', sql`int`, (c) => c.notNull())
        .addColumn('eid', sql`varchar(5)`, (c) => c.notNull())
        .addColumn('component', sql`varchar(24)`, (c) => c.notNull())
        .addColumn('currency', sql`char(3)`, (c) => c.notNull())
        .addColumn('rate', money, (c) => c.notNull())
        .addColumn('count', sql`int`, (c) => c.notNull())
        .addColumn('amount', money, (c) => c.notNull())
        .addColumn('basis', sql`varchar(200)`, (c) => c.notNull())
        .addCheckConstraint('ck_payment_items_component', inCheck('component', COMPONENTS))
        .addCheckConstraint('ck_payment_items_currency', inCheck('currency', ['LAK', 'USD']))
        .execute()
      await db.schema
        .createIndex('ix_payment_items_payment')
        .on('payment_items')
        .columns(['payment_id', 'sort_order'])
        .execute()

      await createTable(db, 'payment_bills')
        .addColumn('payment_id', uuidType, (c) => c.notNull().references('payments.id').onDelete('cascade'))
        .addColumn('eid', sql`varchar(5)`, (c) => c.notNull())
        .addColumn('night', sql`int`, (c) => c.notNull())
        .addColumn('amount', money, (c) => c.notNull())
        .addPrimaryKeyConstraint('pk_payment_bills', ['payment_id', 'eid', 'night'])
        .addCheckConstraint('ck_payment_bills_amount', sql`amount >= 0`)
        .execute()

      // DDL is not rolled back, so a half-finished earlier run may have left a procedure behind.
      for (const [name, body] of Object.entries(PROCEDURES)) {
        await sql`DROP PROCEDURE IF EXISTS ${sql.id(name)}`.execute(db)
        await sql.raw(body).execute(db)
      }

      const now = new Date()
      for (const r of NEW_ROLES) {
        const id = uuidv7()
        await db
          .insertInto('roles')
          .values({
            id: uuidBin(id),
            key: r.key,
            name: r.name,
            description: r.description,
            is_super: 0,
            is_system: 0,
            created_at: now,
            updated_at: now,
          })
          .execute()
        await db
          .insertInto('role_permissions')
          .values(r.permissions.map((key) => ({ role_id: uuidBin(id), permission_key: key })))
          .execute()
      }
      for (const [key, permissions] of Object.entries(GRANTS)) {
        const role = await db.selectFrom('roles').select('id').where('key', '=', key).executeTakeFirst()
        if (!role) continue // removed by an administrator: nothing to extend
        await db
          .insertInto('role_permissions')
          .values(permissions.map((permission_key) => ({ role_id: uuidBin(role.id as string), permission_key })))
          .execute()
      }
    },
  },
}
