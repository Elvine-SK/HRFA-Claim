-- One-time sign-in codes from the HRM portal to HR-FAM (docs/hrm-handoff.md).
-- HRM inserts a row when a user clicks the HR-FAM tile and deletes rows older than one day.
-- HR-FAM only reads this table: it records redeemed codes in its own database.
CREATE TABLE IF NOT EXISTS `tb_app_handoff` (
  `code_hash` CHAR(64) NOT NULL COMMENT 'sha256 of the code, lower-case hex',
  `eid` VARCHAR(5) NOT NULL COMMENT 'hrm_employee.EID',
  `created_at` DATETIME NOT NULL,
  `expires_at` DATETIME NOT NULL COMMENT 'created_at + 60 seconds, HRM local time',
  PRIMARY KEY (`code_hash`),
  KEY `idx_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
