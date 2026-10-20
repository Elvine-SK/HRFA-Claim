# Plan 1 — Foundation: scaffold, HRM read layer, HRM sign-in

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running app that a user opens from the HRM portal tile, lands in signed in as their HRM employee, and
whose API can look up selectable HRM employees and their accounts.

**Architecture:** One nelvine-platform app (`enterprise` template + `files`). HRM is reached as a platform data
source named `hrm` (platform M1, read-only). Two app modules: `hrm` (read layer and routes) and `auth-hrm`
(one-time code handoff, user provisioning, logout sync). `auth-hrm` is app-local now and shaped like the proposed
platform M2 so it can be swapped for the platform package later.

**Tech Stack:** nelvine-platform (Hono, Kysely, MariaDB 11.4, Nuxt 4 + Nuxt UI), TypeScript, vitest, pnpm,
Node.js ≥ 22.12.

**Spec:** [`docs/specs/2026-10-20-travel-payment-design-v2.md`](../../specs/2026-10-20-travel-payment-design-v2.md)
sections 2, 4, 5, 6, 15 (build step 1 of §18). Platform M1 design:
`../nelvine-platform/docs/superpowers/specs/2026-10-20-external-data-sources-design.md`.

This is plan 1 of 6, one per build step in spec §18. Plans 2–6 are listed in [`HANDOFF.md`](../../../HANDOFF.md).

## Global Constraints

- Node.js 22.12 or later; MariaDB 11.4; pnpm.
- Platform: the first release that contains data sources (M1). If none is released yet, create the app with
  `--link ../nelvine-platform` and switch to the release with `nelv upgrade` once it exists.
- Working name `hr-fam`, title `HR-FAM`, until ຂ9 gives the real name.
- Nothing is ever written to `bcel_hrm_v3`. The `hrm` source is read-only (platform M1); single use of handoff
  codes is enforced in the app database, not in HRM.
- HRM queries list their columns explicitly; never `selectAll()` on the `hrm` source (HRM columns are upper case,
  `CamelCasePlugin` maps only what the query names).
- `EID` is a five-character string, kept as a string everywhere (`'00123'`, never `123`).
- Selectable employee: `IS_DELETE = 'N'`, `APPROVED_STATUS = 'A'`, `WORK_STATUS = 1`, `COMPANY_CODE = '00'`.
- HRM `DATETIME` values are in `+07:00` (`DATA_SOURCE_HRM_TIMEZONE=+07:00`).
- Every user-visible server message has `en` and `lo` strings in the module's `messages`.
- Account rows come from the current `hrm_employee_account_currency` shape (`id, eid, ccy, account_no,
  account_name, is_deleted, created_at, updated_at`) in `docs-and-facts-of-project/personnel_account_FROM_HRM_V3.sql`,
  not the older draft shape in the structure dump.

## Review Focus

1. **Upper-case HRM columns.** `source('hrm').selectFrom('hrmEmployee').select(['eid', 'nameLao'])` must return
   `{ eid, nameLao }` with values. Test in Task 2.
2. **Handoff replay.** The same code redeemed twice, including two requests at once, signs in once; the second
   gets `auth_hrm.code_used`. Test in Task 4.
3. **Time zone of `expires_at`.** A code that expires one minute from now in HRM local time (`+07:00`) is accepted;
   one that expired one minute ago is refused, whatever the server's own time zone. Test in Task 4.
4. **Employee who stops being selectable.** A linked user whose HRM row becomes deleted, unapproved, not working
   or a subsidiary employee cannot sign in again (`auth_hrm.not_selectable`). Test in Task 4.
5. **HRM down.** Sign-in with HRM unreachable redirects to the HRM login page with an error, not a 500 page; the
   picker returns `503 source_unavailable`. Tests in Tasks 3 and 4.

---

### Task 1: Scaffold the app

**Files:**
- Create: the app from `nelv create` at the repository root (`apps/api`, `apps/web`, `docs/platform`, root config).
- Modify: `apps/api/.env.example` (data source and HRM lines, commented).
- Create: `.gitignore` entries for `docs-and-facts-of-project/`, `docs-and-facts-of-project.zip`, `*.stackdump`.

**Interfaces:**
- Produces: `modules()` in `apps/api/src/app.ts`, `appModules` in `apps/api/src/modules/index.ts`, the test
  database suite name `hr_fam`.

- [ ] **Step 1: Initialise git in `hr-fam`**

Write the `.gitignore` first, then run: `git init && git add .gitignore HANDOFF.md docs && git commit -m "docs: specs, proposals, business answers"`
`docs-and-facts-of-project/` holds bank documents and is never committed. The HRM test schema (Task 2) is copied
out of it into `apps/api/test/sources/`, structure only, no data. No remote and no push.

- [ ] **Step 2: Create the app in a scratch folder and move it in**

Run from `..`: `nelv create hr-fam-scaffold/hr-fam --template enterprise --capabilities files --pm pnpm --db mariadb --title "HR-FAM" --yes`
(add `--link ../nelvine-platform` per Global Constraints), then copy its contents into `hr-fam/` (its `docs/platform`
sits beside our `docs/specs`; no file clashes) and delete the scratch folder.

- [ ] **Step 3: Install and start the local database**

Run: `pnpm install && docker compose up -d && pnpm --filter ./apps/api migrate`
Expected: migrations applied, no errors.

- [ ] **Step 4: Run the generated checks**

Run: `pnpm typecheck && RUN_DB_TESTS=1 pnpm --filter ./apps/api test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: scaffold hr-fam on nelvine-platform"
```

### Task 2: HRM test source and types

**Files:**
- Create: `apps/api/test/sources/hrm.schema.sql`
- Create: `apps/api/test/sources/hrm.fixtures.sql`
- Create: `apps/api/src/sources/hrm.ts`
- Modify: `apps/api/test/global-setup.ts`, `apps/api/vitest.config.ts`, `apps/api/.env.example`
- Test: `apps/api/test/hrm-source.test.ts`

**Interfaces:**
- Produces: `HrmDatabase` and the `DataSources` merge `{ hrm: HrmDatabase }` in `src/sources/hrm.ts`; fixture
  EIDs used by later tasks (table below).

Schema file: the `CREATE TABLE` statements for `hrm_employee`, `hrm_position`, `hrm_branch`, `hrm_department`,
`hrm_section`, `hrm_unit`, `tb_current_login`, `tb_holiday` copied from
`docs-and-facts-of-project/HRM_V3_STRUCTURE_bcel_hrm_v3-202610131357.sql`; `hrm_employee_account_currency` from
`personnel_account_FROM_HRM_V3.sql`; and `tb_app_handoff` from Task 6's reference SQL.

Fixtures (EIDs as strings):

| EID     | Case                                    | Other rows                                                          |
| ------- | --------------------------------------- | ------------------------------------------------------------------- |
| `10001` | Selectable, HQ `888010`, PostType 7     | LAK accounts ×2 (newer `0101-NEW`), USD ×1; `tb_current_login` row  |
| `10002` | Selectable, branch `888020`             | LAK active ×1 and deleted ×1; no login row                          |
| `10003` | `IS_DELETE = 'Y'`                       |                                                                     |
| `10004` | `APPROVED_STATUS = 'P'`                 |                                                                     |
| `10005` | `WORK_STATUS = 2`                       |                                                                     |
| `10006` | `COMPANY_CODE = '01'`                   |                                                                     |

`tb_app_handoff` rows: `sha256('valid-10001')` for `10001` expiring `2099-01-01`; `sha256('expired-10001')`
expiring `2000-01-01`; `sha256('valid-10003')` for `10003` expiring `2099-01-01`.

- [ ] **Step 1: Write the failing test**

```ts
it('reads upper-case HRM columns through camelCase names', async () => {
  const row = await source('hrm')
    .selectFrom('hrmEmployee')
    .select(['eid', 'nameLao', 'branchCode'])
    .where('eid', '=', '10001')
    .executeTakeFirstOrThrow()
  expect(row).toEqual({ eid: '10001', nameLao: expect.any(String), branchCode: '888010' })
})
it('refuses writes', async () => {
  await expect(
    source('hrm').updateTable('hrmEmployee').set({ nameLao: 'x' }).where('eid', '=', '10001').execute(),
  ).rejects.toThrow()
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `RUN_DB_TESTS=1 pnpm --filter ./apps/api vitest run test/hrm-source.test.ts`
Expected: FAIL (`hrm` source not configured).

- [ ] **Step 3: Wire the source**

`global-setup.ts` calls `setupTestSource('hrm', { schema, fixtures, suite: 'hr_fam' })`; `vitest.config.ts` sets
`DATA_SOURCES=hrm`, `DATA_SOURCE_HRM_URL=testSourceUrl('hrm', 'hr_fam')`, `DATA_SOURCE_HRM_TIMEZONE=+07:00`.
`src/sources/hrm.ts` declares the tables above with camelCase keys, typed to match the M1 source decoding
(`DECIMAL` and `DATE` as strings, `TINYINT(1)` as number). Try `platform source:types hrm` first; hand-write or
correct the file if its keys are not the camelCase of the column names.

- [ ] **Step 4: Run it to make sure it passes**

Run: the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api && git commit -m "feat(hrm): HRM data source, test schema and fixtures"
```

### Task 3: `hrm` module — employees, accounts, routes

**Files:**
- Create: `apps/api/src/modules/hrm/module.ts`, `employees.ts`, `accounts.ts`, `logins.ts`, `routes.ts`, `schema.ts`
- Modify: `apps/api/src/modules/index.ts`
- Test: `apps/api/test/hrm.test.ts`

**Interfaces:**
- Consumes: `source('hrm')` (Task 2).
- Produces:
  - `interface HrmEmployee { eid: string; nameLao: string; snameLao: string; nameEng: string | null; snameEng: string | null; branchCode: string; branchName: string | null; departmentCode: string | null; departmentName: string | null; sectionCode: string | null; sectionName: string | null; unitCode: string | null; unitName: string | null; positionCode: string | null; positionName: string | null; postType: number | null }`
  - `findEmployee(eid: string): Promise<HrmEmployee | null>` — selectable employees only.
  - `activeAccount(eid: string, ccy: string): Promise<{ accountNo: string; accountName: string; count: number } | null>` — newest non-deleted row by `created_at`, then `id`; `count` is how many non-deleted rows exist.
  - `loggedInEids(eids: string[]): Promise<Set<string>>` — EIDs with at least one `tb_current_login` row.
  - Permission `hrm_employee: ['read']`.
  - Routes: `GET /api/v1/hrm/employees` (picker), `GET /api/v1/hrm/employees/{eid}`, `GET /api/v1/hrm/me`.

- [ ] **Step 1: Write the failing tests**

```ts
it('finds a selectable employee with names joined', async () => {
  const e = await findEmployee('10001')
  expect(e).toMatchObject({ eid: '10001', branchCode: '888010', postType: 7 })
  expect(e!.positionName).toEqual(expect.any(String))
})
it.each(['10003', '10004', '10005', '10006', '99999'])('does not return %s', async (eid) => {
  expect(await findEmployee(eid)).toBeNull()
})
it('takes the newest account and counts duplicates', async () => {
  expect(await activeAccount('10001', 'LAK')).toEqual({ accountNo: '0101-NEW', accountName: expect.any(String), count: 2 })
  expect(await activeAccount('10002', 'LAK')).toMatchObject({ count: 1 })
  expect(await activeAccount('10002', 'USD')).toBeNull()
})
it('lists logged-in EIDs', async () => {
  expect(await loggedInEids(['10001', '10002'])).toEqual(new Set(['10001']))
})
it('picker needs the permission and a search term, and caps the page', async () => {
  expect((await noRole.get(`${API}/hrm/employees?search=10`)).status).toBe(403)
  expect((await reader.get(`${API}/hrm/employees`)).status).toBe(400)
  const res = await reader.get(`${API}/hrm/employees?search=1000&pageSize=500`)
  expect(res.status).toBe(200)
  expect(res.body.data.map((e: { eid: string }) => e.eid)).toEqual(['10001', '10002'])
  expect(Object.keys(res.body.data[0]).sort()).toEqual(['branchCode', 'eid', 'nameLao', 'positionName', 'snameLao'])
})
it('returns 503 when HRM is unreachable', async () => {
  // app booted with DATA_SOURCE_HRM_URL pointing at a closed port
  expect((await downClient.get(`${API}/hrm/employees?search=10`)).status).toBe(503)
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `RUN_DB_TESTS=1 pnpm --filter ./apps/api vitest run test/hrm.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`employees.ts`: one base query `selectableEmployees()` with the four filters from Global Constraints and left
joins to position (`hrm_position.PostID = hrm_employee.POSITION_CODE`), branch (`BRANCH_ID = BRANCH_CODE`),
department, section and unit; `findEmployee` and the picker both use it. Picker route uses `sourcePicker` with
permission `hrm_employee.read`, searches `eid`, `nameLao`, `snameLao`, `nameEng`, and returns the five columns in
the test. `/hrm/employees/{eid}` needs `hrm_employee.read`. `/hrm/me` returns the caller's own `HrmEmployee`
(through the `hrm_user_links` row of Task 4; 404 until then) with no extra permission.

- [ ] **Step 4: Run them to make sure they pass**

Run: the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api && git commit -m "feat(hrm): employee, account and login lookups with picker routes"
```

### Task 4: `auth-hrm` module — one-time code sign-in

**Files:**
- Create: `apps/api/src/modules/auth-hrm/module.ts`, `config.ts`, `migrations.ts`, `handoff.ts`, `users.ts`, `routes.ts`
- Modify: `apps/api/src/modules/index.ts`, `apps/api/src/app.ts` (merge `authHrmConfigSchema`), `apps/api/.env.example`
- Test: `apps/api/test/auth-hrm.test.ts`

**Interfaces:**
- Consumes: `findEmployee` (Task 3); `AUTH` service from `@elvine-sk/platform-auth` (`sessions.create(user, 'active', false)`, `settings.cookieName`, `findUserById`); `AUDIT`.
- Produces:
  - Config `authHrmConfigSchema = { HRM_LOGIN_URL: z.string().url() }`.
  - Tables `hrm_user_links (eid varchar(5) PK, user_id uuid unique not null, created_at, last_login_at)` and `hrm_handoff_redemptions (code_hash char(64) PK, eid varchar(5) not null, redeemed_at)`.
  - `redeemHandoff(code: string): Promise<string>` → EID; throws `AppError` `auth_hrm.code_invalid` (unknown or expired) or `auth_hrm.code_used`.
  - `ensureHrmUser(employee: HrmEmployee): Promise<{ userId: string; created: boolean }>`.
  - `GET /api/v1/auth/hrm?code=…` → `302` to `APP_ORIGIN` + `/` with the session cookie, or `302` to `HRM_LOGIN_URL?error=<code>`.
  - Audit actions `auth.hrm.login`, `auth.hrm.failed`, `auth.hrm.user_created`.
  - Role key `employee`.

- [ ] **Step 1: Write the failing tests**

```ts
it('signs in with a valid code and creates the user once', async () => {
  const res = await client.get(`${API}/auth/hrm?code=valid-10001`)
  expect(res.status).toBe(302)
  expect(res.headers.get('location')).toBe(`${TEST_ORIGIN}/`)
  expect((await client.get(`${API}/auth/session`)).body.data.user.username).toBe('10001')
  expect((await client.get(`${API}/hrm/me`)).body.data.eid).toBe('10001')
})
it('refuses the same code twice, also concurrently', async () => {
  const [a, b] = await Promise.all([fresh().get(`${API}/auth/hrm?code=valid-10001`), fresh().get(`${API}/auth/hrm?code=valid-10001`)])
  const locations = [a, b].map((r) => r.headers.get('location'))
  expect(locations.filter((l) => l?.includes('error=auth_hrm.code_used'))).toHaveLength(2) // already used by the first test
})
it('refuses expired, unknown and non-selectable codes', async () => {
  for (const [code, error] of [['expired-10001', 'code_invalid'], ['nope', 'code_invalid'], ['valid-10003', 'not_selectable']])
    expect((await fresh().get(`${API}/auth/hrm?code=${code}`)).headers.get('location')).toBe(`${HRM_LOGIN_URL}?error=auth_hrm.${error}`)
})
it('accepts a code that expires in one minute HRM time and refuses one that expired a minute ago', async () => {
  // rows inserted by the test's setup connection with expires_at = NOW() ± INTERVAL 1 MINUTE in +07:00
})
it('gives a new user the employee role, no password and no MFA', async () => {
  // user row: passwordHash null, mfaRequired false; roles contain `employee`
})
it('redirects to the HRM login with an error when HRM is down', async () => {
  expect((await downClient.get(`${API}/auth/hrm?code=valid-10001`)).headers.get('location')).toBe(`${HRM_LOGIN_URL}?error=auth_hrm.unavailable`)
})
```

Order matters in the replay test: run it after the first test, or give it its own fixture code.

- [ ] **Step 2: Run them to make sure they fail**

Run: `RUN_DB_TESTS=1 pnpm --filter ./apps/api vitest run test/auth-hrm.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `redeemHandoff`: `sha256` hex of the code; read `tb_app_handoff` (`code_hash`, `eid`, `expires_at`) from the
  source; compare `expires_at` with `now()` as `Date`s (the source converts `+07:00`); then insert into
  `hrm_handoff_redemptions`, mapping a duplicate-key error to `auth_hrm.code_used`. The insert, user provisioning
  and session creation run in one `inTransaction`.
- `ensureHrmUser`: existing `hrm_user_links` row → that user (inactive user → `auth_hrm.account_inactive`);
  else insert into `users` the way `auth-oidc`'s `createUser` does (`createdStamp`, `username = eid`,
  `email = null`, `displayName = nameLao + ' ' + snameLao`, `status = 'active'`, no password), insert the link and
  give the `employee` role. Seed the `employee` role in module `setup` if missing. For the role grant, use the
  authorization admin service (`packages/authorization/src/admin.ts`, `setUserRoles`) as the system subject; if it
  needs a user actor, write the role row the way `setUserRoles` does.
- Route: rate-limited like the OIDC callback; failures audited as `auth.hrm.failed` with the code; an
  `isSourceUnavailable(err)` error becomes `auth_hrm.unavailable`.
- Messages `en`/`lo` for `auth_hrm.code_invalid`, `code_used`, `not_selectable`, `account_inactive`, `unavailable`.

- [ ] **Step 4: Run them to make sure they pass**

Run: the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api && git commit -m "feat(auth-hrm): one-time code sign-in from the HRM portal"
```

### Task 5: Session follows HRM logout and idle timeout

**Files:**
- Create: `apps/api/src/modules/auth-hrm/logout-sync.ts`
- Modify: `apps/api/src/modules/auth-hrm/module.ts`, `apps/api/.env.example` (`AUTH_SESSION_IDLE_MINUTES=240`)
- Test: `apps/api/test/auth-hrm.test.ts`

**Interfaces:**
- Consumes: `loggedInEids` (Task 3), `hrm_user_links` (Task 4), `AUTH.sessions.revokeAllForUser(userId, reason)`.
- Produces: job `auth_hrm.sync_sessions`, recurring every `1m`; `syncHrmSessions(): Promise<number>` (sessions revoked).

- [ ] **Step 1: Write the failing test**

```ts
it('ends the sessions of users who logged out of HRM', async () => {
  // signed in: 10001 (has a tb_current_login row) and 10002 (has none)
  expect(await syncHrmSessions()).toBe(1)
  expect((await client10001.get(`${API}/auth/session`)).status).toBe(200)
  expect((await client10002.get(`${API}/auth/session`)).status).toBe(401)
})
```

`10002` needs a valid handoff code: add `sha256('valid-10002')` to the fixtures.

- [ ] **Step 2: Run it to make sure it fails**

Run: `RUN_DB_TESTS=1 pnpm --filter ./apps/api vitest run test/auth-hrm.test.ts -t "logged out"`
Expected: FAIL.

- [ ] **Step 3: Implement `syncHrmSessions`**

Users with an active session and an `hrm_user_links` row, in batches of 500 EIDs; revoke every session of a user
whose EID is not in `loggedInEids`, reason `hrm_logout`. When the source is unavailable, revoke nothing and log a
warning. Register the job and the recurring schedule in the module (`jobs`, `recurringJobs`).

- [ ] **Step 4: Run it to make sure it passes**

Run: the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api && git commit -m "feat(auth-hrm): end sessions after HRM logout; 4 hour idle timeout"
```

### Task 6: HRM-side handoff kit

**Files:**
- Create: `tooling/hrm/tb_app_handoff.sql`
- Create: `docs/hrm-handoff.md`

**Interfaces:**
- Produces: the table the test schema (Task 2) copies:
  `tb_app_handoff (code_hash CHAR(64) PRIMARY KEY, eid VARCHAR(5) NOT NULL, created_at DATETIME NOT NULL, expires_at DATETIME NOT NULL, KEY (expires_at))`.

- [ ] **Step 1: Write the SQL and the guide**

The guide, for the HRM team: generate 32 random bytes, hex encode (the code); store `sha256` hex of the code with
the EID and `expires_at = NOW() + INTERVAL 60 SECOND`; redirect to `<app>/api/v1/auth/hrm?code=<code>`; delete rows
older than one day on a schedule; the `tb_module` row (`md_url` to that redirect script); the grants the app's
database user needs (`SELECT` on the tables in ຂ7 and on `tb_app_handoff`, nothing else). One example in PHP.

- [ ] **Step 2: Check the SQL loads**

Run: `mysql -h 127.0.0.1 -P 3307 -u nelv -pnelv_dev nelv_test < tooling/hrm/tb_app_handoff.sql`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add tooling docs/hrm-handoff.md && git commit -m "docs: HRM handoff kit for the HRM team"
```

### Task 7: Web — HRM sign-in redirect and "My HRM profile"

**Files:**
- Create: `apps/web/app/middleware/hrm-sign-in.global.ts`
- Create: `apps/web/app/pages/me.vue`
- Modify: `apps/web/nuxt.config.ts` (`runtimeConfig.public.hrmLoginUrl`), `apps/web/app/plugins/navigation.ts`, `apps/web/i18n/locales/en.json`, `lo.json`

**Interfaces:**
- Consumes: `GET /api/v1/hrm/me` (Task 3).

- [ ] **Step 1: Implement the middleware**

A navigation to `/auth/sign-in` without `?local=1`, while `hrmLoginUrl` is set, goes to `hrmLoginUrl` with
`navigateTo(url, { external: true })`. `?local=1` keeps the platform sign-in for the bootstrap administrator.

- [ ] **Step 2: Implement `me.vue`**

Shows EID, Lao and English name, position, department, section, unit, branch from `/hrm/me`, with `en` and `lo`
labels; a menu item "My HRM profile" in the Overview group.

- [ ] **Step 3: Check by hand**

Run: `pnpm dev:api` and `pnpm dev:web`; open `http://localhost:3000/` signed out → redirected to the HRM login URL;
open `http://localhost:3000/api/v1/auth/hrm?code=<a code inserted in the local HRM copy>` → lands on `/`; open
`/me` → the employee's data.
Expected: as described.

- [ ] **Step 4: Run checks**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web && git commit -m "feat(web): HRM sign-in redirect and My HRM profile page"
```
