-- Fixture rows for the HRM test source. Invented people; no real data.
-- HRM keeps DATETIME values in Lao time, so relative times below are computed in +07:00.
SET time_zone = '+07:00';

INSERT INTO hrm_branch (BRANCH_ID, NAME_LA, NAME_EN, STATUS) VALUES
  ('888010', 'ສຳນັກງານໃຫຍ່', 'Head Office', 'Y'),
  ('888020', 'ສາຂານະຄອນຫຼວງ', 'Vientiane Capital Branch', 'Y');

INSERT INTO hrm_department (DEPT_ID, NAME_LA, NAME_EN, STATUS) VALUES
  ('0101', 'ພະແນກບໍລິຫານ-ການເງິນ', 'Administration and Finance Department', 'Y');

INSERT INTO hrm_section (DEPT_ID, SECT_ID, NAME_LA, NAME_EN, IS_DELETE) VALUES
  ('0101', '0201', 'ຂະແໜງການເງິນ', 'Finance Section', 'N');

INSERT INTO hrm_unit (BRANCH_ID, UNIT_ID, FULL_NAME_LA, FULL_NAME_EN) VALUES
  ('888010', '030101', 'ໜ່ວຍງານບັນຊີ', 'Accounting Unit'),
  -- Unit ids repeat across branches in HRM: the key is (BRANCH_ID, UNIT_ID).
  ('888020', '030101', 'ໜ່ວຍບໍລິການສາຂາ', 'Branch Service Unit');

INSERT INTO hrm_position (PostID, PostName, PostNameEng, PostType, PostStatus, PostOrderBy) VALUES
  (12, 'ຫົວໜ້າພະແນກ', 'Head of Department', 7, 'Y', 1),
  (30, 'ວິຊາການ', 'Officer', 9, 'Y', 2);

INSERT INTO hrm_employee
  (EID, NAME_LAO, SNAME_LAO, NAME_ENG, SNAME_ENG, BRANCH_CODE, DEPARTMENT_CODE, SECTION_CODE, UNIT_CODE,
   COMPANY_CODE, POSITION_CODE, WORK_STATUS, IS_DELETE, APPROVED_STATUS) VALUES
  ('10001', 'ສົມພອນ', 'ແກ້ວມະນີ', 'Somphone', 'Keomany', '888010', '0101', '0201', '030101', '00', '12', 1, 'N', 'A'),
  ('10002', 'ບຸນມີ', 'ສີສະຫວັດ', 'Bounmy', 'Sisavath', '888020', '0101', NULL, NULL, '00', '30', 1, 'N', 'A'),
  ('10003', 'ຄຳຫຼ້າ', 'ວົງສາ', 'Khamla', 'Vongsa', '888010', '0101', NULL, NULL, '00', '30', 1, 'Y', 'A'),
  ('10004', 'ນ້ອຍ', 'ພົມມະຈັນ', 'Noy', 'Phommachanh', '888010', '0101', NULL, NULL, '00', '30', 1, 'N', 'P'),
  ('10005', 'ແສງ', 'ໄຊຍະວົງ', 'Saeng', 'Xayavong', '888010', '0101', NULL, NULL, '00', '30', 2, 'N', 'A'),
  ('10006', 'ດາວ', 'ອິນທະວົງ', 'Dao', 'Inthavong', '888010', '0101', NULL, NULL, '01', '30', 1, 'N', 'A');

INSERT INTO hrm_employee_account_currency (eid, ccy, account_no, account_name, is_deleted, created_at) VALUES
  ('10001', 'LAK', '0101-OLD', 'SOMPHONE KEOMANY', 0, '2025-01-01 09:00:00'),
  ('10001', 'LAK', '0101-NEW', 'SOMPHONE KEOMANY', 0, '2026-01-01 09:00:00'),
  ('10001', 'USD', '0102-USD', 'SOMPHONE KEOMANY', 0, '2026-01-01 09:00:00'),
  ('10002', 'LAK', '0201-GONE', 'BOUNMY SISAVATH', 1, '2026-02-01 09:00:00'),
  ('10002', 'LAK', '0201-LAK', 'BOUNMY SISAVATH', 0, '2025-02-01 09:00:00');

INSERT INTO tb_current_login (eid, session_token, start_time, last_act) VALUES
  ('10001', 'fixture-session-10001', NOW(), NOW()),
  -- 10003 is deleted in HRM but still has an HRM session.
  ('10003', 'fixture-session-10003', NOW(), NOW());

INSERT INTO tb_holiday (holiday_date, holiday_desc, status) VALUES
  ('2026-12-02', 'National Day', 'Y');

-- Codes are the plain strings below; HRM stores only their sha256.
INSERT INTO tb_app_handoff (code_hash, eid, created_at, expires_at) VALUES
  (SHA2('valid-10001', 256), '10001', NOW(), '2099-01-01 00:00:00'),
  (SHA2('replay-10001', 256), '10001', NOW(), '2099-01-01 00:00:00'),
  (SHA2('valid-10002', 256), '10002', NOW(), '2099-01-01 00:00:00'),
  (SHA2('sync-10001', 256), '10001', NOW(), '2099-01-01 00:00:00'),
  (SHA2('again-10001', 256), '10001', NOW(), '2099-01-01 00:00:00'),
  (SHA2('swap-10001', 256), '10001', NOW(), '2099-01-01 00:00:00'),
  (SHA2('origin-ok-10001', 256), '10001', NOW(), '2099-01-01 00:00:00'),
  (SHA2('origin-bad-10001', 256), '10001', NOW(), '2099-01-01 00:00:00'),
  (SHA2('valid-10003', 256), '10003', NOW(), '2099-01-01 00:00:00'),
  (SHA2('expired-10001', 256), '10001', '2000-01-01 00:00:00', '2000-01-01 00:01:00'),
  (SHA2('soon-10001', 256), '10001', NOW(), NOW() + INTERVAL 5 MINUTE),
  (SHA2('past-10001', 256), '10001', NOW() - INTERVAL 2 MINUTE, NOW() - INTERVAL 1 MINUTE);
