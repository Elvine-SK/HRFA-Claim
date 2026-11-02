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
import { CASE_KINDS, EXPENSE_TYPES, SETTLEMENT_STATUSES } from './types.ts'

const STAMP_IN = `IN p_actor BINARY(16), IN p_at DATETIME(3), IN p_request_id VARCHAR(64), IN p_history_id BINARY(16)`

/** Signed: `remaining` is negative when the advance was overspent. */
const money = sql`decimal(15,2)`

const PROCEDURES = {
  // Status changes (plan 5): draft → in_approval → approved → exported → posted, then for an overseas settlement
  // with holding → clearing_exported → cleared; void before export, cancelled_after_export after it; back to draft
  // when the request is returned, rejected or withdrawn.
  settlements_transition: `CREATE PROCEDURE settlements_transition(IN p_id BINARY(16), IN p_version INT UNSIGNED,
    IN p_to VARCHAR(24), IN p_core_ref VARCHAR(50), IN p_rvs_no VARCHAR(30), ${STAMP_IN})
  BEGIN
    DECLARE v_version INT UNSIGNED;
    DECLARE v_status VARCHAR(24);
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_version = NULL;
    SELECT version, status INTO v_version, v_status FROM settlements WHERE id = p_id FOR UPDATE;
    IF v_version IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'resource.not_found'; END IF;
    IF v_version <> p_version THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'resource.stale_version'; END IF;
    IF NOT ((v_status = 'draft' AND p_to IN ('in_approval', 'void'))
        OR (v_status = 'in_approval' AND p_to IN ('draft', 'approved', 'void'))
        OR (v_status = 'approved' AND p_to IN ('exported', 'void'))
        OR (v_status = 'exported' AND p_to IN ('posted', 'cancelled_after_export'))
        OR (v_status = 'posted' AND p_to IN ('clearing_exported', 'cancelled_after_export'))
        OR (v_status = 'clearing_exported' AND p_to IN ('cleared', 'cancelled_after_export'))
        OR (v_status = 'cleared' AND p_to = 'cancelled_after_export')) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'settlements.bad_transition';
    END IF;
    UPDATE settlements
      SET status = p_to, version = v_version + 1, updated_at = p_at, updated_by = p_actor,
        submitted_at = IF(p_to = 'in_approval', p_at, submitted_at),
        approved_at = IF(p_to = 'approved', p_at, approved_at),
        exported_at = IF(p_to = 'exported', p_at, exported_at),
        posted_at = IF(p_to = 'posted', p_at, posted_at),
        core_ref = IF(p_to = 'posted', NULLIF(TRIM(p_core_ref), ''), core_ref),
        rvs_no = IF(p_to = 'posted', NULLIF(TRIM(p_rvs_no), ''), rvs_no),
        clearing_exported_at = IF(p_to = 'clearing_exported', p_at, clearing_exported_at),
        cleared_at = IF(p_to = 'cleared', p_at, cleared_at),
        clearing_core_ref = IF(p_to = 'cleared', NULLIF(TRIM(p_core_ref), ''), clearing_core_ref),
        cancelled_at = IF(p_to IN ('void', 'cancelled_after_export'), p_at, cancelled_at)
      WHERE id = p_id;
    INSERT INTO record_history (id, entity_type, entity_id, version, action, changes, changed_by, changed_at,
      request_id)
    VALUES (p_history_id, 'settlement', p_id, v_version + 1, 'update',
      JSON_OBJECT('status', JSON_ARRAY(v_status, p_to)), p_actor, p_at, p_request_id);
    SELECT v_version + 1 AS version;
  END`,
}

/** Roles of spec §10 and §12 for settlements (administrators change them later). */
const NEW_ROLES: { key: string; name: string; description: string; permissions: string[] }[] = [
  {
    key: 'finance_department_head',
    name: 'Head of the Administration–Finance department',
    description: 'Gives the last approval of head office settlements (ກ19).',
    permissions: ['settlement.read', 'payment.read', 'agreement.read'],
  },
]
const GRANTS: Record<string, string[]> = {
  finance_officer: ['settlement.read', 'settlement.export'],
  finance_section_head: ['settlement.read'],
  management: ['settlement.read'],
}

export const settlementsMigrations: MigrationSet = {
  '202611020200_settlements_create': {
    async up(db: Kysely<any>) {
      await withStandardColumns(createTable(db, 'settlements'))
        .addColumn('agreement_id', uuidType, (c) => c.notNull().references('agreements.id'))
        .addColumn('payment_id', uuidType, (c) => c.notNull().references('payments.id'))
        .addColumn('branch_code', sql`char(6)`, (c) => c.notNull())
        .addColumn('status', sql`varchar(24)`, (c) => c.notNull().defaultTo('draft'))
        .addColumn('zone_kind', sql`varchar(10)`, (c) => c.notNull())
        .addColumn('currency', sql`char(3)`, (c) => c.notNull())
        // Copied from the payment's advance item when the settlement is created; not editable (ກ29).
        .addColumn('advance', money, (c) => c.notNull())
        .addColumn('holder_eid', sql`varchar(5)`, (c) => c.notNull())
        .addColumn('filed_by_eid', sql`varchar(5)`, (c) => c.notNull())
        .addColumn('case_kind', sql`varchar(12)`)
        .addColumn('total', money, (c) => c.notNull().defaultTo(0))
        .addColumn('remaining', money, (c) => c.notNull())
        .addColumn('due_date', sql`date`, (c) => c.notNull())
        .addColumn('leader_eid', sql`varchar(5)`)
        .addColumn('late_reason', sql`varchar(500)`)
        .addColumn('submitted_at', datetimeType)
        .addColumn('approved_at', datetimeType)
        .addColumn('exported_at', datetimeType)
        .addColumn('posted_at', datetimeType)
        .addColumn('core_ref', sql`varchar(50)`)
        .addColumn('rvs_no', sql`varchar(30)`)
        .addColumn('clearing_exported_at', datetimeType)
        .addColumn('cleared_at', datetimeType)
        .addColumn('clearing_core_ref', sql`varchar(50)`)
        .addColumn('cancelled_at', datetimeType)
        // One live settlement per agreement; a voided one's agreement may be settled again.
        .addColumn('agreement_live', uuidType, (c) =>
          c.generatedAlwaysAs(sql`IF(status <> 'void', agreement_id, NULL)`).stored(),
        )
        .addCheckConstraint('ck_settlements_status', inCheck('status', SETTLEMENT_STATUSES))
        .addCheckConstraint('ck_settlements_zone_kind', inCheck('zone_kind', ['domestic', 'border', 'overseas']))
        .addCheckConstraint('ck_settlements_currency', inCheck('currency', ['LAK', 'USD']))
        .addCheckConstraint('ck_settlements_case_kind', sql`case_kind IS NULL OR ${inCheck('case_kind', CASE_KINDS)}`)
        .addUniqueConstraint('uq_settlements_agreement_live', ['agreement_live'])
        .execute()
      await db.schema
        .createIndex('ix_settlements_branch_status')
        .on('settlements')
        .columns(['branch_code', 'status'])
        .execute()
      await db.schema.createIndex('ix_settlements_agreement').on('settlements').column('agreement_id').execute()

      await createTable(db, 'settlement_lines')
        .addColumn('id', uuidType, (c) => c.primaryKey().notNull())
        .addColumn('settlement_id', uuidType, (c) => c.notNull().references('settlements.id').onDelete('cascade'))
        .addColumn('sort_order', sql`int`, (c) => c.notNull())
        .addColumn('description', sql`varchar(300)`, (c) => c.notNull())
        .addColumn('expense_type', sql`varchar(4)`)
        .addColumn('currency', sql`char(3)`, (c) => c.notNull())
        .addColumn('amount', money, (c) => c.notNull())
        .addColumn('cross_rate', sql`decimal(15,6)`)
        .addColumn('settled_amount', money, (c) => c.notNull())
        .addColumn('receipt_file_id', uuidType)
        .addColumn('no_receipt_reason', sql`varchar(500)`)
        .addColumn('rate_proof_file_id', uuidType)
        .addCheckConstraint(
          'ck_settlement_lines_expense_type',
          sql`expense_type IS NULL OR ${inCheck('expense_type', EXPENSE_TYPES)}`,
        )
        .addCheckConstraint('ck_settlement_lines_amount', sql`amount > 0 AND settled_amount >= 0`)
        .addCheckConstraint('ck_settlement_lines_receipt', sql`receipt_file_id IS NOT NULL OR no_receipt_reason IS NOT NULL`)
        .execute()
      await db.schema
        .createIndex('ix_settlement_lines_settlement')
        .on('settlement_lines')
        .columns(['settlement_id', 'sort_order'])
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
