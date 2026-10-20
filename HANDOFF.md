# Handoff — hr-fam (2026-10-20)

Travel payment app for BCEL on nelvine-platform. Working name "HR-FAM" until the business names it (ຂ9).
No code yet; the next step is plan 1.

## Start here

- **Spec:** [`docs/specs/2026-10-20-travel-payment-design-v2.md`](docs/specs/2026-10-20-travel-payment-design-v2.md).
  v1 (`2026-10-13`) is kept for history only.
- **Business answers:** [`docs/travel-payment-answers.json`](docs/travel-payment-answers.json) (export of
  2026-10-20T08:16), questions in [`docs/questions-for-business-finance-lo.html`](docs/questions-for-business-finance-lo.html).
  Corrections given in chat on 2026-10-20 are already in spec v2: ກ2 days are subtracted by hand (an input),
  Doc.no carries the full six-digit branch code (`0001.BCEL.888010.2026`), host-meal rounding is ÷ 3 rounded up
  to a whole unit of the currency (100 USD → 34 USD).
- **Next:** execute [plan 1](docs/superpowers/plans/2026-10-20-plan-1-foundation.md) (scaffold, HRM read layer,
  HRM sign-in).

## Approach: app first, platform later

nelvine-platform is at `1.0.0` and has none of the proposal's items released
([`docs/proposals/2026-10-15-nelvine-platform-gaps.md`](docs/proposals/2026-10-15-nelvine-platform-gaps.md)).
The app builds what it needs in its own modules, behind interfaces shaped like the proposal, and swaps each for
the platform package once released.

| Proposal item               | Platform state (2026-10-20)                                     | In this app                                                     |
| --------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| M1 data sources             | Built on platform `main` (tasks 1–5 of 7), not released          | Used directly (`source('hrm')`); plan 1 needs a release or `--link` |
| M2 portal sign-in handoff   | Next on the platform roadmap                                     | App module `auth-hrm` (plan 1); swap later                      |
| M3 document numbering       | Not started                                                      | REF counter and Doc.no parser in `agreements` (plan 3)          |
| M4 reference data           | Not started                                                      | Effective-dated tables in `travel-master` (plan 2)              |
| C1 org approval routing     | Not started                                                      | Approval resolvers in the app (plans 3–5)                       |
| C2 XLSX writer              | Not started                                                      | App writer behind an interface (plan 4)                         |
| C4 money helpers            | Not started                                                      | App helper for decimals and rounding (plan 2)                   |
| N1 calendar, N2 posting     | Not started                                                      | App code (plans 4–5)                                            |

Report back to the platform team what the app learns (shape of `auth-hrm`, numbering, refdata), so the platform
packages fit the first real consumer.

## Plans

| Plan | Spec §18 step                                            | State        |
| ---- | -------------------------------------------------------- | ------------ |
| 1    | Scaffold, HRM read layer, sign-in handoff                | Written      |
| 2    | Master data with seed (ranks, zones, rates, bands, fuel, GL) | To write |
| 3    | Agreements: forms 1–4, REF, Doc.no, approval             | To write     |
| 4    | Payment calculation, checking table, upload file         | To write     |
| 5    | Settlement, approval chain, posting batch                | To write     |
| 6    | Dashboard, reminders, printable views, transit form      | To write     |

Write each plan when the previous one is done, so it can use the real code.

## Decisions made while planning (2026-10-20)

- **Handoff single use is enforced in the app database**, not by marking the HRM row used: platform M1 makes every
  source read-only, so the app records redeemed code hashes in `hrm_handoff_redemptions` (unique key). The app's
  HRM user needs `SELECT` only, including on `tb_app_handoff`. Spec v2 §6 and §15 say so.
- **Stored procedures, partly** (agreed with the user): the app's own rule-heavy writes go in procedures called
  with `callProcedure` (REF allocation, status transitions, posting batch creation with the balance check,
  settlement posting). Calculation, permissions, scopes, validation, lists and audit stay in TypeScript. HRM is
  read through its tables, not its procedures: the app's HRM user gets `SELECT` on the listed tables, no
  `EXECUTE` (user, 2026-10-20). If the HRM team later allows only procedures, the read layer (`hrm` module) and
  the platform data source need a read-only procedure call; revisit then.
- HRM users get `username = EID`, no e-mail, no password, no MFA; linked through the app table `hrm_user_links`
  (shaped like `auth-oidc`'s `user_identities`).
- HRM logout: a job every minute revokes sessions of users whose EID has no `tb_current_login` row. Idle timeout
  `AUTH_SESSION_IDLE_MINUTES=240` (ຂ6).
- Web: `/auth/sign-in` redirects to the HRM login page; `/auth/sign-in?local=1` keeps the platform sign-in for the
  bootstrap administrator. (Platform gap: the sign-in path is fixed in `@elvine-sk/platform-nuxt`; worth adding to M2.)
- `hrm_employee_account_currency` has two shapes: the dump of 2026-10-13 shows the old draft
  (`account_id, account_currency`); the current one is in `personnel_account_FROM_HRM_V3.sql`
  (`id, eid, ccy, account_no, account_name, is_deleted`). The app uses the current one. Check on testing (ຂ2).

## Blockers and open items

Blocking plan 1:

- Platform release with data sources, or create with `--link ../nelvine-platform`.
- App name and URLs (ຂ9); the working name `hr-fam` is used until then.
- Testing database user (ຂ7) and the HRM team adding `tb_app_handoff` and the redirect (ຂ5). Plan 1 builds and
  tests against a local copy; only the real sign-in from HRM waits on this.

Blocking later plans: the `PostType` → `P1`–`P9` map (ຂ1, plan 2), the border routes (ກ7, plan 2), forms 2 and 4
options (ກ6, plan 3), GL string and upload file details (ກ24, ກ25, plan 4), settlement accounts and branch chain
(ກ22, ກ19, plan 5). The full list is spec v2 §17.

Not done:

- No git repository yet; plan 1 Task 1 creates it, local only: no remote, no push (user, 2026-10-20).
  `docs-and-facts-of-project/` and its zip (bank documents) are git-ignored, never committed.
- Deployment (PM2 on the testing server, build off-server) is in spec v2 §15 but not in any plan yet; add it to
  plan 2 or a small plan once plan 1 runs locally.
