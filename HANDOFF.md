# Handoff — hr-fam (2026-10-21)

Travel payment app for BCEL on nelvine-platform. Working name "HR-FAM" until the business names it (ຂ9).
**Plans 1 and 2 are built** (local git only): plan 1 the app scaffold, the HRM read layer and sign-in from
HRM; plan 2 the master data and the PM2 bundle. Next: plan 3 (agreements).

## Start here

- **Spec:** [`docs/specs/2026-10-21-travel-payment-design-v3.md`](docs/specs/2026-10-21-travel-payment-design-v3.md).
  v2 (`2026-10-20`) and v1 (`2026-10-13`) are kept for history only.
- **Business answers:** [`docs/travel-payment-answers.json`](docs/travel-payment-answers.json) (export of
  2026-10-21T02:44), questions in [`docs/questions-for-business-finance-lo.html`](docs/questions-for-business-finance-lo.html),
  plus the updated `2. ກຳນົດ code and data.xlsx` (2026-10-16) and `4. Format form FA-M.xlsx` (2026-10-20, new
  sheets `GL` and `ສາຍເດີນ`). All are in spec v3; its §17 lists what is still open. The Doc.no branch part
  (3 digits per ກ12, 6 digits per the chat of 2026-10-20) is undecided.
- **Done:** [plan 1](docs/superpowers/plans/2026-10-20-plan-1-foundation.md), plan 2 (master data, deployment bundle).
  **Next:** write plan 3 (agreements).
- **HRM team kit:** [`docs/hrm-handoff.md`](docs/hrm-handoff.md) (handoff table, redirect script, grants, errors).

## Run it

```sh
docker compose up -d                 # MariaDB on localhost:3308 (3306 is taken on this machine)
pnpm install && pnpm migrate
# local HRM copy (fixture employees), see docs/hrm-handoff.md "Local copy"
pnpm dev:api                         # :3001
pnpm dev:web                         # :3000
tooling/deploy/bundle.sh --hrm-login-url <URL>   # build/hr-fam-<sha>.tar.gz for the testing server
RUN_DB_TESTS=1 pnpm test             # 44 tests; the test DBs are built on :3308 by global-setup
```

`http://localhost:3001/api/v1/auth/hrm?code=valid-10001` signs in as fixture employee `10001` once per load of the
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
  routes under `/api/v1/travel-master`; effective-dated sets (a new set closes the previous one).
- Web: master data pages under `/master`.
- Deployment: `ecosystem.config.cjs` (PM2: `api`, `worker`, `web`, one instance each) and
  `tooling/deploy/bundle.sh --hrm-login-url <URL>`, which typechecks, builds the web (the login URL goes into
  `apps/web/hrm-login-url.txt`), copies the API with real production `node_modules` (no links, `tsx` added) and writes
  `build/hr-fam-<sha>.tar.gz`. Build it on the server's OS (Linux x64): argon2 and esbuild are native.
  Install steps for `10.0.7.110`: [`docs/deploy-testing.md`](docs/deploy-testing.md).

## Approach: app first, platform later

nelvine-platform is at `1.0.0` and has none of the proposal's items released
([`docs/proposals/2026-10-15-nelvine-platform-gaps.md`](docs/proposals/2026-10-15-nelvine-platform-gaps.md)).
The app builds what it needs in its own modules, behind interfaces shaped like the proposal, and swaps each for
the platform package once released.

| Proposal item               | Platform state (2026-10-20)                                     | In this app                                                     |
| --------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| M1 data sources             | On platform `main` (tasks 1–5 of 7), not released                | Used directly (`source('hrm')`); the app is linked to `../nelvine-platform` |
| M2 portal sign-in handoff   | Next on the platform roadmap                                     | App module `auth-hrm` (built); swap later                       |
| M3 document numbering       | Not started                                                      | REF counter and Doc.no parser in `agreements` (plan 3)          |
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
| 3    | Agreements: forms 1–4, REF, Doc.no, approval             | To write     |
| 4    | Payment calculation, checking table, upload file         | To write     |
| 5    | Settlement, approval chain, posting batch                | To write     |
| 6    | Dashboard, reminders, printable views, transit form      | To write     |

Plan 3 is next. Write each plan when the previous one is done, so it can use the real code.

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

## Blockers and open items

- App name and URLs (ຂ9); the working name `hr-fam` is used until then.
- Testing database user (ຂ7) and the HRM team adding `tb_app_handoff` and the redirect (ຂ5, kit in
  `docs/hrm-handoff.md`). Only the real sign-in from HRM waits on this.
- Open items in the plan 2 seed: spec v3 §17 business question 2 (the unclear Europe-group-1 word; Italy and
  Brazil depend on it), the `PostType` → `P1`–`P9` map (ຂ1), the Lao spelling of AE to confirm, and the
  Caucasus countries (AM, AZ, GE) seeded in zone group OA2. The visual browser checks of the `/master` pages
  are still to do.
- Later plans: the Doc.no branch part (plan 3),
  the overseas LAK/USD entries, fuel and border entries, `REMARK` (plan 4), the holding-account timing and `RVS_NO`
  (plan 5). The full list, with the build step each blocks, is spec v3 §17–18.
- Deployment: PM2 bundle built (see above); not yet installed on the testing server.
