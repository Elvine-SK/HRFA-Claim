# Plan 3 — Agreements (forms 1–4) with REF, Doc.no and approval

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HR enters a travel agreement (forms 1–4) once, with its members filled from HRM; the system issues the
REF, checks the Doc.no, snapshots each member's rank, accounts and the trip's zone on submission, runs the approval
chain, lets a reviewer cancel with a reason, and lets Finance and members find the agreement by REF or Doc.no.

**Architecture:** A new API module `agreements` with two tables (`agreements`, `agreement_members`) and a REF
counter. REF allocation and status transitions are stored procedures (spec §4, HANDOFF "Decisions"); validation,
scope, approval wiring and audit are TypeScript. Branch scope is computed in TypeScript from the caller's HRM
branch (the generated `platform.modules.ts` cannot take a `subjectAttributes` hook) and applied with `scopedBy`.
Approval steps resolve, per agreement branch, the users who hold a given role (resolvers). The `hrm` module gains
provinces, districts and positions. Web pages under `/agreements`.

**Tech Stack:** nelvine-platform 1.0.0 (Hono, Kysely, MariaDB 11.4, Nuxt 4 + Nuxt UI), `@elvine-sk/platform-approval`,
`-files`, `-notifications`, TypeScript, vitest, pnpm.

**Spec:** [`docs/specs/2026-10-21-travel-payment-design-v3.md`](../../specs/2026-10-21-travel-payment-design-v3.md)
sections 5 (snapshot, acting positions, accounts), 8, 12, 13 (signed agreement files), 14 (agreement screens),
16 (Doc.no tests), 18 step 3. Platform guides: `docs/platform/modules.md` ("Stored procedures", "Approval"),
`authorization.md` ("Scoped lists"), `files.md`, `testing.md`, `web.md`. Carry items: HANDOFF "Carry into plans 3–4".

## Global Constraints

- Everything in plan 2's Global Constraints still holds (module layout, `currentDb()`/`inTransaction`/`writeHistory`,
  access check per route, `BINARY(16)` UUIDs, en + lo strings, an HTTP test per route with a refusal, migration
  keys `YYYYMMDDHHmm_<module>_<change>`, `DATE` as `YYYY-MM-DD` strings, money as decimal strings).
- **Doc.no** (decided 2026-10-29: six-digit branch): canonical `NNNN.BCEL.<BRANCH_CODE>.YYYY`, e.g.
  `0001.BCEL.888010.2026`; Lao `NNNN.ທຄຕລ.888010.2026`. Input accepts either script, `.` or `/` as separator,
  `NNNN` of 1–4 digits (padded), and a three-digit branch `010` read as `888010`. `YYYY` must equal the year of
  the document date. Stored canonical; displayed in the user's language.
- **REF**: `TA-YYYY-NNNNNN` (year in HRM time of the first save, counter per year from `000001`), e.g.
  `TA-2026-000001`. Issued on first save, never reused, kept by a cancelled agreement.
- Head office branch is `888010` (`HEAD_OFFICE_BRANCH`). A head-office user may enter and see agreements of any
  branch; any other user only their own HRM branch.
- Form types: `domestic` (form 1), `district` (form 2), `overseas` (form 3), `border` (form 4).
- Policy options: `bcel_all`, `host_travel`, `host_accommodation`, `host_meals`, `host_meals_accommodation`.
- Statuses: `draft`, `in_approval`, `approved`, `cancelled`. Only `draft` is editable.
- Errors are `AppError`s with codes `agreements.<key>`, en and lo text in the module's `messages`.
- Signed agreement files: PDF, JPG or PNG, at most 50 MB (`52428800` bytes).
- Day count: `return − departure + 1`; paid days = that − `daysSubtracted`.

## Review Focus

1. **Doc.no reuse across spellings.** `0001/ທຄຕລ/888010/2026`, `1.BCEL.010.2026` and `0001.BCEL.888010.2026` are
   the same number: a second live agreement with any of them answers `409 agreements.doc_no_taken`; after the first
   is cancelled the same number is accepted. Test in Task 5.
2. **Member dates that do not fit.** Return before departure, a member outside the header dates, days subtracted
   more than the calculated days, or more host meals than `days × 3` answer `422` with the member's path
   (`members.<n>.<field>`). Test in Task 5.
3. **Editing a submitted agreement.** `PUT` on `in_approval`, `approved` or `cancelled` answers
   `409 agreements.not_draft` and changes nothing. Test in Task 5 (draft rule) and Task 6 (after submit).
4. **Branch scope by lookup.** A branch-`888020` HR officer gets `404` for a branch-`888010` agreement by id and by
   REF/Doc.no lookup, and sees none in the list; head office sees both; an employee sees only agreements they are a
   member of. Test in Task 5.
5. **No approver in the branch.** Submitting when a step resolves to nobody answers `422 approval.no_approvers`,
   leaves the agreement `draft` with its REF, and a later submit after the role is granted works. Test in Task 6.

---

### Task 1: Shared dates, typed app tables, spec decision

**Files:**
- Create: `apps/api/src/shared/dates.ts`, `apps/api/src/shared/db.ts`
- Modify: `apps/api/src/modules/travel-master/sets.ts` (import `todayHrm` from shared; keep re-export so
  `routes.ts` and tests compile), `docs/specs/2026-10-21-travel-payment-design-v3.md` (§8 Doc.no branch, §17
  business question 1 answered: six digits, 2026-10-29)
- Test: `apps/api/test/dates.test.ts` (unit, no database)

**Interfaces:**
- Produces from `shared/dates.ts`:
  - `todayHrm(): string` (moved unchanged)
  - `daysInclusive(from: string, to: string): number` — `to − from + 1`; throws `RangeError` when `to < from`
  - `yearOf(date: string): number`
- Produces from `shared/db.ts`: `interface AppTables` with camelCase table interfaces for every `travel_*` table of
  plan 2 and the tables of Task 4, and `appDb = () => currentDb<AppTables & DbTables>()`. New code in this plan
  queries through `appDb()`; plan 2 code is not rewritten.

- [ ] **Step 1: Write the failing test**

```ts
it('counts both ends', () => {
  expect(daysInclusive('2026-10-01', '2026-10-01')).toBe(1)
  expect(daysInclusive('2026-12-30', '2027-01-02')).toBe(4)
  expect(daysInclusive('2028-02-28', '2028-03-01')).toBe(3)
  expect(() => daysInclusive('2026-10-02', '2026-10-01')).toThrow(RangeError)
})
it('reads the year', () => expect(yearOf('2026-10-29')).toBe(2026))
```

- [ ] **Step 2: Run it to make sure it fails** — `cd apps/api && pnpm vitest run test/dates.test.ts`: FAIL.
- [ ] **Step 3: Implement** `dates.ts` (UTC date arithmetic on `YYYY-MM-DD`), `db.ts`, the `sets.ts` move, the
  spec edit.
- [ ] **Step 4: Run** the test (PASS) and `pnpm run typecheck` (no errors).
- [ ] **Step 5: Commit** — `chore: shared HRM dates and typed app tables; spec: Doc.no six-digit branch`

### Task 2: HRM provinces, districts, positions; employee of a user

**Files:**
- Modify: `apps/api/src/sources/hrm.ts` (tables `hrmProvince`, `hrmDistrict` as in the structure dump:
  `PROVINCE_CODE, COUNTRY_CODE, PROVINCE_LA, PROVINCE` / `PROVINCE_CODE, DISTRICT_CODE, NAME_LA, NAME_EN`),
  `apps/api/src/modules/hrm/routes.ts`, `apps/api/src/modules/hrm/schema.ts`,
  `apps/api/test/sources/hrm.schema.sql`, `apps/api/test/sources/hrm.fixtures.sql`
- Create: `apps/api/src/modules/hrm/geography.ts`, `apps/api/src/modules/hrm/positions.ts`
- Modify: `apps/api/src/modules/auth-hrm/users.ts`
- Test: `apps/api/test/hrm.test.ts` (extend)

**Interfaces:**
- Produces:
  - `listProvinces(): Promise<{ code: string; nameLo: string; nameEn: string | null }[]>` — Lao provinces
    (`COUNTRY_CODE` of Laos as found in the dump's data; put the value in one constant), sorted by code
  - `findProvince(code)`, `listDistricts(provinceCode)`, `findDistrict(provinceCode, districtCode)` with the same shape
  - `searchPositions(q: string): Promise<{ code: string; name: string; postType: number | null }[]>` (max 20),
    `findPosition(code)`
  - `employeeOfUser(userId: string): Promise<HrmEmployee | null>` in `auth-hrm/users.ts` (`linkedEid` + `findEmployee`)
  - Routes (all need sign-in only, reference data): `GET /hrm/provinces`, `GET /hrm/provinces/{code}/districts`,
    `GET /hrm/positions?q=` (`q` 1–50 chars required)
- Fixtures: provinces `01` (Vientiane Capital), `06` (Luang Prabang), `13` (Savannakhet) with two districts each;
  positions `ຫົວໜ້າພະແນກ` with PostType 7 (maps to `P3`) and one with an unmapped PostType; new selectable employees for the
  approval tests: `10010` (888010, HR officer), `10011` (888010, section head), `10012` (888010, department head),
  `10013` (888010, management), `10020` (888020, HR officer), `10021`–`10023` (888020 approvers), with LAK and USD
  accounts for `10010`–`10013` and LAK only for `10020`.
- Test helper (add to `test/helpers.ts`): `hrmClient(platform, admin, eid, roleIds?)` inserts a fresh row into the
  fixture `tb_app_handoff`, signs in through `GET /auth/hrm?code=`, grants `roleIds`, returns
  `{ userId, client }`.

- [ ] **Step 1: Write the failing tests**

```ts
it('lists provinces and the districts of one', async () => {
  const p = await someone.get(`${API}/hrm/provinces`)
  expect(p.body.data.map((x: any) => x.code)).toEqual(['01', '06', '13'])
  const d = await someone.get(`${API}/hrm/provinces/06/districts`)
  expect(d.body.data).toHaveLength(2)
  expect((await someone.get(`${API}/hrm/provinces/99/districts`)).status).toBe(404)
})
it('searches positions and needs a term', async () => {
  expect((await someone.get(`${API}/hrm/positions?q=`)).status).toBe(400)
  expect((await someone.get(`${API}/hrm/positions?q=ຫົວໜ້າ`)).body.data[0]).toMatchObject({ postType: 7 })
})
it('needs sign-in', async () => expect((await new TestClient(platform).get(`${API}/hrm/provinces`)).status).toBe(401))
it('finds the employee of a signed-in HRM user', async () => {
  const { userId } = await hrmClient(platform, admin, '10010')
  expect((await sys(() => employeeOfUser(userId)))?.branchCode).toBe('888010')
})
```

- [ ] **Step 2: Run** `cd apps/api && RUN_DB_TESTS=1 pnpm vitest run test/hrm.test.ts`: FAIL.
- [ ] **Step 3: Implement** the source tables, lookups, routes, fixtures and helper.
- [ ] **Step 4: Run** the step 2 command: PASS; then the whole suite (`RUN_DB_TESTS=1 pnpm run test`): still green.
- [ ] **Step 5: Commit** — `feat(hrm): provinces, districts and positions; employee of a user`

### Task 3: Doc.no parser

**Files:**
- Create: `apps/api/src/modules/agreements/doc-no.ts`
- Test: `apps/api/test/doc-no.test.ts` (unit)

**Interfaces:**
- Produces:
  - `interface DocNo { seq: number; branch: string; year: number }` (`branch` six digits)
  - `parseDocNo(input: string): DocNo | null` — trims; accepts `BCEL` or `ທຄຕລ`, `.` or `/`, 1–4 digit `seq`
    (`1..9999`), branch of 6 digits or 3 digits (prefixed `888`), 4-digit year; anything else `null`
  - `formatDocNo(d: DocNo, lang: 'en' | 'lo' = 'en'): string`
  - `parseRef(input: string): string | null` — `TA-YYYY-NNNNNN`, case-insensitive, returned upper-case

- [ ] **Step 1: Write the failing test**

```ts
const d = { seq: 1, branch: '888010', year: 2026 }
it.each([
  '0001.BCEL.888010.2026', '1.BCEL.888010.2026', '0001.BCEL.010.2026', '0001/BCEL/888010/2026',
  '0001.ທຄຕລ.888010.2026', '0001/ທຄຕລ/010/2026', ' 0001.bcel.888010.2026 ',
])('reads %s', (s) => expect(parseDocNo(s)).toEqual(d))
it.each(['0000.BCEL.888010.2026', '12345.BCEL.888010.2026', '0001.BCEL.88010.2026', '0001.BCEL.888010.26',
  '0001-BCEL-888010-2026', '0001.XYZ.888010.2026', ''])('refuses %s', (s) => expect(parseDocNo(s)).toBeNull())
it('formats both scripts', () => {
  expect(formatDocNo(d)).toBe('0001.BCEL.888010.2026')
  expect(formatDocNo({ ...d, seq: 42 }, 'lo')).toBe('0042.ທຄຕລ.888010.2026')
})
it('reads a REF', () => {
  expect(parseRef('ta-2026-000017')).toBe('TA-2026-000017')
  expect(parseRef('TA-2026-17')).toBeNull()
})
```

- [ ] **Step 2–4:** run `pnpm vitest run test/doc-no.test.ts` (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** — `feat(agreements): Doc.no and REF parsing`

### Task 4: Agreement tables, REF and transition procedures, roles

**Files:**
- Create: `apps/api/src/modules/agreements/module.ts`, `types.ts`, `migrations.ts`, `procedures.ts`
- Modify: `apps/api/src/modules/index.ts` (add `agreementsModule` after `travelMasterModule`),
  `apps/api/src/shared/db.ts` (types of the new tables)
- Test: `apps/api/test/agreements-procedures.test.ts`

**Interfaces:**
- Consumes: `todayHrm`, `appDb` (Task 1).
- Produces:
  - Table `agreements` (`withStandardColumns`): `ref varchar(14) unique not null`; `form_type` (`inCheck`, 4 values);
    `subject varchar(500)`, `title varchar(500)`, `reference varchar(200) null`; `doc_no varchar(32) not null`
    (canonical), `doc_date date`, `branch_code char(6)` (the Doc.no branch, also the record's scope);
    `doc_no_live` generated `IF(status <> 'cancelled', doc_no, NULL)` **unique**; `travel_from`, `travel_to date`;
    form fields, all nullable: `from_province_code`, `to_province_code`, `province_code`, `from_district_code`,
    `to_district_code varchar(16)`, `overnight tinyint(1)`, `same_day_50km tinyint(1)`, `country_iso2 char(2)`,
    `zone_code varchar(4)` (snapshot), `border_route_id` (uuid), `border_route_other varchar(200)`;
    `policy_option` (`inCheck`, 5 values); `has_advance tinyint(1)`; `status` (`inCheck`, 4 values, default
    `draft`); `submitted_at datetime(3) null`; `cancel_reason varchar(500) null`, `cancelled_at`, `cancelled_by`.
    Indexes on `(branch_code, status)` and `created_by`.
  - Table `agreement_members` (`id`, `agreement_id` FK, `sort_order int`): `eid varchar(5)`, unique
    `(agreement_id, eid)`; inputs `departure_date`, `return_date date`, `days_subtracted int default 0`,
    `is_leader`, `is_deputy`, `is_advance_holder tinyint(1)`, `host_meals int default 0`,
    `private_car_km int null`, `acting_position_code varchar(16) null`; snapshot (filled on save, refreshed on
    submit): `name_lao`, `sname_lao`, `name_eng`, `sname_eng`, `branch_code`, `department_name`, `section_name`,
    `position_code`, `position_name`, `post_type int`, `acting_position_name`, `rank_code varchar(2) null`,
    `account_lak varchar(32) null`, `account_usd varchar(32) null`.
  - Table `agreement_ref_counters (year smallint PK, last_value int not null)`.
  - Procedure `agreements_next_ref(p_year SMALLINT)` → one row `{ ref }`: `INSERT … ON DUPLICATE KEY UPDATE
    last_value = LAST_INSERT_ID(last_value + 1)` pattern, formatted `TA-YYYY-NNNNNN`.
  - Procedure `agreements_transition(p_id BINARY(16), p_version INT, p_to VARCHAR(16), p_reason VARCHAR(500),
    p_actor BINARY(16), p_at DATETIME(3))` → `{ version }`. Allowed: `draft→in_approval`, `in_approval→draft`,
    `in_approval→approved`, and `draft|in_approval|approved→cancelled`. Signals `agreements.bad_transition` (409),
    `agreements.reason_required` (422, cancel with empty reason), `resource.stale_version`, `resource.not_found`.
    Sets `submitted_at` on `in_approval`, the `cancel_*` columns on `cancelled`, bumps `version`, `updated_*`.
  - `procedures.ts`: `nextRef(): Promise<string>` (year from `todayHrm()`),
    `transition(id: string, version: number, to: AgreementStatus, reason?: string | null): Promise<number>`.
  - `HEAD_OFFICE_BRANCH = '888010'`, `type FormType`, `type PolicyOption`, `type AgreementStatus` exported from
    `types.ts` (not `module.ts`, to avoid import cycles).
  - Permissions `agreement: ['read', 'create', 'cancel']`.
  - Roles seeded with permissions (direct `roles` + `role_permissions` inserts, as `auth-hrm` seeds `employee`):
    `hr_officer` (`agreement.read`, `agreement.create`, `agreement.cancel`, `hrm_employee.read`),
    `hr_section_head`, `hr_department_head`, `management`, `finance_officer` (each `agreement.read`,
    `agreement.cancel`).

- [ ] **Step 1: Write the failing tests**

```ts
it('issues REFs in order, per year, without gaps under concurrency', async () => {
  setClock(new Date('2026-12-31T10:00:00Z'))
  const refs = await Promise.all(Array.from({ length: 5 }, () => sys(() => inTransaction(nextRef))))
  expect([...refs].sort()).toEqual(['TA-2026-000001', 'TA-2026-000002', 'TA-2026-000003', 'TA-2026-000004', 'TA-2026-000005'])
  setClock(new Date('2026-12-31T18:00:00Z')) // 2027-01-01 in HRM time
  expect(await sys(() => inTransaction(nextRef))).toBe('TA-2027-000001')
})
it('allows only the listed transitions', async () => {
  const id = await draftRow() // test helper inserting a minimal draft through appDb()
  await expect(sys(() => transition(id, 1, 'approved'))).rejects.toMatchObject({ code: 'agreements.bad_transition', status: 409 })
  await expect(sys(() => transition(id, 1, 'cancelled', ''))).rejects.toMatchObject({ code: 'agreements.reason_required' })
  await expect(sys(() => transition(id, 9, 'in_approval'))).rejects.toMatchObject({ status: 409 })
  expect(await sys(() => transition(id, 1, 'in_approval'))).toBe(2)
})
it('keeps one live agreement per Doc.no', async () => {
  const a = await draftRow({ docNo: '0001.BCEL.888010.2026' })
  await expect(draftRow({ docNo: '0001.BCEL.888010.2026' })).rejects.toThrow()
  await sys(() => transition(a, 1, 'cancelled', 'wrong dates'))
  await expect(draftRow({ docNo: '0001.BCEL.888010.2026' })).resolves.toBeTruthy()
})
it('seeds the HR roles', async () => {
  const roles = await sys(() => appDb().selectFrom('roles').select('key').where('key', 'in', ['hr_officer', 'management']).execute())
  expect(roles).toHaveLength(2)
})
```

- [ ] **Step 2: Run** `RUN_DB_TESTS=1 pnpm vitest run test/agreements-procedures.test.ts`: FAIL.
- [ ] **Step 3: Implement** migrations (`DROP PROCEDURE IF EXISTS` before each `CREATE PROCEDURE`), procedures,
  module skeleton (`dependsOn: ['authorization', 'hrm', 'auth-hrm', 'travel-master', 'audit', 'approval', 'files',
  'notifications']`), messages for the three keys.
- [ ] **Step 4: Run** step 2 (PASS), `pnpm run typecheck`.
- [ ] **Step 5: Commit** — `feat(agreements): tables, REF counter and status procedures, HR roles`

### Task 5: Draft agreements: create, edit, read, list, lookup

**Files:**
- Create: `apps/api/src/modules/agreements/schema.ts`, `queries.ts`, `scope.ts`, `routes.ts`
- Modify: `apps/api/src/modules/agreements/module.ts`
- Test: `apps/api/test/agreements.test.ts`

**Interfaces:**
- Consumes: `parseDocNo`, `formatDocNo`, `parseRef` (Task 3); `nextRef`, `transition` (Task 4); `findEmployee`,
  `findProvince`, `findDistrict`, `findPosition` (Task 2); `countryByIso2`, `listBorderRoutes` (plan 2);
  `employeeOfUser` (Task 2).
- Produces:
  - `AgreementInputSchema`: a zod discriminated union on `formType` over a common header (`subject`, `title`,
    `reference?`, `docNo` (string, parsed by `parseDocNo`, else `422 agreements.doc_no_invalid`), `docDate`,
    `travelFrom`, `travelTo`, `policyOption`, `hasAdvance`, `members` (1–50)) plus per form:
    `domestic {fromProvinceCode, toProvinceCode}` (must differ); `district {provinceCode, fromDistrictCode,
    toDistrictCode, overnight, sameDay50Km}` (`sameDay50Km` required when `overnight` is false, `null` otherwise;
    when not overnight `travelFrom = travelTo`); `overseas {countryIso2}`; `border {fromProvinceCode,
    borderRouteId | null, borderRouteOther | null}` (exactly one of the two).
  - `MemberInputSchema`: `eid` (5 digits), `departureDate?`, `returnDate?` (default the header dates),
    `daysSubtracted` (int ≥ 0, default 0), `isLeader`, `isDeputy`, `isAdvanceHolder` (default false),
    `hostMeals` (int ≥ 0, default 0), `privateCarKm` (int 1–5000 or null), `actingPositionCode` (or null).
  - `AgreementSchema` (response): header with `docNo` formatted for the request's language, `status`, `ref`,
    `version`, and `members[]` with inputs, snapshot, `calculatedDays`, `paidDays`.
  - `scope.ts`:
    - `callerScope(c): Promise<{ kind: 'all' } | { kind: 'branch'; branch: string } | { kind: 'own'; userId: string; eid: string | null }>` —
      super or (`agreement.read` and HRM branch `888010`) ⇒ `all`; `agreement.read` with another HRM branch ⇒
      `branch`; else `own` (member by EID or `created_by`). Memoised per request.
    - `scopedAgreements(c, qb)` returns a `ScopedSelect` via `scopedBy(qb, 'agreements: HRM branch or membership')`.
    - `mayRead(c, row): Promise<boolean>`; `mayCreateFor(c, branch): Promise<boolean>` (`agreement.create` and
      branch is the caller's own HRM branch, or caller is head office).
  - Routes (tag `Agreements`):
    - `POST /agreements` → 201 draft with REF; 403 without `agreement.create` or for another branch.
    - `GET /agreements` — list (`listQueryFrom`, filters `status`, `formType`, `branchCode`, `q` on REF/Doc.no/subject).
    - `GET /agreements/{id}` — 404 when out of scope.
    - `PUT /agreements/{id}` — whole draft with `version`; 409 `agreements.not_draft` unless `draft`; members replaced.
    - `GET /agreements/lookup?number=` — REF or any Doc.no spelling; 404 when not found or out of scope; for a Doc.no
      the live agreement, else the most recent cancelled one.
    - `GET /agreements/{id}/history` — record history.
  - Save checks (422 with paths): dates (`travelTo ≥ travelFrom`; each member inside the header dates,
    `returnDate ≥ departureDate`); `daysSubtracted ≤ calculatedDays`; `hostMeals ≤ calculatedDays × 3`; `year(docDate)
    = docNo.year`; codes exist (province, district of that province, country, active border route, acting position);
    every EID selectable in HRM (`agreements.member_not_found`); at most one leader and one holder; no holder when
    `hasAdvance` is false. Doc.no taken ⇒ `409 agreements.doc_no_taken` (map the unique key error). Snapshot
    fields filled from HRM on each save. `writeHistory` on create and update (`agreementHistory`, tracked header
    fields and `members` as a summary).

- [ ] **Step 1: Write the failing tests** (named; assertions as listed):
  - `creates a domestic draft with a REF and member days` — POST form 1 with two members, one with
    `daysSubtracted: 1` over `2026-11-02…2026-11-05`: 201, `ref` matches `/^TA-2026-\d{6}$/`, members
    `calculatedDays` 4 and `paidDays` 3, `docNo` `'0007.BCEL.888010.2026'` from input `'7/ທຄຕລ/010/2026'`, Lao
    response (`Accept-Language: lo`) shows `'0007.ທຄຕລ.888010.2026'`.
  - `checks each form's own fields` — form 2 not overnight with different dates: 422 `travelTo`; form 2 not
    overnight without `sameDay50Km`: 422; form 3 with `XX`: 422 `countryIso2`; form 4 with both route id and text:
    422; form 1 same province twice: 422.
  - Review Focus 1 — `refuses a Doc.no in use in any spelling, accepts it after cancel`.
  - Review Focus 2 — `refuses member dates that do not fit` (four cases, paths `members.0.returnDate`,
    `members.1.departureDate`, `members.0.daysSubtracted`, `members.0.hostMeals`).
  - Review Focus 3 (draft half) — `refuses an edit with a stale version` (409) and `edits a draft and replaces members`.
  - Review Focus 4 — `scopes by HRM branch and membership` (users from `hrmClient`: `10010` hr_officer 888010,
    `10020` hr_officer 888020, `10011` employee member, a head-office management user; by id, lookup, and list).
  - `refuses create without permission or for another branch` — employee 403; `10020` for branch 888010 403;
    `10010` (head office) for 888020 201.
  - `finds by REF and by Doc.no` — lookup with REF lower-case and Doc.no Lao spelling return the same id; unknown 404.
- [ ] **Step 2: Run** `RUN_DB_TESTS=1 pnpm vitest run test/agreements.test.ts`: FAIL.
- [ ] **Step 3: Implement** schema, queries, scope, routes; messages en/lo for every new key; `policyResources`
  is not used (scope is TypeScript).
- [ ] **Step 4: Run** step 2 (PASS); `pnpm run openapi`; `cd apps/web && pnpm run api:types`; typecheck.
- [ ] **Step 5: Commit** — `feat(agreements): draft agreements with REF, Doc.no checks and branch scope`

### Task 6: Submit, snapshot and approval

**Files:**
- Create: `apps/api/src/modules/agreements/approval.ts`, `snapshot.ts`, `workflow.json`
- Modify: `module.ts`, `routes.ts`
- Test: `apps/api/test/agreements-approval.test.ts`

**Interfaces:**
- Consumes: Task 4 `transition`; Task 5 queries and scope; `rankForPostType`, `countryByIso2`, `activeAccount`.
- Produces:
  - `snapshotForSubmit(agreementId): Promise<void>` — refreshes each member's snapshot from HRM; `rank_code` from
    the acting position's PostType when `actingPositionCode` is set, else the own position's; `account_lak` /
    `account_usd` from `activeAccount`; the agreement's `zone_code` (`D` for forms 1–2, `OB1` form 4, the
    country's zone form 3).
  - Submit checks (422, one error per member path): exactly one leader (`agreements.leader_required`); with
    `hasAdvance` exactly one holder (`agreements.holder_required`); rank found (`agreements.rank_unmapped`);
    accounts per spec §5: LAK for every member of forms 1, 2, 4, USD for every member of form 3, USD for the holder
    of a form 3 or 4 agreement with an advance (`agreements.account_missing`, path `members.<n>.accountLak|accountUsd`);
    at least one attached file (`agreements.signed_copy_required`); member still selectable.
  - `POST /agreements/{id}/submit` (body `SubmitBody`) — creator or an `agreement.create` holder in scope; draft
    only; runs checks, snapshot, `transition(→in_approval)` and `APPROVAL.submit('agreement', id, userId,
    { workflow })` in one transaction, so a refusal (e.g. `approval.no_approvers`) leaves it `draft`.
  - `agreementApproval` entity (`type: 'agreement'`): facts `{ branchCode, formType, hasAdvance, headOffice }`;
    `canView` = `mayRead`; `display` link `/agreements/:id`; `onStatusChange`: `approved` ⇒ `transition(→approved)`
    and notify the branch's `finance_officer` users (`agreements.approved`); `returned` | `rejected` | `cancelled`
    ⇒ `transition(→draft)` unless the agreement is already `cancelled` (Task 7 sets that first).
  - Resolvers `agreement.section_head`, `agreement.department_head`, `agreement.management`: active users holding
    role `hr_section_head` / `hr_department_head` / `management` (directly or via a group) whose HRM branch equals
    `facts.branchCode`. One helper `branchRoleUsers(roleKey, branch): Promise<string[]>`.
  - `workflow.json`: three stages `section_head`, `department_head`, `management`, each one `any` step with
    `{ resolver: 'agreement.<stage>' }`; `allowSelfApproval: false`. Step 1 of spec §8 (the preparing officer) is
    the submission itself.
  - Notification types `agreements.approved`, `agreements.cancelled` (in-app only).
- [ ] **Step 1: Write the failing tests:**
  - `submits, snapshots and runs the three steps` — workflow posted from `workflow.json` through
    `/approval/workflows` (+ version `activate: true`); `10010` submits; inbox of `10011` has it; approvals by
    `10011`, `10012`, `10013` in turn; status `approved`; member `rankCode` `'P3'` for the PostType-7 member; finance
    officer of 888010 got `agreements.approved`, the one of 888020 did not.
  - `takes the rank of the post filled` — member with `actingPositionCode` of a PostType-7 position gets `P3`.
  - `refuses an incomplete submission` — no leader, advance without holder, unmapped PostType, `10020` member on a
    form 3 (no USD account), no signed copy: each its code and path, status still `draft`.
  - Review Focus 3 (after submit) — `PUT` while `in_approval` and after `approved`: 409 `agreements.not_draft`.
  - `returns to draft when a reviewer returns it` — `10011` returns with a comment; status `draft`; resubmit works.
  - Review Focus 5 — `stays draft when a step has no approver` — branch 888020 agreement before any 888020 section
    head exists: 422 `approval.no_approvers`, status `draft`, same REF; grant role, submit again: `in_approval`.
  - `refuses submit by someone out of scope` — `10020` on an 888010 draft: 404.
- [ ] **Step 2: Run** `RUN_DB_TESTS=1 pnpm vitest run test/agreements-approval.test.ts`: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** step 2 (PASS), the whole suite, openapi + api types.
- [ ] **Step 5: Commit** — `feat(agreements): submit with HRM snapshot and branch approval chain`

### Task 7: Cancel and signed copies

**Files:**
- Create: `apps/api/src/modules/agreements/files.ts`
- Modify: `module.ts`, `routes.ts`
- Test: `apps/api/test/agreements-cancel.test.ts`

**Interfaces:**
- Produces:
  - `agreementFiles` file entity (`type: 'agreement'`, `accept: ['application/pdf', 'image/jpeg', 'image/png']`,
    `maxSize: 52428800`): `canView` = `mayRead`; `canAttach` = draft and (creator or `agreement.create` in scope).
  - `POST /agreements/{id}/cancel` `{ version, reason (1–500) }` — allowed to an `agreement.cancel` holder in
    scope, or a current approver (`APPROVAL.isApproverOf`); not `cancelled`; runs `transition(→cancelled)`, then
    `APPROVAL.cancelForEntity` when a request is open; notifies the creator (`agreements.cancelled`); audit
    `agreements.cancelled` with the reason. Plan 4 adds "cancelled after export".
- [ ] **Step 1: Write the failing tests:**
  - `cancels in approval with a reason and frees the Doc.no` — approver `10011` cancels: 200, status `cancelled`,
    request cancelled (inbox empty), creator notified; a new draft with the same Doc.no: 201 with a new REF.
  - `needs a reason` — empty reason: 422; `refuses a second cancel` — 409 `agreements.bad_transition`.
  - `refuses cancel without the right` — employee member: 403; `10020` on an 888010 agreement: 404.
  - `accepts PDF, JPG, PNG only` — upload a `.txt`: refused; a PDF: 201; upload after submit: 403.
- [ ] **Step 2–4:** run `RUN_DB_TESTS=1 pnpm vitest run test/agreements-cancel.test.ts` (FAIL), implement, PASS.
- [ ] **Step 5: Commit** — `feat(agreements): cancel with a reason, signed copies`

### Task 8: Web screens

**Files:**
- Create: `apps/web/app/composables/useAgreements.ts`, `apps/web/app/pages/agreements/index.vue` (list with
  status/form filters and the REF/Doc.no box), `new.vue`, `[id]/index.vue` (detail: header, members, files tab
  with `PlatformFilesAttachments`, approval history, Submit / Cancel buttons), `[id]/edit.vue`,
  `apps/web/app/components/agreements/AgreementForm.vue` (header per form type, members table with EID typed →
  HRM name filled, calculated and paid days, role checkboxes), `MemberRow.vue`
- Modify: `apps/web/i18n/locales/app.en.json`, `app.lo.json` (keys under `agreements.*`), module `menus`
  (`/agreements`, group `workspace`, `permission: 'agreement.read'`, and for employees a "My agreements" entry
  without permission)
- Test: `apps/api/test/app.test.ts` is unchanged; web checks are typecheck plus a browser check

**Interfaces:**
- Consumes: the Task 5–7 routes through `api.d.ts` types; `/hrm/provinces`, `/hrm/positions`, `/hrm/employees/{eid}`,
  `/travel-master/countries`, `/travel-master/border-routes`.
- Follow `pages/master/*` and `useTravelMaster.ts` for the API calls, error mapping (`useFormErrors`) and tables.
- [ ] **Step 1: Implement** the pages and strings (every string en and lo; dates `YYYY-MM-DD`; Doc.no shown by
  language).
- [ ] **Step 2: Run** `pnpm run typecheck`: no errors.
- [ ] **Step 3: Browser check** on `pnpm dev:api` (:3335) + `pnpm dev:web` (:3336): create each form type, submit,
  approve through `/approvals`, cancel, look up by REF and Doc.no, in en and lo.
- [ ] **Step 4: Commit** — `feat(web): agreement screens`

### Task 9: Docs

**Files:**
- Modify: `HANDOFF.md` (plan 3 built, decisions: REF format, Doc.no six digits, TypeScript branch scope,
  workflow set-up), `docs/deploy-testing.md` (after install: create the agreement workflow from
  `apps/api/src/modules/agreements/workflow.json` in Administration → Approvals and make it default; assign roles)
- [ ] **Step 1:** write both; `RUN_DB_TESTS=1 pnpm run test`, `pnpm run typecheck`, `cd apps/api && pnpm run
  openapi:verify` all pass.
- [ ] **Step 2: Commit** — `docs: HANDOFF after plan 3`

## Not in this plan

- Payment calculation, checking table, "cancelled after export" (plan 4); settlement (plan 5); printable views,
  dashboard, reminders, transit form (plan 6).
- Delegation of approvals is out of version 1 (spec §3); the platform's delegation screen is not hidden in this
  plan.
