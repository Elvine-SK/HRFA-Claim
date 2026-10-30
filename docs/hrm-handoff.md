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

HR-FAM can be set to accept a handoff only when the browser's `Referer` is an HRM page (`HRM_ORIGIN`). Browsers
send it by default; do not set `Referrer-Policy: no-referrer` on the portal pages or the script.

Only the hash is stored, so the table never holds a usable code. HR-FAM records every code it accepts and refuses
the same code a second time, so HRM does not need to mark codes used.

### Example: HRM legacy API (Node.js, Express, `mysql2`)

Two routes; keep the one that matches how the portal signs users in:

- **Session cookie:** the tile's `md_url` points at `GET /hrfam/open`, which answers the `302` itself.
- **Bearer token:** a plain link cannot send the `Authorization` header, so the portal calls `POST /hrfam/handoff`
  and then sets `window.location` to the `url` it answers.

```js
// routes/hrfam.js
const crypto = require('node:crypto')
const express = require('express')

const HRFAM_URL = process.env.HRFAM_URL // e.g. https://hr-fam.example, no trailing slash

// pool: a mysql2/promise pool on bcel_hrm_v3.
// requireLogin: HRM's existing middleware; it must set req.user.eid from the server-side session or the
// verified token. Never take the EID from the query string or the body.
module.exports = function hrfamRoutes(pool, requireLogin) {
  const router = express.Router()

  async function handoffUrl(eid) {
    const code = crypto.randomBytes(32).toString('hex')
    const codeHash = crypto.createHash('sha256').update(code).digest('hex')
    await pool.execute(
      `INSERT INTO tb_app_handoff (code_hash, eid, created_at, expires_at)
       VALUES (?, ?, NOW(), NOW() + INTERVAL 60 SECOND)`,
      [codeHash, eid],
    )
    return `${HRFAM_URL}/api/v1/auth/hrm?code=${code}`
  }

  // Session cookie: the tile links here.
  router.get('/hrfam/open', requireLogin, async (req, res, next) => {
    try {
      const url = await handoffUrl(req.user.eid)
      res.set('Cache-Control', 'no-store').redirect(302, url)
    } catch (err) {
      next(err)
    }
  })

  // Bearer token: the portal calls this, then navigates to the answer's url.
  router.post('/hrfam/handoff', requireLogin, async (req, res, next) => {
    try {
      const url = await handoffUrl(req.user.eid)
      res.set('Cache-Control', 'no-store').json({ url })
    } catch (err) {
      next(err)
    }
  })

  return router
}
```

```js
// app.js
app.use(require('./routes/hrfam')(pool, requireLogin))
```

```js
// Portal, bearer-token variant: the tile's click handler.
const res = await fetch('/api/hrfam/handoff', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
})
if (res.ok) window.location.assign((await res.json()).url)
```

Notes for Express:

- `helmet()` sets `Referrer-Policy: no-referrer` by default, which removes the `Referer` HR-FAM checks when
  `HRM_ORIGIN` is set. Use `helmet({ referrerPolicy: { policy: 'strict-origin-when-cross-origin' } })`, at least on
  the portal pages and these routes.
- `HRM_ORIGIN` is the origin of the page the browser leaves: the portal page in the bearer-token variant, and
  also the portal page in the cookie variant (a redirect keeps the original `Referer`).
- The code is hex, so it needs no URL encoding. Express 4 does not catch errors from `async` handlers, hence the
  `try`/`catch`.
- Do not log the code or the redirect URL.

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
so logging out of HRM, or HRM's 4-hour idle timeout, also signs the user out of HR-FAM. The same check ends the
session of an employee who is deleted, unapproved, not working or moved to a subsidiary in HRM. If more than half of
the signed-in users (10 or more) look logged out at once, HR-FAM signs nobody out and reports the job as failed:
clearing `tb_current_login` (for example during maintenance) must not end everyone's session.

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
| `auth_hrm.bad_origin`     | `HRM_ORIGIN` is set and the request did not come from an HRM page        |
| `auth_hrm.failed`         | Anything else; HR-FAM's log has the details                              |

HRM may show a message for these, or ignore the parameter.

## Local copy (developers)

Development and tests use a local database built from the HRM structure and invented fixture rows:

```sh
docker exec -i hr-fam-mariadb-1 mariadb -uroot -proot_dev -e "CREATE DATABASE IF NOT EXISTS hr_fam_src_hrm"
docker exec -i hr-fam-mariadb-1 mariadb -uroot -proot_dev hr_fam_src_hrm < apps/api/test/sources/hrm.schema.sql
docker exec -i hr-fam-mariadb-1 mariadb -uroot -proot_dev hr_fam_src_hrm < apps/api/test/sources/hrm.fixtures.sql
```

Then `http://localhost:3335/api/v1/auth/hrm?code=valid-10001` signs in as the fixture employee `10001` (once per load).
