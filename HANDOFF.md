# Handoff — hr-fam (2026-10-20)

Travel payment app for BCEL on nelvine-platform. Working name "HR-FAM" until the business names it (ຂ9).
**Plan 1 is built** on branch `plan-1-foundation` (local git only, not merged into `main`): the app scaffold, the
HRM read layer and sign-in from HRM. Next: plan 2.

## Start here

- **Spec:** [`docs/specs/2026-10-20-travel-payment-design-v2.md`](docs/specs/2026-10-20-travel-payment-design-v2.md).
  v1 (`2026-10-13`) is kept for history only.
- **Business answers:** [`docs/travel-payment-answers.json`](docs/travel-payment-answers.json) (export of
  2026-10-20T08:16), questions in [`docs/questions-for-business-finance-lo.html`](docs/questions-for-business-finance-lo.html).
  Corrections given in chat on 2026-10-20 are already in spec v2: ກ2 days are subtracted by hand (an input),
  Doc.no carries the full six-digit branch code (`0001.BCEL.888010.2026`), host-meal rounding is ÷ 3 rounded up
  to a whole unit of the currency (100 USD → 34 USD).
- **Done:** [plan 1](docs/superpowers/plans/2026-10-20-plan-1-foundation.md). **Next:** write plan 2 (master data).
- **HRM team kit:** [`docs/hrm-handoff.md`](docs/hrm-handoff.md) (handoff table, redirect script, grants, errors).

## Run it

```sh
docker compose up -d                 # MariaDB on localhost:3308 (3306 is taken on this machine)
pnpm install && pnpm migrate
# local HRM copy (fixture employees), see docs/hrm-handoff.md "Local copy"
pnpm dev:api                         # :3001
pnpm dev:web                         # :3000
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
| 2    | Master data with seed (ranks, zones, rates, bands, fuel, GL) | To write |
| 3    | Agreements: forms 1–4, REF, Doc.no, approval             | To write     |
| 4    | Payment calculation, checking table, upload file         | To write     |
| 5    | Settlement, approval chain, posting batch                | To write     |
| 6    | Dashboard, reminders, printable views, transit form      | To write     |

Write each plan when the previous one is done, so it can use the real code.

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
- `NUXT_PUBLIC_HRM_LOGIN_URL` is fixed at web build time (static SPA): build per environment.
- `/me` says "not linked" for any error, also when HRM is down.

## Blockers and open items

- App name and URLs (ຂ9); the working name `hr-fam` is used until then.
- Testing database user (ຂ7) and the HRM team adding `tb_app_handoff` and the redirect (ຂ5, kit in
  `docs/hrm-handoff.md`). Only the real sign-in from HRM waits on this.
- Later plans: the `PostType` → `P1`–`P9` map (ຂ1, plan 2), the border routes (ກ7, plan 2), forms 2 and 4 options
  (ກ6, plan 3), GL string and upload file details (ກ24, ກ25, plan 4), settlement accounts and branch chain (ກ22,
  ກ19, plan 5). The full list is spec v2 §17.
- Deployment (PM2 on the testing server, build off-server, spec v2 §15) is in no plan yet; add it to plan 2 or a
  small plan.
- Branch `plan-1-foundation` is not merged into `main` yet.
