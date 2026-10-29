# Handoff — hr-fam (2026-10-29)

Travel payment app for BCEL on nelvine-platform. Working name "HR-FAM" until the business names it (ຂ9).
**Plans 1–3 are built** (local git only): plan 1 the app scaffold, the HRM read layer and sign-in from HRM;
plan 2 the master data and the PM2 bundle; plan 3 the agreements (forms 1–4, REF, Doc.no, approval, cancel).
Next: plan 4 (payment calculation, checking table, upload file).

## Start here

- **Spec:** [`docs/specs/2026-10-21-travel-payment-design-v3.md`](docs/specs/2026-10-21-travel-payment-design-v3.md).
  v2 (`2026-10-20`) and v1 (`2026-10-13`) are kept for history only.
- **Business answers:** [`docs/travel-payment-answers.json`](docs/travel-payment-answers.json) (export of
  2026-10-21T02:44), questions in [`docs/questions-for-business-finance-lo.html`](docs/questions-for-business-finance-lo.html),
  plus the updated `2. ກຳນົດ code and data.xlsx` (2026-10-16) and `4. Format form FA-M.xlsx` (2026-10-20, new
  sheets `GL` and `ສາຍເດີນ`). All are in spec v3; its §17 lists what is still open. The Doc.no branch part
  is six digits (`888010`, decided 2026-10-29).
- **Done:** [plan 1](docs/superpowers/plans/2026-10-20-plan-1-foundation.md),
  [plan 2](docs/superpowers/plans/2026-10-21-plan-2-master-data.md),
  [plan 3](docs/superpowers/plans/2026-10-29-plan-3-agreements.md). **Next:** write plan 4.
- **HRM team kit:** [`docs/hrm-handoff.md`](docs/hrm-handoff.md) (handoff table, redirect script, grants, errors).

## Run it

```sh
docker compose up -d                 # MariaDB on localhost:3308 (3306 is taken on this machine)
pnpm install && pnpm migrate
# local HRM copy (fixture employees), see docs/hrm-handoff.md "Local copy"
pnpm dev:api                         # :3335
pnpm dev:web                         # :3336
tooling/deploy/bundle.sh --hrm-login-url <URL>   # build/hr-fam-<sha>.tar.gz for the testing server
RUN_DB_TESTS=1 pnpm test             # 135 tests; the test DBs are built on :3308 by global-setup
```

`http://localhost:3335/api/v1/auth/hrm?code=valid-10001` signs in as fixture employee `10001` once per load of the
local HRM copy. `/auth/sign-in?local=1` is the platform sign-in for the bootstrap administrator
(`pnpm --filter ./apps/api platform admin:create`).

## What plan 1 built

- `apps/api/src/sources/hrm.ts`: hand-written types of the HRM tables read (upper-case columns as camelCase;
  PascalCase `hrm_position` columns in lower case, e.g. `postname`).
- `hrm` module: `findEmployee`, `selectableEmployees` (the four filters + EID not null), `activeAccount`,
  `loggedInEids`; routes `GET /hrm/employees` (picker, `hrm_employee.read`, `q` required, 20 per page),
  `GET /hrm/employees/{eid}`.
- `auth-hrm` module: `GET /auth/hrm?code=` (public), `GET /hrm/me`; tables `hrm_user_links`,
  `hrm_handoff_redemptions`; role `employee` seeded; job `auth_hrm.sync_sessions` every minute.
- Web: `middleware/hrm-sign-in.global.ts` + `utils/hrmSignIn.ts`, page `/me` ("My HRM profile").
- Tests: `apps/api/test/` with the HRM test source (`test/sources/hrm.schema.sql`, `hrm.fixtures.sql`).

Reviews: a security review of the sign-in (0 Critical, 5 Important, all fixed) and a light whole-branch review
(2 Important, fixed). Deferred minors are listed below.

## What plan 2 built

- `travel-master` module: reference tables (ranks, zones, countries, border routes, rank map, rates, flat
  rates, advance bands, fuel, GL), seeded from the code file and the regulation; lookups `rankForPostType`,
  `zoneOf`, `countryByIso2`, `rateOn`, `flatRateOn`, `advanceOn`; a money helper (decimals and rounding);
  routes under `/api/v1/travel-master`; effective-dated sets (a new set closes the previous one). A set must start after today, except the fuel price,
  which may start today (`fuel_price` only; earlier dates answer 409 `travel_master.set_in_effect`).
- Web: master data pages under `/master`.
- Deployment: `ecosystem.config.cjs` (PM2: `api`, `worker`, `web`, one instance each) and
  `tooling/deploy/bundle.sh --hrm-login-url <URL>`, which typechecks, builds the web (the login URL goes into
  `apps/web/hrm-login-url.txt`), copies the API with real production `node_modules` (no links, `tsx` added) and writes
  `build/hr-fam-<sha>.tar.gz`. Build it on the server's OS (Linux x64): argon2 and esbuild are native; `bundle.sh` refuses elsewhere unless
  `--allow-non-linux` (inspection only).
  Install steps for `10.0.7.110`: [`docs/deploy-testing.md`](docs/deploy-testing.md).

## What plan 3 built

- `agreements` module: tables `agreements`, `agreement_members`, `agreement_ref_counters`; procedures
  `agreements_next_ref` (REF `TA-YYYY-NNNNNN`, counter per HRM year) and `agreements_transition` (status changes,
  writes the history row); roles `hr_officer`, `hr_section_head`, `hr_department_head`, `management`,
  `finance_officer` seeded with their permissions.
- Routes under `/api/v1/agreements`: create, list, get, `PUT` (drafts only), `lookup?number=` (REF or any Doc.no
  spelling), history, `submit`, `cancel`. Doc.no is stored `NNNN.BCEL.888010.YYYY` (six-digit branch, decided
  2026-10-29), shown in Lao as `ທຄຕລ`; one live agreement per Doc.no (generated column + unique key).
- Who sees what is TypeScript (`agreements/scope.ts`): head office `agreement.read` holders see all, other
  branches their own HRM branch, everyone else their memberships and their own drafts. Platform policies cannot see
  the HRM branch (no `subjectAttributes` hook in the generated `platform.modules.ts`). **Later (agreed
  2026-10-29):** ask the platform team to let apps pass `subjectAttributes`, then move the branch rule to a policy.
- Submission (`onStatusChange('pending')`, so the platform's resubmit gets it too): refreshes the HRM snapshot
  (names, position, rank from the rank map or the post filled, LAK/USD accounts), sets the zone, and refuses
  without one leader, the advance holder, a rank, the accounts the payment needs, or a signed copy.
- Approval: workflow `apps/api/src/modules/agreements/workflow.json`, resolvers `agreement.section_head`,
  `agreement.department_head`, `agreement.management` (role holders of the agreement's HRM branch). Approved
  notifies the branch's `finance_officer` users; return, reject or withdraw goes back to draft; cancel needs a
  reason and frees the Doc.no.
- `hrm` module: `GET /hrm/provinces`, `/hrm/provinces/{code}/districts`, `/hrm/positions?q=`; `employeeOfUser`.
- Web: `/agreements` (list, REF/Doc.no box), `/agreements/new?form=`, `/agreements/{id}` (members, signed copy,
  history, approval card, cancel), `/agreements/{id}/edit`.
- Set-up on a server: [`docs/deploy-testing.md`](docs/deploy-testing.md) "Agreement approval and roles".
- Not checked in a browser yet (no browser tool in the build session): try each form in en and lo.

## Approach: app first, platform later

nelvine-platform is at `1.0.0` and has none of the proposal's items released
([`docs/proposals/2026-10-15-nelvine-platform-gaps.md`](docs/proposals/2026-10-15-nelvine-platform-gaps.md)).
The app builds what it needs in its own modules, behind interfaces shaped like the proposal, and swaps each for
the platform package once released.

| Proposal item               | Platform state (2026-10-20)                                     | In this app                                                     |
| --------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| M1 data sources             | On platform `main` (tasks 1–5 of 7), not released                | Used directly (`source('hrm')`); the app is linked to `../nelvine-platform` |
| M2 portal sign-in handoff   | Next on the platform roadmap                                     | App module `auth-hrm` (built); swap later                       |
| M3 document numbering       | Not started                                                      | REF counter and Doc.no parser in `agreements` (plan 3, built)   |
| M4 reference data           | Not started                                                      | Effective-dated tables in `travel-master` (plan 2)              |
| C1 org approval routing     | Not started                                                      | Approval resolvers in the app (plans 3–5)                       |
| C2 XLSX writer              | Not started                                                      | App writer behind an interface (plan 4)                         |
| C4 money helpers            | Not started                                                      | App helper for decimals and rounding (plan 2)                   |
| N1 calendar, N2 posting     | Not started                                                      | App code (plans 4–5)                                            |

The app depends on the platform checkout by absolute `link:` paths (`.nelvrc.json`, `apps/*/package.json`). When
the platform releases data sources, run `nelv upgrade` to move to the registry version.

Worth reporting to the platform team (feeds M2): an app needs a configurable sign-in URL in
`@elvine-sk/platform-nuxt` (the app works around it with a middleware), `sourcePicker` answers 422 not 400, and
PascalCase upstream columns do not survive `CamelCasePlugin`.

## Plans

| Plan | Spec §18 step                                            | State        |
| ---- | -------------------------------------------------------- | ------------ |
| 1    | Scaffold, HRM read layer, sign-in handoff                | Done         |
| 2    | Master data with seed (ranks, zones, rates, bands, fuel, GL), PM2 bundle | Done |
| 3    | Agreements: forms 1–4, REF, Doc.no, approval             | Done         |
| 4    | Payment calculation, checking table, upload file         | To write     |
| 5    | Settlement, approval chain, posting batch                | To write     |
| 6    | Dashboard, reminders, printable views, transit form      | To write     |

Plan 4 is next. Write each plan when the previous one is done, so it can use the real code.

## Decisions

- **Handoff single use is enforced in the app database**: HRM's `tb_app_handoff` is only read; redeemed code
  hashes go in `hrm_handoff_redemptions` (primary key). The app's HRM user needs `SELECT` only.
- **Stored procedures, partly** (agreed with the user): REF allocation, status transitions, posting batch
  creation and settlement posting go in procedures (`callProcedure`). Calculation, permissions, scopes,
  validation, lists and audit stay in TypeScript. HRM is read through its tables with `SELECT`, no `EXECUTE`
  (user, 2026-10-20); if HRM later allows only procedures, the `hrm` module needs a read-only procedure call.
- HRM users: `username = EID`, no e-mail, no password, no MFA, role `employee`, linked through `hrm_user_links`.
- Sign-in revokes the browser's previous session. Optional `HRM_ORIGIN`: when set, only handoffs whose `Referer`
  is an HRM page are accepted — **set it on testing and production** once HRM is seen sending the header; without
  it a code can be planted from another site (login CSRF, review finding I1).
- Logout sync (every minute) ends sessions of users without a `tb_current_login` row and of employees no longer
  selectable; it refuses, and fails the job, when more than half of 10+ signed-in users would be signed out.
- Idle timeout `AUTH_SESSION_IDLE_MINUTES=240` (ຂ6). Per-IP sign-in limit 600 per 10 minutes; set
  `TRUSTED_PROXIES` behind a reverse proxy.
- `hrm_employee_account_currency`: the app uses the current shape from `personnel_account_FROM_HRM_V3.sql`, not
  the older draft in the dump. Check on testing (ຂ2). `hrm_unit` is joined on (branch, unit).
- Git: local only, no remote, no push. `docs-and-facts-of-project/` and its zip are git-ignored.

## Deferred minors (from the reviews)

- Handoff expiry is compared on the app's clock, not HRM's `NOW()`; no cap on `expires_at − created_at`.
- Two first-time sign-ins of one EID at the same instant: the second gets `auth_hrm.failed` (retry works).
- A local user whose username equals an EID blocks that employee (generic `failed`); EID reuse by HRM would
  inherit the old account. Confirm with HRM that EIDs are never reused.
- `markLoggedIn` is not called, so HRM sign-ins have no `auth.login.succeeded` audit event (they have
  `auth.hrm.login`).
- Codes travel in the URL: strip `code` from reverse-proxy logs. `hrm_handoff_redemptions` is never cleaned.
- HRM users have no MFA: do not give them administrator roles without a decision.
- `findEmployee` shows a NULL `BRANCH_CODE` as `888010`; no fixtures for NULL organisation fields.
- `NUXT_PUBLIC_HRM_LOGIN_URL` is read by the web server when it starts (the build does not bake it in); the PM2
  bundle stores it in `apps/web/hrm-login-url.txt` and `ecosystem.config.cjs` passes it on.
- `/me` says "not linked" for any error, also when HRM is down.

Carry into plan 4:

- Fuel = distance ÷ `km_per_litre` (an Amount, `"7.00"`) needs a helper that divides by an Amount and a rounding
  rule the spec does not give yet; validate totals fit 13 digits before writing; test the money guards.
  `flatRateOn('fuel_price')` is `null` until a price is entered: treat it as "cannot calculate".
- The seed migration imports `RANK_CODES` from `lookups.ts`; keep that constant unchanged (the seed is frozen).
- Cancel after the payment batch is exported must mark the batch "cancelled after export" (spec §8, ກ16): hook it
  into `POST /agreements/{id}/cancel`.
- `shared/db.ts` types the app's tables; new plan 4 tables go there too.
- Test files share one database per run: give each file its own people (fixture EIDs), Doc.no year
  (`domesticBodies(year)`) and REF year when it counts them.

## Blockers and open items

- App name and URLs (ຂ9); the working name `hr-fam` is used until then.
- Testing database user (ຂ7) and the HRM team adding `tb_app_handoff` and the redirect (ຂ5, kit in
  `docs/hrm-handoff.md`). Only the real sign-in from HRM waits on this.
- Open items in the plan 2 seed: spec v3 §17 business question 2 (the unclear Europe-group-1 word; Italy and
  Brazil depend on it), the `PostType` → `P1`–`P9` map (ຂ1), the Lao spelling of AE to confirm, and the
  Caucasus countries (AM, AZ, GE) seeded in zone group OA2. The visual browser checks of the `/master` pages
  are still to do.
- Later plans: the overseas LAK/USD entries, fuel and border entries, `REMARK` (plan 4), the holding-account timing and `RVS_NO`
  (plan 5). The full list, with the build step each blocks, is spec v3 §17–18.
- Deployment: PM2 bundle built (see above); not yet installed on the testing server.
