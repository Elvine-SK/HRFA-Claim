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
  (30, 'ວິຊາການ', 'Officer', 9, 'Y', 2),
  -- PostType 3 has no rank mapping in the app's seed.
  (40, 'ຮອງຫົວໜ້າຂະແໜງ', 'Deputy Head of Section', 3, 'Y', 3);

INSERT INTO hrm_province (PROVINCE_CODE, COUNTRY_CODE, PROVINCE_LA, PROVINCE) VALUES
  ('01', 'LA', 'ນະຄອນຫຼວງວຽງຈັນ', 'Vientiane Prefecture'),
  ('06', 'LA', 'ແຂວງ ຫຼວງພະບາງ', 'Luang Prabang Province'),
  ('13', 'LA', 'ແຂວງ ສະຫວັນນະເຂດ', 'Savannakhet Province'),
  -- Not Laos: never listed.
  ('01', 'TH', 'ບາງກອກ', 'Bangkok');

INSERT INTO hrm_district (PROVINCE_CODE, DISTRICT_CODE, NAME_LA, NAME_EN) VALUES
  ('01', '0101', 'ເມືອງ ຈັນທະບູລີ', 'Chanthabuly District'),
  ('01', '0102', 'ເມືອງ ສີໂຄດຕະບອງ', 'Sikhottabong District'),
  ('06', '0601', 'ເມືອງ ຫຼວງພະບາງ', 'Luang Prabang District'),
  ('06', '0602', 'ເມືອງ ຊຽງເງິນ', 'Xiengngeun District'),
  ('13', '1301', 'ເມືອງ ໄກສອນ ພົມວິຫານ', 'Kaysone Phomvihane District'),
  ('13', '1302', 'ເມືອງ ອຸທຸມພອນ', 'Outhoumphone District');

INSERT INTO hrm_employee
  (EID, NAME_LAO, SNAME_LAO, NAME_ENG, SNAME_ENG, BRANCH_CODE, DEPARTMENT_CODE, SECTION_CODE, UNIT_CODE,
   COMPANY_CODE, POSITION_CODE, WORK_STATUS, IS_DELETE, APPROVED_STATUS) VALUES
  ('10001', 'ສົມພອນ', 'ແກ້ວມະນີ', 'Somphone', 'Keomany', '888010', '0101', '0201', '030101', '00', '12', 1, 'N', 'A'),
  ('10002', 'ບຸນມີ', 'ສີສະຫວັດ', 'Bounmy', 'Sisavath', '888020', '0101', NULL, NULL, '00', '30', 1, 'N', 'A'),
  ('10003', 'ຄຳຫຼ້າ', 'ວົງສາ', 'Khamla', 'Vongsa', '888010', '0101', NULL, NULL, '00', '30', 1, 'Y', 'A'),
  ('10004', 'ນ້ອຍ', 'ພົມມະຈັນ', 'Noy', 'Phommachanh', '888010', '0101', NULL, NULL, '00', '30', 1, 'N', 'P'),
  ('10005', 'ແສງ', 'ໄຊຍະວົງ', 'Saeng', 'Xayavong', '888010', '0101', NULL, NULL, '00', '30', 2, 'N', 'A'),
  ('10006', 'ດາວ', 'ອິນທະວົງ', 'Dao', 'Inthavong', '888010', '0101', NULL, NULL, '01', '30', 1, 'N', 'A'),
  -- Agreement tests: head office (888010) HR officer, section head, department head, management.
  ('10010', 'ມະນີ', 'ສີລາ', 'Manee', 'Sila', '888010', '0101', '0201', NULL, '00', '30', 1, 'N', 'A'),
  ('10011', 'ພອນ', 'ສະຫວັນ', 'Phone', 'Savanh', '888010', '0101', '0201', NULL, '00', '40', 1, 'N', 'A'),
  ('10012', 'ຈັນ', 'ທະວີ', 'Chanh', 'Thavy', '888010', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10013', 'ສຸກ', 'ມາລາ', 'Souk', 'Mala', '888010', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  -- Branch 888020: HR officer (LAK account only) and its approvers.
  ('10020', 'ແກ້ວ', 'ພູມີ', 'Keo', 'Phoumy', '888020', '0101', NULL, NULL, '00', '30', 1, 'N', 'A'),
  ('10021', 'ບົວ', 'ລະພາ', 'Boua', 'Lapha', '888020', '0101', NULL, NULL, '00', '40', 1, 'N', 'A'),
  ('10022', 'ສີ', 'ວົງໄຊ', 'Sy', 'Vongxay', '888020', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10023', 'ຄຳ', 'ແສງ', 'Kham', 'Saeng', '888020', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  -- Approval tests (their own people, so roles granted there do not reach other test files).
  -- Head office: HR officer, section head (unmapped PostType 3), department head, management, finance, an officer.
  ('10030', 'ວັນ', 'ໄຊ', 'Vanh', 'Xay', '888010', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10031', 'ລີ', 'ພອນ', 'Ly', 'Phone', '888010', '0101', NULL, NULL, '00', '40', 1, 'N', 'A'),
  ('10032', 'ນາງ', 'ຄຳ', 'Nang', 'Kham', '888010', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10033', 'ທອງ', 'ດີ', 'Thong', 'Dee', '888010', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10034', 'ເພັດ', 'ສະໄໝ', 'Phet', 'Samai', '888010', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10035', 'ອ່ອນ', 'ຈັນ', 'On', 'Chanh', '888010', '0101', NULL, NULL, '00', '30', 1, 'N', 'A'),
  -- Branch 888020: HR officer (LAK account only), section head, department head, management, finance.
  ('10040', 'ຫຼ້າ', 'ວົງ', 'La', 'Vong', '888020', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10041', 'ແພງ', 'ສີ', 'Phaeng', 'Sy', '888020', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10042', 'ຕຸ້ຍ', 'ມີ', 'Tui', 'Mee', '888020', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10043', 'ບຸນ', 'ຕາ', 'Boun', 'Ta', '888020', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10044', 'ສອນ', 'ໄຊ', 'Sone', 'Xay', '888020', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  -- Payment tests. Head office: finance officer, HR officer, two members; branch 888020: finance officer, HR officer.
  ('10050', 'ດວງ', 'ສີ', 'Duang', 'Sy', '888010', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10051', 'ມາລີ', 'ວົງ', 'Malee', 'Vong', '888010', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10052', 'ວັນ', 'ໄຊ', 'Vanh', 'Xay', '888010', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10053', 'ແສງ', 'ດາ', 'Saeng', 'Da', '888010', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10060', 'ບຸນ', 'ມີ', 'Boun', 'Mee', '888020', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10061', 'ຄຳ', 'ພອນ', 'Kham', 'Phone', '888020', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  -- Payment approval tests (head office): finance officer, finance section head, HR officer, member.
  ('10070', 'ສົມ', 'ຈິດ', 'Som', 'Chit', '888010', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10071', 'ຄູນ', 'ທອງ', 'Khoun', 'Thong', '888010', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10072', 'ດາ', 'ວີ', 'Da', 'Vee', '888010', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10073', 'ພອນ', 'ໄຊ', 'Phone', 'Xai', '888010', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  -- Export tests: head office finance officer, HR officer, member; branch 888020 finance officer.
  ('10080', 'ບຸນທັນ', 'ແກ້ວ', 'Bounthan', 'Keo', '888010', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10081', 'ນາລີ', 'ສຸກ', 'Nalee', 'Souk', '888010', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10082', 'ວັນ', 'ໄຊ', 'Vanh', 'Xay', '888010', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10083', 'ສີ', 'ພອນ', 'Sy', 'Phone', '888020', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  -- auth-hrm: an employee whose EID a local account already uses as its username.
  ('10090', 'ເອກ', 'ຊ້ຳ', 'Ek', 'Sam', '888010', '0101', NULL, NULL, '00', '30', 1, 'N', 'A'),
  -- Plan 5 (settlements)
  ('10100', 'ສົມສັກ', 'ພົມມາ', 'Somsak', 'Phomma', '888010', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10101', 'ນິດ', 'ສາຍ', 'Nid', 'Sai', '888010', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10102', 'ທອງ', 'ດີ', 'Thong', 'Dee', '888010', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10103', 'ບຸນ', 'ມາ', 'Boun', 'Ma', '888010', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10104', 'ພອນ', 'ໃສ', 'Phone', 'Sai', '888010', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10105', 'ຄຳ', 'ແສງ', 'Kham', 'Saeng', '888010', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10106', 'ວິໄລ', 'ພອນ', 'Vilay', 'Phone', '888010', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10107', 'ສຸກ', 'ສະຫວັນ', 'Souk', 'Savanh', '888010', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10110', 'ແກ້ວ', 'ມະນີ', 'Keo', 'Many', '888020', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10111', 'ຈັນ', 'ທະລາ', 'Chanh', 'Thala', '888020', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10112', 'ໄຊ', 'ຍະ', 'Xay', 'Ya', '888020', '0101', NULL, NULL, '00', '12', 1, 'N', 'A'),
  ('10113', 'ດາວ', 'ເຮືອງ', 'Dao', 'Heuang', '888020', '0101', NULL, NULL, '00', '12', 1, 'N', 'A');

INSERT INTO hrm_employee_account_currency (eid, ccy, account_no, account_name, is_deleted, created_at) VALUES
  ('10001', 'LAK', '0101-OLD', 'SOMPHONE KEOMANY', 0, '2025-01-01 09:00:00'),
  ('10001', 'LAK', '0101-NEW', 'SOMPHONE KEOMANY', 0, '2026-01-01 09:00:00'),
  ('10001', 'USD', '0102-USD', 'SOMPHONE KEOMANY', 0, '2026-01-01 09:00:00'),
  ('10002', 'LAK', '0201-GONE', 'BOUNMY SISAVATH', 1, '2026-02-01 09:00:00'),
  ('10002', 'LAK', '0201-LAK', 'BOUNMY SISAVATH', 0, '2025-02-01 09:00:00'),
  ('10010', 'LAK', '1010-LAK', 'MANEE SILA', 0, '2026-01-01 09:00:00'),
  ('10010', 'USD', '1010-USD', 'MANEE SILA', 0, '2026-01-01 09:00:00'),
  ('10011', 'LAK', '1011-LAK', 'PHONE SAVANH', 0, '2026-01-01 09:00:00'),
  ('10011', 'USD', '1011-USD', 'PHONE SAVANH', 0, '2026-01-01 09:00:00'),
  ('10012', 'LAK', '1012-LAK', 'CHANH THAVY', 0, '2026-01-01 09:00:00'),
  ('10012', 'USD', '1012-USD', 'CHANH THAVY', 0, '2026-01-01 09:00:00'),
  ('10013', 'LAK', '1013-LAK', 'SOUK MALA', 0, '2026-01-01 09:00:00'),
  ('10013', 'USD', '1013-USD', 'SOUK MALA', 0, '2026-01-01 09:00:00'),
  ('10020', 'LAK', '2020-LAK', 'KEO PHOUMY', 0, '2026-01-01 09:00:00'),
  ('10030', 'LAK', '1030-LAK', 'VANH XAY', 0, '2026-01-01 09:00:00'),
  ('10030', 'USD', '1030-USD', 'VANH XAY', 0, '2026-01-01 09:00:00'),
  ('10031', 'LAK', '1031-LAK', 'LY PHONE', 0, '2026-01-01 09:00:00'),
  ('10032', 'LAK', '1032-LAK', 'NANG KHAM', 0, '2026-01-01 09:00:00'),
  ('10032', 'USD', '1032-USD', 'NANG KHAM', 0, '2026-01-01 09:00:00'),
  ('10035', 'LAK', '1035-LAK', 'ON CHANH', 0, '2026-01-01 09:00:00'),
  ('10040', 'LAK', '2040-LAK', 'LA VONG', 0, '2026-01-01 09:00:00'),
  ('10050', 'LAK', '0050-LAK', 'DUANG SY', 0, '2026-01-01 09:00:00'),
  ('10050', 'USD', '0050-USD', 'DUANG SY', 0, '2026-01-01 09:00:00'),
  ('10051', 'LAK', '0051-LAK', 'MALEE VONG', 0, '2026-01-01 09:00:00'),
  ('10051', 'USD', '0051-USD', 'MALEE VONG', 0, '2026-01-01 09:00:00'),
  ('10052', 'LAK', '0052-LAK', 'VANH XAY', 0, '2026-01-01 09:00:00'),
  ('10052', 'USD', '0052-USD', 'VANH XAY', 0, '2026-01-01 09:00:00'),
  ('10053', 'LAK', '0053-LAK', 'SAENG DA', 0, '2026-01-01 09:00:00'),
  ('10053', 'USD', '0053-USD', 'SAENG DA', 0, '2026-01-01 09:00:00'),
  ('10060', 'LAK', '0060-LAK', 'BOUN MEE', 0, '2026-01-01 09:00:00'),
  ('10060', 'USD', '0060-USD', 'BOUN MEE', 0, '2026-01-01 09:00:00'),
  ('10061', 'LAK', '0061-LAK', 'KHAM PHONE', 0, '2026-01-01 09:00:00'),
  ('10061', 'USD', '0061-USD', 'KHAM PHONE', 0, '2026-01-01 09:00:00'),
  ('10070', 'LAK', '0070-LAK', 'SOM CHIT', 0, '2026-01-01 09:00:00'),
  ('10070', 'USD', '0070-USD', 'SOM CHIT', 0, '2026-01-01 09:00:00'),
  ('10071', 'LAK', '0071-LAK', 'KHOUN THONG', 0, '2026-01-01 09:00:00'),
  ('10071', 'USD', '0071-USD', 'KHOUN THONG', 0, '2026-01-01 09:00:00'),
  ('10072', 'LAK', '0072-LAK', 'DA VEE', 0, '2026-01-01 09:00:00'),
  ('10072', 'USD', '0072-USD', 'DA VEE', 0, '2026-01-01 09:00:00'),
  ('10073', 'LAK', '0073-LAK', 'PHONE XAI', 0, '2026-01-01 09:00:00'),
  ('10073', 'USD', '0073-USD', 'PHONE XAI', 0, '2026-01-01 09:00:00'),
  ('10080', 'LAK', '0080-LAK', 'BOUNTHAN KEO', 0, '2026-01-01 09:00:00'),
  ('10080', 'USD', '0080-USD', 'BOUNTHAN KEO', 0, '2026-01-01 09:00:00'),
  ('10081', 'LAK', '0081-LAK', 'NALEE SOUK', 0, '2026-01-01 09:00:00'),
  ('10081', 'USD', '0081-USD', 'NALEE SOUK', 0, '2026-01-01 09:00:00'),
  ('10082', 'LAK', '0082-LAK', 'VANH XAY', 0, '2026-01-01 09:00:00'),
  ('10082', 'USD', '0082-USD', 'VANH XAY', 0, '2026-01-01 09:00:00'),
  ('10083', 'LAK', '0083-LAK', 'SY PHONE', 0, '2026-01-01 09:00:00'),
  ('10083', 'USD', '0083-USD', 'SY PHONE', 0, '2026-01-01 09:00:00'),
  ('10100', 'LAK', '0100-LAK', 'SOMSAK PHOMMA', 0, '2026-01-01 09:00:00'),
  ('10100', 'USD', '0100-USD', 'SOMSAK PHOMMA', 0, '2026-01-01 09:00:00'),
  ('10101', 'LAK', '0101-LAK', 'NID SAI', 0, '2026-01-01 09:00:00'),
  ('10101', 'USD', '0101-USD', 'NID SAI', 0, '2026-01-01 09:00:00'),
  ('10102', 'LAK', '0102-LAK', 'THONG DEE', 0, '2026-01-01 09:00:00'),
  ('10102', 'USD', '0102-USD', 'THONG DEE', 0, '2026-01-01 09:00:00'),
  ('10103', 'LAK', '0103-LAK', 'BOUN MA', 0, '2026-01-01 09:00:00'),
  ('10103', 'USD', '0103-USD', 'BOUN MA', 0, '2026-01-01 09:00:00'),
  ('10104', 'LAK', '0104-LAK', 'PHONE SAI', 0, '2026-01-01 09:00:00'),
  ('10104', 'USD', '0104-USD', 'PHONE SAI', 0, '2026-01-01 09:00:00'),
  ('10105', 'LAK', '0105-LAK', 'KHAM SAENG', 0, '2026-01-01 09:00:00'),
  ('10105', 'USD', '0105-USD', 'KHAM SAENG', 0, '2026-01-01 09:00:00'),
  ('10106', 'LAK', '0106-LAK', 'VILAY PHONE', 0, '2026-01-01 09:00:00'),
  ('10106', 'USD', '0106-USD', 'VILAY PHONE', 0, '2026-01-01 09:00:00'),
  ('10107', 'LAK', '0107-LAK', 'SOUK SAVANH', 0, '2026-01-01 09:00:00'),
  ('10107', 'USD', '0107-USD', 'SOUK SAVANH', 0, '2026-01-01 09:00:00'),
  ('10110', 'LAK', '0110-LAK', 'KEO MANY', 0, '2026-01-01 09:00:00'),
  ('10110', 'USD', '0110-USD', 'KEO MANY', 0, '2026-01-01 09:00:00'),
  ('10111', 'LAK', '0111-LAK', 'CHANH THALA', 0, '2026-01-01 09:00:00'),
  ('10111', 'USD', '0111-USD', 'CHANH THALA', 0, '2026-01-01 09:00:00'),
  ('10112', 'LAK', '0112-LAK', 'XAY YA', 0, '2026-01-01 09:00:00'),
  ('10112', 'USD', '0112-USD', 'XAY YA', 0, '2026-01-01 09:00:00'),
  ('10113', 'LAK', '0113-LAK', 'DAO HEUANG', 0, '2026-01-01 09:00:00'),
  ('10113', 'USD', '0113-USD', 'DAO HEUANG', 0, '2026-01-01 09:00:00');

INSERT INTO tb_current_login (eid, session_token, start_time, last_act) VALUES
  ('10001', 'fixture-session-10001', NOW(), NOW()),
  -- 10003 is deleted in HRM but still has an HRM session.
  ('10003', 'fixture-session-10003', NOW(), NOW());

INSERT INTO tb_holiday (holiday_date, holiday_desc, status) VALUES
  ('2026-12-02', 'National Day', 'Y'),
  ('2033-11-07', 'Plan 5 test holiday', 'Y'),
  ('2033-11-21', 'Plan 5 test holiday, switched off', 'N'),
  ('2035-03-08', 'Plan 5 test holiday', 'Y');

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
  (SHA2('taken-10090', 256), '10090', NOW(), '2099-01-01 00:00:00'),
  (SHA2('expired-10001', 256), '10001', '2000-01-01 00:00:00', '2000-01-01 00:01:00'),
  (SHA2('soon-10001', 256), '10001', NOW(), NOW() + INTERVAL 5 MINUTE),
  (SHA2('past-10001', 256), '10001', NOW() - INTERVAL 2 MINUTE, NOW() - INTERVAL 1 MINUTE);
