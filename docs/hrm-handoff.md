# HRM → HR-FAM sign-in handoff

For the HRM team. HR-FAM opens as a tile in the HRM portal. Users must not sign in twice, so HRM hands the signed-in
employee over to HR-FAM with a one-time code (decision ຂ5, option 1). HR-FAM only reads HRM; it never writes to
`bcel_hrm_v3`.

## What HRM adds

1. The table in [`tooling/hrm/tb_app_handoff.sql`](../tooling/hrm/tb_app_handoff.sql) (`code_hash`, `eid`,
   `created_at`, `expires_at`).
2. A small script behind the tile, for example `/hrfam/open`, that runs for a signed-in HRM user:
   - creates 32 random bytes and hex-encodes them: that string is the code;
   - inserts `sha256(code)` as lower-case hex, the user's EID, `NOW()` and `NOW() + INTERVAL 60 SECOND`;
   - redirects the browser (`302`) to `<HR-FAM URL>/api/v1/auth/hrm?code=<code>`.
3. A daily clean-up: `DELETE FROM tb_app_handoff WHERE expires_at < NOW() - INTERVAL 1 DAY`.
4. A `tb_module` row for the tile, `md_url` pointing at the script in step 2.

Only the hash is stored, so the table never holds a usable code. HR-FAM records every code it accepts and refuses
the same code a second time, so HRM does not need to mark codes used.

```php
<?php
// $eid: the signed-in employee's 5-character EID from the HRM session.
$code = bin2hex(random_bytes(32));
$stmt = $pdo->prepare(
    'INSERT INTO tb_app_handoff (code_hash, eid, created_at, expires_at)
     VALUES (?, ?, NOW(), NOW() + INTERVAL 60 SECOND)'
);
$stmt->execute([hash('sha256', $code), $eid]);
header('Location: ' . HRFAM_URL . '/api/v1/auth/hrm?code=' . $code, true, 302);
exit;
```

`expires_at` is written by the database in HRM's local time (`+07:00`); HR-FAM reads HRM's dates in that zone.

## Database user for HR-FAM

One user per environment (testing `10.0.7.110`, production `10.0.2.116`) with `SELECT` only (decided 2026-10-20),
on these tables:

`hrm_employee`, `hrm_employee_profile`, `hrm_employee_account_currency`, `hrm_position`, `hrm_branch`,
`hrm_department`, `hrm_section`, `hrm_unit`, `hrm_province`, `hrm_district`, `hrm_country`, `hrm_currency`,
`tb_holiday`, `tb_current_login`, `tb_users_common`, `tb_app_handoff`.

```sql
CREATE USER 'hrfam_reader'@'<app server>' IDENTIFIED BY '<secret>';
GRANT SELECT ON bcel_hrm_v3.hrm_employee TO 'hrfam_reader'@'<app server>';
-- … one GRANT SELECT per table above
```

No `INSERT`, `UPDATE`, `DELETE`, `EXECUTE` or schema rights: HR-FAM's own checks report any write right as an error.

## Logout

HR-FAM checks `tb_current_login` every minute and ends the HR-FAM session of anyone who no longer has a row there,
so logging out of HRM, or HRM's 4-hour idle timeout, also signs the user out of HR-FAM.

## What the user sees when something fails

HR-FAM sends the browser back to the HRM login page with `?error=<code>`:

| Code                      | Meaning                                                                  |
| ------------------------- | ------------------------------------------------------------------------ |
| `auth_hrm.code_invalid`   | No code, an unknown code, or one older than 60 seconds                   |
| `auth_hrm.code_used`      | The code was already used (a refresh or a second tab)                    |
| `auth_hrm.not_selectable` | The employee is deleted, not approved, not working, or of a subsidiary   |
| `auth_hrm.account_inactive` | The employee's HR-FAM account was disabled by an HR-FAM administrator  |
| `auth_hrm.unavailable`    | HR-FAM could not reach HRM's database                                    |
| `auth_hrm.rate_limited`   | Too many attempts from one address                                       |
| `auth_hrm.failed`         | Anything else; HR-FAM's log has the details                              |

HRM may show a message for these, or ignore the parameter.

## Local copy (developers)

Development and tests use a local database built from the HRM structure and invented fixture rows:

```sh
docker exec -i hr-fam-mariadb-1 mariadb -uroot -proot_dev -e "CREATE DATABASE IF NOT EXISTS hr_fam_src_hrm"
docker exec -i hr-fam-mariadb-1 mariadb -uroot -proot_dev hr_fam_src_hrm < apps/api/test/sources/hrm.schema.sql
docker exec -i hr-fam-mariadb-1 mariadb -uroot -proot_dev hr_fam_src_hrm < apps/api/test/sources/hrm.fixtures.sql
```

Then `http://localhost:3001/api/v1/auth/hrm?code=valid-10001` signs in as the fixture employee `10001` (once per load).
