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
import { AGREEMENT_STATUSES, FORM_TYPES, POLICY_OPTIONS } from './types.ts'

const STAMP_IN = `IN p_actor BINARY(16), IN p_at DATETIME(3), IN p_request_id VARCHAR(64), IN p_history_id BINARY(16)`

const PROCEDURES = {
  // REF counter per year (spec §8, ກ12): the row lock of the upsert serialises concurrent saves.
  agreements_next_ref: `CREATE PROCEDURE agreements_next_ref(IN p_year SMALLINT)
  BEGIN
    INSERT INTO agreement_ref_counters (year, last_value) VALUES (p_year, LAST_INSERT_ID(1))
      ON DUPLICATE KEY UPDATE last_value = LAST_INSERT_ID(last_value + 1);
    SELECT CONCAT('TA-', p_year, '-', LPAD(LAST_INSERT_ID(), 6, '0')) AS ref;
  END`,

  // Status changes (spec §8): draft → in_approval → approved, back to draft on return, cancel from any live status.
  agreements_transition: `CREATE PROCEDURE agreements_transition(IN p_id BINARY(16), IN p_version INT UNSIGNED,
    IN p_to VARCHAR(16), IN p_reason VARCHAR(500), ${STAMP_IN})
  BEGIN
    DECLARE v_version INT UNSIGNED;
    DECLARE v_status VARCHAR(16);
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_version = NULL;
    SELECT version, status INTO v_version, v_status FROM agreements WHERE id = p_id FOR UPDATE;
    IF v_version IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'resource.not_found'; END IF;
    IF v_version <> p_version THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'resource.stale_version'; END IF;
    IF NOT ((v_status = 'draft' AND p_to = 'in_approval')
        OR (v_status = 'in_approval' AND p_to IN ('draft', 'approved'))
        OR (v_status IN ('draft', 'in_approval', 'approved') AND p_to = 'cancelled')) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'agreements.bad_transition';
    END IF;
    IF p_to = 'cancelled' AND (p_reason IS NULL OR TRIM(p_reason) = '') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'agreements.reason_required';
    END IF;
    UPDATE agreements
      SET status = p_to, version = v_version + 1, updated_at = p_at, updated_by = p_actor,
        submitted_at = IF(p_to = 'in_approval', p_at, submitted_at),
        cancel_reason = IF(p_to = 'cancelled', TRIM(p_reason), cancel_reason),
        cancelled_at = IF(p_to = 'cancelled', p_at, cancelled_at),
        cancelled_by = IF(p_to = 'cancelled', p_actor, cancelled_by)
      WHERE id = p_id;
    INSERT INTO record_history (id, entity_type, entity_id, version, action, changes, changed_by, changed_at,
      request_id)
    VALUES (p_history_id, 'agreement', p_id, v_version + 1, 'update',
      IF(p_to = 'cancelled',
        JSON_OBJECT('status', JSON_ARRAY(v_status, p_to), 'cancelReason', JSON_ARRAY(NULL, TRIM(p_reason))),
        JSON_OBJECT('status', JSON_ARRAY(v_status, p_to))),
      p_actor, p_at, p_request_id);
    SELECT v_version + 1 AS version;
  END`,
}

/** Roles of spec §12 that plan 3 needs, with their starting permissions (administrators change them later). */
const ROLES: { key: string; name: string; description: string; permissions: string[] }[] = [
  {
    key: 'hr_officer',
    name: 'HR officer',
    description: 'Enters agreements for their branch (head office: any branch) and submits them.',
    permissions: ['agreement.read', 'agreement.create', 'agreement.cancel', 'hrm_employee.read'],
  },
  {
    key: 'hr_section_head',
    name: 'HR section head',
    description: 'Approval step 2 of agreements of their branch.',
    permissions: ['agreement.read', 'agreement.cancel'],
  },
  {
    key: 'hr_department_head',
    name: 'HR department head',
    description: 'Approval step 3 of agreements of their branch.',
    permissions: ['agreement.read', 'agreement.cancel'],
  },
  {
    key: 'management',
    name: 'Branch or head office management',
    description: 'Last approval step of agreements of their branch.',
    permissions: ['agreement.read', 'agreement.cancel'],
  },
  {
    key: 'finance_officer',
    name: 'Finance officer',
    description: 'Told when an agreement of their branch is approved; calculates the payment.',
    permissions: ['agreement.read', 'agreement.cancel'],
  },
]

export const agreementsMigrations: MigrationSet = {
  '202610290100_agreements_create': {
    async up(db: Kysely<any>) {
      await withStandardColumns(createTable(db, 'agreements'))
        .addColumn('ref', sql`varchar(14)`, (c) => c.notNull().unique())
        .addColumn('form_type', sql`varchar(10)`, (c) => c.notNull())
        .addColumn('subject', sql`varchar(500)`, (c) => c.notNull())
        .addColumn('title', sql`varchar(500)`, (c) => c.notNull())
        .addColumn('reference', sql`varchar(200)`)
        .addColumn('doc_no', sql`varchar(32)`, (c) => c.notNull())
        .addColumn('doc_date', sql`date`, (c) => c.notNull())
        .addColumn('branch_code', sql`char(6)`, (c) => c.notNull())
        .addColumn('travel_from', sql`date`, (c) => c.notNull())
        .addColumn('travel_to', sql`date`, (c) => c.notNull())
        .addColumn('from_province_code', sql`varchar(16)`)
        .addColumn('to_province_code', sql`varchar(16)`)
        .addColumn('province_code', sql`varchar(16)`)
        .addColumn('from_district_code', sql`varchar(16)`)
        .addColumn('to_district_code', sql`varchar(16)`)
        .addColumn('overnight', sql`tinyint(1)`)
        .addColumn('same_day_over50km', sql`tinyint(1)`)
        .addColumn('country_iso2', sql`char(2)`)
        .addColumn('zone_code', sql`varchar(4)`)
        .addColumn('border_route_id', uuidType)
        .addColumn('border_route_other', sql`varchar(200)`)
        .addColumn('policy_option', sql`varchar(30)`, (c) => c.notNull())
        .addColumn('has_advance', sql`tinyint(1)`, (c) => c.notNull())
        .addColumn('status', sql`varchar(16)`, (c) => c.notNull().defaultTo('draft'))
        .addColumn('submitted_at', datetimeType)
        .addColumn('cancel_reason', sql`varchar(500)`)
        .addColumn('cancelled_at', datetimeType)
        .addColumn('cancelled_by', uuidType)
        // One live agreement per Doc.no; a cancelled one's replacement may carry the same paper number (ກ16).
        .addColumn('doc_no_live', sql`varchar(32)`, (c) =>
          c.generatedAlwaysAs(sql`IF(status <> 'cancelled', doc_no, NULL)`).stored(),
        )
        .addCheckConstraint('ck_agreements_form_type', inCheck('form_type', FORM_TYPES))
        .addCheckConstraint('ck_agreements_policy_option', inCheck('policy_option', POLICY_OPTIONS))
        .addCheckConstraint('ck_agreements_status', inCheck('status', AGREEMENT_STATUSES))
        .addUniqueConstraint('uq_agreements_doc_no_live', ['doc_no_live'])
        .execute()
      await db.schema.createIndex('ix_agreements_branch_status').on('agreements').columns(['branch_code', 'status']).execute()
      await db.schema.createIndex('ix_agreements_created_by').on('agreements').column('created_by').execute()
      await db.schema.createIndex('ix_agreements_doc_no').on('agreements').column('doc_no').execute()

      await createTable(db, 'agreement_members')
        .addColumn('id', uuidType, (c) => c.primaryKey().notNull())
        .addColumn('agreement_id', uuidType, (c) => c.notNull().references('agreements.id').onDelete('cascade'))
        .addColumn('sort_order', sql`int`, (c) => c.notNull())
        .addColumn('eid', sql`varchar(5)`, (c) => c.notNull())
        .addColumn('departure_date', sql`date`, (c) => c.notNull())
        .addColumn('return_date', sql`date`, (c) => c.notNull())
        .addColumn('days_subtracted', sql`int`, (c) => c.notNull().defaultTo(0))
        .addColumn('is_leader', sql`tinyint(1)`, (c) => c.notNull().defaultTo(0))
        .addColumn('is_deputy', sql`tinyint(1)`, (c) => c.notNull().defaultTo(0))
        .addColumn('is_advance_holder', sql`tinyint(1)`, (c) => c.notNull().defaultTo(0))
        .addColumn('host_meals', sql`int`, (c) => c.notNull().defaultTo(0))
        .addColumn('private_car_km', sql`int`)
        .addColumn('acting_position_code', sql`varchar(16)`)
        // Snapshot from HRM (spec §5), refreshed on every save and on submission.
        .addColumn('name_lao', sql`varchar(200)`, (c) => c.notNull())
        .addColumn('sname_lao', sql`varchar(200)`, (c) => c.notNull())
        .addColumn('name_eng', sql`varchar(200)`)
        .addColumn('sname_eng', sql`varchar(200)`)
        .addColumn('branch_code', sql`varchar(16)`, (c) => c.notNull())
        .addColumn('department_name', sql`varchar(255)`)
        .addColumn('section_name', sql`varchar(255)`)
        .addColumn('position_code', sql`varchar(16)`)
        .addColumn('position_name', sql`varchar(255)`)
        .addColumn('post_type', sql`int`)
        .addColumn('acting_position_name', sql`varchar(255)`)
        .addColumn('rank_code', sql`varchar(2)`)
        .addColumn('account_lak', sql`varchar(32)`)
        .addColumn('account_usd', sql`varchar(32)`)
        .addUniqueConstraint('uq_agreement_members_eid', ['agreement_id', 'eid'])
        .execute()
      await db.schema.createIndex('ix_agreement_members_eid').on('agreement_members').column('eid').execute()

      await createTable(db, 'agreement_ref_counters')
        .addColumn('year', sql`smallint`, (c) => c.primaryKey())
        .addColumn('last_value', sql`int`, (c) => c.notNull())
        .execute()

      // DDL is not rolled back, so a half-finished earlier run may have left a procedure behind.
      for (const [name, body] of Object.entries(PROCEDURES)) {
        await sql`DROP PROCEDURE IF EXISTS ${sql.id(name)}`.execute(db)
        await sql.raw(body).execute(db)
      }

      const now = new Date()
      for (const r of ROLES) {
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
    },
  },
}
