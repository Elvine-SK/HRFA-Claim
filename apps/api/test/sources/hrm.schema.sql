-- HRM (bcel_hrm_v3) tables the app reads: structure only, from the dump of 2026-10-13 (host 10.0.2.116,
-- MariaDB 11.4). hrm_employee_account_currency is the current shape from personnel_account_FROM_HRM_V3.sql;
-- tb_app_handoff is the table the HRM team adds (tooling/hrm/tb_app_handoff.sql). Never data.

CREATE TABLE `hrm_employee` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `EID` varchar(5) DEFAULT NULL COMMENT 'ລະຫັດພະນັກງານໃໝ່',
  `OLD_ID` varchar(100) DEFAULT NULL COMMENT 'ລະຫັດພະນັກງານເກົ່າ',
  `TITLE_ID` varchar(255) DEFAULT NULL COMMENT 'ຫົວຂໍ້',
  `NAME_LAO` varchar(255) DEFAULT NULL COMMENT 'ຊື່ ພາສາລາວ',
  `NAME_ENG` varchar(255) DEFAULT NULL COMMENT 'ຊື່ ພາສາອັງກິດ',
  `SNAME_LAO` varchar(255) DEFAULT NULL COMMENT 'ນາມສະກຸນ ພາສາລາວ',
  `SNAME_ENG` varchar(255) DEFAULT NULL COMMENT 'ນາມສະກຸນ ພາສາອັງກິດ',
  `ORIGIN_BRANCH` varchar(6) DEFAULT '888010' COMMENT 'ສາຂາທີ່ເຂົ້າເຮັດວຽກທຳອິດ',
  `BRANCH_CODE` varchar(6) DEFAULT '888010' COMMENT 'ສຳນັກງານໃຫຍ່ / ສາຂາ',
  `DEPARTMENT_CODE` varchar(4) DEFAULT NULL COMMENT 'ພະແນກ',
  `SECTION_CODE` varchar(4) DEFAULT NULL COMMENT 'ຂະແໜງ',
  `UNIT_CODE` varchar(6) DEFAULT NULL COMMENT 'ໜ່ວຍງານ / ໜ່ວຍບໍລິການ',
  `COMPANY_CODE` varchar(2) DEFAULT '00' COMMENT 'ບໍລິສັດ',
  `POSITION_CODE` varchar(2) DEFAULT NULL COMMENT 'ຕຳແໜ່ງ',
  `WORK_STATUS` int(11) DEFAULT NULL COMMENT 'ສະຖານະເຮັດວຽກ',
  `SALARY_LV` int(11) DEFAULT NULL COMMENT 'ຂັ້ນເງີນເດືອນ',
  `POLITICE_LV` int(11) DEFAULT NULL COMMENT 'ລະດັບທິດສະດີການເມືອງ',
  `CREATED_BY` varchar(5) DEFAULT NULL,
  `CREATED_DATE` datetime DEFAULT NULL,
  `LAST_UPDATED_BY` varchar(5) DEFAULT NULL,
  `LAST_UPDATED_DATE` datetime DEFAULT NULL,
  `DELETED_BY` varchar(5) DEFAULT NULL,
  `DELETED_DATE` datetime DEFAULT NULL,
  `IS_DELETE` char(1) DEFAULT 'N',
  `APPROVED_STATUS` varchar(2) DEFAULT 'P' COMMENT 'N: new draft, P: pending, W: waiting for update, A: approved',
  `APPROVED_DATE` datetime DEFAULT NULL,
  `APPROVED_REMARK` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID`) USING BTREE,
  UNIQUE KEY `idx_unq_eid` (`EID`),
  KEY `idx_emp_aud` (`EID`,`IS_DELETE`,`APPROVED_STATUS`),
  KEY `idx_eid_dsu_fk` (`EID`,`DEPARTMENT_CODE`,`SECTION_CODE`,`UNIT_CODE`),
  KEY `idx_eid_dh` (`EID`,`COMPANY_CODE`,`WORK_STATUS`,`IS_DELETE`,`APPROVED_STATUS`),
  KEY `idx_dash` (`EID`,`BRANCH_CODE`,`DEPARTMENT_CODE`,`SECTION_CODE`,`UNIT_CODE`,`COMPANY_CODE`,`POSITION_CODE`,`WORK_STATUS`,`IS_DELETE`,`APPROVED_STATUS`),
  KEY `idx_md_p` (`EID`,`IS_DELETE`,`APPROVED_STATUS`)
) ENGINE=InnoDB AUTO_INCREMENT=15021 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `hrm_position` (
  `PostID` int(2) unsigned NOT NULL AUTO_INCREMENT COMMENT 'ID',
  `PostName` varchar(225) DEFAULT NULL COMMENT 'ຊື່ຕຳແໜ່ງ',
  `PostNameEng` varchar(255) DEFAULT NULL,
  `PostFees` decimal(18,0) DEFAULT NULL COMMENT 'ເງິນປະຈຳຕຳແໜ່ງ',
  `PostType` smallint(6) DEFAULT NULL COMMENT 'ປະເພດຕຳແໜ່ງ',
  `PostStatus` char(1) DEFAULT 'Y',
  `PostOrderBy` int(11) DEFAULT NULL,
  `PostIndex` varchar(255) DEFAULT NULL COMMENT 'ຄໍານໍາໜ້າ',
  `PostLevel` int(11) DEFAULT 999 COMMENT 'ໃຊ້ໃນການ EVL and Gen Per',
  PRIMARY KEY (`PostID`),
  KEY `idx_prof_1` (`PostID`,`PostType`)
) ENGINE=InnoDB AUTO_INCREMENT=64 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `hrm_province` (
  `PROVINCE_CODE` varchar(255) NOT NULL,
  `COUNTRY_CODE` varchar(255) NOT NULL,
  `PROVINCE_LA` varchar(255) DEFAULT NULL,
  `ABBR_LA_2L` varchar(255) DEFAULT NULL,
  `ABBR_LA_3L` varchar(255) DEFAULT NULL,
  `PROVINCE` varchar(255) DEFAULT NULL,
  `ABBR_EN_2L` varchar(255) DEFAULT NULL,
  `ABBR_EN_3L` varchar(255) DEFAULT NULL,
  `POPULATION` varchar(255) DEFAULT NULL,
  `AREA` varchar(255) DEFAULT NULL,
  `ISO` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`PROVINCE_CODE`,`COUNTRY_CODE`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `hrm_district` (
  `PROVINCE_CODE` varchar(255) NOT NULL,
  `DISTRICT_CODE` varchar(255) NOT NULL,
  `NAME_LA` varchar(255) DEFAULT NULL,
  `NAME_EN` varchar(255) DEFAULT NULL,
  `ABBRE_EN_3L` varchar(255) DEFAULT NULL,
  `POPULATION` varchar(255) DEFAULT NULL,
  `AREA` varchar(255) DEFAULT NULL,
  `ISO_NAME` varchar(255) DEFAULT NULL,
  `ABBRE_LA` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`PROVINCE_CODE`,`DISTRICT_CODE`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `hrm_branch` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `BRANCH_ID` varchar(255) DEFAULT NULL COMMENT 'ລະຫັດສາຂາ',
  `NAME_LA` varchar(255) DEFAULT NULL COMMENT 'ຊື່ເຕັມພາສາລາວ',
  `SHORT_NAME_LA` varchar(255) DEFAULT NULL COMMENT 'ຊື່ພາສາລາວ',
  `ABBR_LA` varchar(255) DEFAULT NULL COMMENT 'ຊື່ຕົວຫຍໍ້ພາສາລາວ ເກັບ 3 ຕົວອັກສອນ',
  `NAME_EN` varchar(255) DEFAULT NULL COMMENT 'ຊື່ເຕັມພາສາອັງກິດ',
  `CP_NAME_EN` varchar(255) DEFAULT NULL COMMENT 'ຊື່ເຕັມອັງກິດແບບອັກສອນໃຫຍ່',
  `ABBR_EN` varchar(255) DEFAULT NULL COMMENT 'ຊື່ຕົວຫຍໍ້ອັງກິດ ເກັບ 3 ຕົວອັກສອນ',
  `TEL` varchar(255) DEFAULT NULL COMMENT 'ເບີໂທສາຂາ',
  `EMAIL` varchar(255) DEFAULT NULL COMMENT 'ອີເມວສາຂາ',
  `AGREED_OPEN_NO` varchar(255) DEFAULT NULL COMMENT 'ເລກທີຂໍ້ຕົກລົງສ້າງຕັ້ງສາຂາ',
  `ISSUE_DATE` date DEFAULT NULL COMMENT 'ວັນທີຂໍ້ຕົກລົງສ້າງຕັ້ງສາຂາ',
  `OPEN_DATE` date DEFAULT NULL COMMENT 'ວັນທີເປີດດຳເນີນການຕົວຈິງຂອງສາຂາ (ເປີດບໍລິການລູກຄ້າ)',
  `AGREED_CLOSE_NO` varchar(255) DEFAULT NULL COMMENT 'ເລກທີຂໍ້ຕົກລົງປິດສາຂາ',
  `CLOSE_DATE` date DEFAULT NULL COMMENT 'ຂໍ້ຕົກລົງປິດສະບັບລົງວັນທີ',
  `PROVINCE_CODE` varchar(255) DEFAULT NULL COMMENT 'ສາຂາຕັ້ງຢູ່ແຂວງໃດ ເກັບລະຫັດແຂວງ (ດຶງມາຈາຕາລາງແຂວງ)',
  `DISTRICT_CODE` varchar(255) DEFAULT NULL COMMENT 'ສາຂາຕັ້ງຢູ່ເມືອງໃດ ເກັບລະຫັດເມືອງ (ດຶງມາຈາກຕາລາງເມືອງ)',
  `VILLAGE_CODE` varchar(255) DEFAULT NULL COMMENT 'ສາຂາຕັ້ງຢູ່ບ້ານໃດ ເກັບລະຫັດບ້ານ (ດຶງມາຈາກຕາລາງບ້ານ',
  `TYPE_ID` varchar(255) DEFAULT NULL COMMENT 'ລະຫັດປະເພດ: ສາຂາ ຫຼື ສຳນັກງານໃຫຍ່',
  `STATUS` varchar(255) DEFAULT NULL COMMENT 'ສະຖານະ (ເປິດ, ປິດ)',
  `DETAIL` varchar(255) DEFAULT NULL COMMENT 'ລາຍລະອຽດ',
  `CREATED_BY` varchar(5) DEFAULT NULL,
  `CREATED_DATE` datetime DEFAULT NULL,
  `LAST_UPDATED_BY` varchar(5) DEFAULT NULL,
  `LAST_UPDATED_DATE` datetime DEFAULT NULL,
  `REMARK` text DEFAULT NULL,
  `ICON` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID`),
  KEY `idx_brd_f01` (`BRANCH_ID`,`TYPE_ID`,`STATUS`)
) ENGINE=InnoDB AUTO_INCREMENT=45 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `hrm_department` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `DEPT_ID` varchar(255) DEFAULT NULL COMMENT 'ລະຫັດພະແນກ',
  `DEPT_TYPE` varchar(255) DEFAULT NULL COMMENT 'ລະຫັດປະເພດ: ພະແນກ ຫຼື ສູນ',
  `NAME_LA` varchar(255) DEFAULT NULL COMMENT 'ຊື່ເຕັມພາສາລາວ',
  `ABBR_LA` varchar(255) DEFAULT NULL COMMENT 'ຊື່ຕົວຫຍໍ້ພາສາລາວ ເກັບ 3 ຕົວອັກສອນ',
  `NAME_EN` varchar(255) DEFAULT NULL COMMENT 'ຊື່ເຕັມພາສາອັງກິດ',
  `ABBR_EN` varchar(255) DEFAULT NULL COMMENT 'ຊື່ຕົວຫຍໍ້ອັງກິດ ເກັບ 3 ຕົວອັກສອນ',
  `TEL` varchar(255) DEFAULT NULL COMMENT 'ເບີໂທພະແນກ',
  `EMAIL` varchar(255) DEFAULT NULL COMMENT 'ອີເມວພະແນກ',
  `AGREED_OPEN_NO` varchar(255) DEFAULT NULL COMMENT 'ເລກທີຂໍ້ຕົກລົງສ້າງຕັ້ງພະແນກ',
  `OPEN_DATE` date DEFAULT NULL COMMENT 'ວັນທີຂໍ້ຕົກລົງສ້າງຕັ້ງພະແນກ',
  `AGREED_CLOSE_NO` varchar(255) DEFAULT NULL COMMENT 'ເລກທີຂໍ້ຕົກລົງປິດຕັ້ງພະແນກ',
  `CLOSE_DATE` date DEFAULT NULL COMMENT 'ວັນທີຂໍ້ຕົກລົງປິດຕັ້ງພະແນກ',
  `STATUS` varchar(255) DEFAULT NULL COMMENT 'ສະຖານະ (ເປິດ, ປິດ)',
  `PROVINCE_CODE` varchar(255) DEFAULT NULL COMMENT 'ພະແນກຕັ້ງຢູ່ແຂວງໃດ ເກັບລະຫັດແຂວງ (ດຶງມາຈາຕາລາງແຂວງ)',
  `DISTRICT_CODE` varchar(255) DEFAULT NULL COMMENT 'ພະແນກຕັ້ງຢູ່ເມືອງໃດ ເກັບລະຫັດເມືອງ (ດຶງມາຈາກຕາລາງເມືອງ)',
  `VILLAGE_CODE` varchar(255) DEFAULT NULL COMMENT 'ພະແນກຕັ້ງຢູ່ບ້ານໃດ ເກັບລະຫັດບ້ານ (ດຶງມາຈາກຕາລາງບ້ານ',
  `DETAIL` varchar(255) DEFAULT NULL COMMENT 'ລາຍລະອຽດ',
  `REMARK` varchar(255) DEFAULT NULL COMMENT 'ໝາຍເຫດ',
  `CREATED_BY` varchar(5) DEFAULT NULL,
  `CREATED_DATE` datetime DEFAULT NULL,
  `LAST_UPDATED_BY` varchar(5) DEFAULT NULL,
  `LAST_UPDATED_DATE` datetime DEFAULT NULL,
  `ICON` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID`),
  KEY `idx_dept_id` (`DEPT_ID`)
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `hrm_section` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `DEPT_ID` varchar(255) DEFAULT NULL COMMENT 'ລະຫັດພະແນກ',
  `SECT_ID` varchar(255) DEFAULT NULL COMMENT 'ລະຫັດຂະແໜງ',
  `NAME_LA` varchar(255) DEFAULT NULL COMMENT 'ຊື່ເຕັມພາສາລາວ',
  `NAME_EN` varchar(255) DEFAULT NULL COMMENT 'ຊື່ເຕັມພາສາອັງກິດ',
  `DETAILS_LA` varchar(255) DEFAULT NULL COMMENT 'ລາຍລະອຽດພາສາລາວ',
  `DETAILS_EN` varchar(255) DEFAULT NULL COMMENT 'ລາຍລະອຽດພາສາອັງກິດ',
  `ABBR_EN` varchar(255) DEFAULT NULL COMMENT 'ຊື່ຕົວຫຍໍ້ອັງກິດ ເກັບ 3 ຕົວອັກສອນ',
  `STYPE_ID` varchar(255) DEFAULT NULL COMMENT 'ລະຫັດປະເພດ: ຂະແໜງ, ໜ່ວຍງານ, ຫ້ອງແລກປ່ຽນ',
  `CREATED_BY` varchar(5) DEFAULT NULL,
  `CREATED_DATE` datetime DEFAULT NULL,
  `LAST_UPDATED_BY` varchar(5) DEFAULT NULL,
  `LAST_UPDATED_DATE` datetime DEFAULT NULL,
  `IS_DELETE` char(1) DEFAULT 'N',
  PRIMARY KEY (`ID`) USING BTREE,
  UNIQUE KEY `idx_sect_id_` (`SECT_ID`) USING BTREE,
  KEY `idx_sect_j_1` (`DEPT_ID`,`SECT_ID`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=181 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE `hrm_unit` (
  `ID` int(11) NOT NULL AUTO_INCREMENT,
  `BRANCH_ID` varchar(255) DEFAULT NULL,
  `UNIT_ID` varchar(255) DEFAULT NULL,
  `SHORT_NAME_LA` varchar(255) DEFAULT NULL,
  `FULL_NAME_LA` varchar(255) DEFAULT NULL,
  `FULL_NAME_EN` varchar(255) DEFAULT NULL,
  `ABBR_LA` varchar(255) DEFAULT NULL,
  `ABBR_EN` varchar(255) DEFAULT NULL,
  `TEL` varchar(255) DEFAULT NULL,
  `EMAIL` varchar(255) DEFAULT NULL,
  `AGREED_OPEN_NO` varchar(255) DEFAULT NULL,
  `ISSUE_DATE` varchar(255) DEFAULT NULL,
  `OPEN_DATE` varchar(255) DEFAULT NULL,
  `AGREED_CLODE_NO` varchar(255) DEFAULT NULL,
  `CLOSE_DATE` varchar(255) DEFAULT NULL,
  `DETAIL` varchar(255) DEFAULT NULL,
  `STATUS` varchar(255) DEFAULT NULL,
  `PROVINCE_CODE` varchar(255) DEFAULT NULL,
  `DISTRICT_CODE` varchar(255) DEFAULT NULL,
  `VILLAGE_CODE` varchar(255) DEFAULT NULL,
  `TYPE_ID` varchar(255) DEFAULT NULL,
  `REMARK` varchar(255) DEFAULT NULL,
  `ATTACH_FILE` varchar(255) DEFAULT NULL,
  `CREATED_BY` varchar(5) DEFAULT NULL,
  `CREATED_DATE` datetime DEFAULT NULL,
  `LAST_UPDATED_BY` varchar(5) DEFAULT NULL,
  `LAST_UPDATED_DATE` datetime DEFAULT NULL,
  PRIMARY KEY (`ID`),
  KEY `idx_unit` (`UNIT_ID`)
) ENGINE=InnoDB AUTO_INCREMENT=217 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `tb_current_login` (
  `eid` varchar(5) NOT NULL,
  `session_token` varchar(255) NOT NULL,
  `client_ip` varchar(20) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `start_time` datetime DEFAULT NULL,
  `last_act` datetime DEFAULT NULL,
  `current_desc` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`eid`,`session_token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

CREATE TABLE `tb_holiday` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `holiday_date` date DEFAULT NULL,
  `holiday_desc` varchar(255) DEFAULT NULL,
  `status` char(1) DEFAULT 'Y',
  `txn_date` datetime DEFAULT NULL,
  `created_by` varchar(10) DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=58 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci ROW_FORMAT=DYNAMIC;

CREATE TABLE IF NOT EXISTS `hrm_employee_account_currency` (
    `id` INT(11) NOT NULL AUTO_INCREMENT,
    `eid` VARCHAR(10) NOT NULL COMMENT '5-digit padded EID',
    `ccy` VARCHAR(10) NOT NULL COMMENT 'hrm_currency.ccy_name',
    `account_no` VARCHAR(50) NOT NULL,
    `account_name` VARCHAR(255) NOT NULL,
    `is_deleted` TINYINT(1) NOT NULL DEFAULT 0,
    `created_by` VARCHAR(10) DEFAULT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_by` VARCHAR(10) DEFAULT NULL,
    `updated_at` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_eid_ccy_active` (`eid`, `ccy`, `is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `tb_app_handoff` (
  `code_hash` CHAR(64) NOT NULL COMMENT 'sha256 of the code, lower-case hex',
  `eid` VARCHAR(5) NOT NULL COMMENT 'hrm_employee.EID',
  `created_at` DATETIME NOT NULL,
  `expires_at` DATETIME NOT NULL COMMENT 'created_at + 60 seconds, HRM local time',
  PRIMARY KEY (`code_hash`),
  KEY `idx_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
