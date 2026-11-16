# Handoff — hr-fam (2026-11-16)

Travel payment app for BCEL on nelvine-platform. Working name "HR-FAM" until the business names it (ຂ9).
**Plans 1–6 are built** (local git only): plan 1 the app scaffold, the HRM read layer and sign-in from HRM;
plan 2 the master data and the PM2 bundle; plan 3 the agreements (forms 1–4, REF, Doc.no, approval, cancel);
plan 4 the payments (calculation, checking table, approval, posting batch and upload file); plan 5 the advance
settlement (forms 5–6, approval chain, settlement and clearing files); plan 6 the dashboard, settlement reminders,
PDF forms 1–6 and the carried fixes. Since then: print fixes, the three approval workflows shipped with the app,
and a profile card in the sidebar ("After plan 6"). Platform: copied files at 1.1.0, linked packages at 1.3.0
(see "Approach").
Next: plan 7 (the transit form of regulation 4.7, once the business supplies its layout: question 13).

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
  [plan 3](docs/superpowers/plans/2026-10-29-plan-3-agreements.md),
  [plan 4](docs/superpowers/plans/2026-10-29-plan-4-payments.md),
  [plan 5](docs/superpowers/plans/2026-11-02-plan-5-settlements.md),
  [plan 6](docs/superpowers/plans/2026-11-03-plan-6-dashboard-reminders-print.md). **Next:** plan 7 (transit form).
- **HRM team kit:** [`docs/hrm-handoff.md`](docs/hrm-handoff.md) (handoff table, redirect script, grants, errors).

## Run it

```sh
docker compose up -d                 # MariaDB on localhost:3308 (3306 is taken on this machine)
pnpm install && pnpm migrate
# local HRM copy (fixture employees), see docs/hrm-handoff.md "Local copy"
pnpm dev:api                         # :3335
pnpm dev:web                         # :3336
tooling/deploy/bundle.sh --hrm-login-url <URL>   # build/hr-fam-<sha>.tar.gz for the testing server
RUN_DB_TESTS=1 pnpm test             # 304 tests; the test DBs are built on :3308 by global-setup
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
- Web: page `/me` ("My HRM profile"). Signed-out browsers go to HRM through the platform sign-in mode `handoff`
  (`NUXT_PUBLIC_PLATFORM_SIGN_IN_URL`, since 1.1.0; the app middleware it replaced is gone).
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

## What plan 4 built

- `payments` module: tables `payments`, `payment_items`, `payment_bills`, `posting_batches`, `posting_lines`;
  procedures `payments_transition` (status changes, history row, optional CORE reference) and
  `posting_create_batch`. One live payment per agreement (live = not `void`).
- Statuses: `calculated`, `in_approval`, `approved`, `exported`, `posted`, `void`, `cancelled_after_export`. Only
  `calculated` can be changed (bills, recalculate). A rejected payment becomes `void` and a new one can be
  calculated for the same agreement.
- Roles and permissions: `finance_officer` (seeded in plan 3) gets `payment.read`, `payment.calculate`,
  `payment.export`; the new role `finance_section_head` gets `payment.read` and `agreement.read` and approves.
  Own-scope callers see no payments; head office sees all, a branch sees the payments of its own agreements.
- Routes under `/api/v1/payments`: create (calculate an approved agreement), list, get, `lookup`, `recalculate`,
  `bills`, `submit`, `export`, `posted`, and `GET /posting-batches/{id}/file`.
- Calculation (`calculate.ts`), rules worth knowing:
  - Rates are the rows effective on the member's departure date; the group advance uses the agreement's `travelFrom`.
  - Day 8 onward (form 1, between provinces): nights 1–7 are paid at the rate, night 8 onward from Finance's bill
    for that night, capped at the rate. A billed night with no amount blocks submission (`payments.bills_missing`);
    Finance may enter `0`. Calculate leaves unbilled nights at 0.
  - Meal deduction = per meal (daily rate ÷ 3, rounded up to a whole unit) × host meals, capped at the member's
    daily total. A same-day trip (form 2, 50 km or more) has no meal deduction.
  - Fuel = `ceil(private-car km × fuel price ÷ km per litre)` in whole kip, on forms 1, 2 and 4 only; overseas
    answers `payments.fuel_not_overseas`. No fuel price on the date answers `payments.fuel_price_missing`.
  - `rate_missing` is raised only when the member would get a rate-based item; `advance_band_missing` when the
    agreement has an advance and no band matches. A total beyond 13 whole digits answers 422
    `payments.amount_too_large` and nothing is saved.
  - `payment_items.amount` is signed (the meal deduction is negative).
- Posting entries are data: table `travel_posting_entries` (seeded, migration `202610300100`), read-only screen
  `/master/posting-entries` (`GET /travel-master/posting-entries?zoneKind=`). A change is a new migration until a
  second case needs editing on screen. An item with no posting entry is refused, not dropped.
- Approval: workflow `apps/api/src/modules/payments/workflow.json` (one stage, `finance_section_head`, resolver
  `payment.finance_section_head`: role holders of the payment's HRM branch). Submit needs all bills complete and at least one item:
  a payment with nothing to pay (e.g. host pays meals and accommodation, no advance, no private car; or a same-day
  trip under 50 km) is refused with 422 `payments.nothing_to_pay` at submit, in the approval hook and at export.
- Posting batch (`batches.ts`): `POST /payments/{id}/export` on an approved payment writes one batch and its lines
  (debit lines from the posting entries, credit lines per member in member order) and sets `exported`. The batch
  branch is the HRM branch of the exporting Finance user. A normal second export answers 409
  `payments.bad_transition`; the batch table also refuses a second batch per agreement (`posting.batch_exists`), and
  two exports racing may surface as 409 `resource.conflict`. Export refuses an unbalanced batch, and a payment with
  no items (422 `payments.nothing_to_pay`).
- Upload file (`xlsx.ts`, exceljs 4.4.0, behind a small writer interface for proposal C2): columns `ACCOUNT, BRANCH,
  NAME, CCY, CHEQUE_NO, AMT, RVS_NO, DR_CR, REMARK`; `AMT` is a number cell formatted `#,##0.00`; `CHEQUE_NO` and
  `RVS_NO` empty. Account string = 6-digit branch + CCY + 10-digit GL + 4-digit SEQ, 23 characters, e.g.
  `888010LAK44087200010001`. `BRANCH` of a GL line is the batch branch; of a member line the member's snapshot
  branch.
- `REMARK`: `<zone code> <leader name and surname> <header days> <place> <Doc.no> <dd/mm/yyyy>-<dd/mm/yyyy> <REF>`.
  Place = HRM's province name as stored, including the prefix `ແຂວງ` (form 1 `to_province`, form 2 `province`), the
  country's Lao name (form 3), the border route's Lao name or the "other" text (form 4). Leader name is the
  snapshot `name_lao` + `sname_lao`. If Finance objects to the prefix, strip it in the remark builder.
- `POST /payments/{id}/posted`: Finance marks the batch posted, with an optional CORE reference (no direct posting
  to CORE in version 1; the process stops at the upload file).
- Cancel: cancelling an agreement before export makes the payment `void` and cancels its approval request. An
  exported or posted payment becomes `cancelled_after_export`, the batch is stamped `cancelled_after_export_at` and
  Finance of the branch is notified (spec §8, ກ16). The app produces no reversal file; Finance corrects in CORE.
- Web: `/payments` (list, REF/Doc.no box), `/payments/{id}` (checking table with nights and the day-8 marker, bills,
  recalculate, submit, approval card, export and download, posted confirmation, history), `/master/posting-entries`.
- Set-up on a server: [`docs/deploy-testing.md`](docs/deploy-testing.md) "Payment approval".
- Not checked in a browser yet (no browser tool in the build session; the chrome-devtools connection failed):
  typecheck and the locale test only. Try the payment screens in en and lo.

## What plan 5 built

- `settlements` module (depends on `payments`; `payments` does not import it): tables `settlements`,
  `settlement_lines`; procedure `settlements_transition` (status changes, history row, CORE reference and `RVS_NO`
  on `posted`, CORE reference of the clearing on `cleared`). One live settlement per agreement (live = not `void`).
- Statuses: `draft`, `in_approval`, `approved`, `exported`, `posted`, `clearing_exported`, `cleared`, `void`,
  `cancelled_after_export`. Only `draft` changes. Returned, rejected or withdrawn go back to `draft`. `posted` is final
  unless the settlement passes through the holding account.
- Filing (spec §10, ກ13): any member of an agreement with an advance whose payment is `exported` or `posted`. The
  advance amount, currency (the payment's `advance` item) and holder are copied on create and cannot be edited. The
  due date is the 5th working day after `travelTo`: weekends and `tb_holiday` dates (status `Y`) are skipped
  (`hrm/holidays.ts`, `addWorkingDays`).
- Lines: free text, `fuel` or `fare` on domestic and border settlements (none overseas), currency, amount, cross
  rate (another currency only; settled = amount ÷ rate, half-up to cents), a PDF receipt or a reason, and a PDF
  proof of the rate. Receipts are files of the settlement (`files` entity `settlement`, PDF only, 50 MB); each line
  picks one. Receipts cannot be deleted once the settlement has left draft (`settlements.receipt_locked`).
- Totals (`totals.ts`): case from the totals (`unused`, `partly_used`, `fully_used`, `overspent`); `returned`,
  `excess`; `holding` = min(spent, advance), overseas only. The filer chooses the case; a mismatch is refused at submit.
- Approval (ກ19): workflow `apps/api/src/modules/settlements/workflow.json`, stages leader (resolver
  `settlement.leader`, skipped by the condition `hasLeaderStep`), `settlement.finance_officer`,
  `settlement.finance_section_head`, `settlement.final` (head office: new role `finance_department_head`; a branch:
  `management`). Submitting names the leader or deputy (not the submitter, who becomes the filer); a leader who never
  signed in to the app is refused (`settlements.leader_no_account`). A late submission needs a reason and is audited.
- Posting: entries are data (`travel_posting_entries` cases `settlement` and `clearing`, migration `202611020100`,
  `SEED_SETTLEMENT_ENTRIES`). Batch kinds are now `payment`, `settlement`, `clearing` (migration
  `202611020300_payments_batch_kinds`). Overseas with a spent part: the settlement file credits 2361800001;
  `POST /settlements/{id}/posted` needs `rvsNo`; `POST /settlements/{id}/clearing` writes DR 2361800001 / CR
  1362220001 with `RVS_NO` on the 2361800001 line, on the branch of the settlement file. `REMARK` is the payment's
  (`agreementRemark` in `payments/batches.ts`, now shared).
- Routes under `/api/v1/settlements`: create, list, `lookup`, `overdue` (Finance, `settlement.read`), get, `PUT`
  (draft lines), `submit`, `export`, `posted`, `clearing`, `clearing/posted`, `batches/{kind}/file`. The payments
  file route serves `payment` batches only.
- Cancel: draft, in approval or approved ⇒ `void` (request cancelled); after the settlement file ⇒
  `cancelled_after_export`, its batches stamped, Finance of the branch notified. Same cancel transaction as the payment.
- Web: `/settlements` (list, REF/Doc.no box, overdue view for Finance), `/settlements/{id}` (lines editor, files
  card, totals, submit dialog with the leader and the late reason, export, posted with `RVS_NO`, clearing, downloads),
  a "Settlement" button on an approved agreement for its members, a case filter on `/master/posting-entries`.
- Test fixtures: `test/payment-fixtures.ts` (`exportedPayment`, `attachFile`); people `10100`–`10107` (head office)
  and `10110`–`10113` at a new fixture branch `888050`; Doc.no years 2033–2035.
- Set-up on a server: [`docs/deploy-testing.md`](docs/deploy-testing.md) "Settlement approval".
- Not checked in a browser yet: the dev `.env` points at another database and HRM. Try the settlement screens in en
  and lo, domestic and overseas through the clearing file.

## What plan 6 built

- Overdue cutoff: `latestReturnFor` (`shared/dates.ts`) and `overdueCutoff()` give the latest return date that is
  overdue today, so `GET /settlements/overdue` filters in SQL and pages exactly (one holidays read).
- Reminders (spec §10, §13): job `settlements.reminders`, recurring every hour. Per due agreement (advance paid, no
  settlement or a draft): `settlements.due` from the day after return, `settlements.due_today` on the due date,
  `settlements.overdue` on the first working day after it and every 5 working days. Sent to the members who have
  signed in once. Table `settlement_reminders` (unique agreement, kind, occurrence) makes reruns send nothing; missed
  days are not caught up.
- Dashboard: lists `GET /payments/agreements-without-payment` (Finance, branch scope) and `GET /settlements/to-file`
  (the caller's trips); stats `payments.agreements_without_payment`, `settlements.overdue`, `settlements.to_file`;
  widgets `agreements_without_payment`, `settlements_overdue`, `settlements_to_file` (web `plugins/app-widgets.ts`).
  Migration `202611030200_settlements_widget_grants` grants `widget.*` per role (only missing rows).
- PDF forms: module folder `print/` (plain functions, not a module). `pdf.ts` draws blocks with pdfkit 0.17.2 and
  bundled Noto Sans Lao + Noto Sans (`print/fonts`, SIL OFL): Noto Sans Lao has no Latin, digits, `-` or `/`, so text
  is split by script and laid out by the app (long Lao words break between letter clusters). `agreement.ts` (forms
  1–4) and `settlement.ts` (forms 5–6) are pure models of the paper sheets; `signers.ts` reads who submitted and who
  approved each step from the platform's approval tables. Routes `GET /agreements/{id}/pdf` and
  `GET /settlements/{id}/pdf` (who may read the record; audited `*.printed`), "Print (PDF)" buttons on both pages.
  Marks: `ຮ່າງ / DRAFT` before approval, `ຍົກເລີກ / CANCELLED` once cancelled.
- Carried fixes: REMARK without double spaces; `posting.entry_invalid` for a GL entry without account, SEQ or name;
  `posting.amount_negative`; a payment netting to zero is not exported; `settlements.not_member` (403) for a reader
  who is not a member; submit errors inside the modal, stable line keys, "no payment" as info.
- Test fixtures: people `10120`–`10129` (head office) and `10130`–`10131` (888050); Doc.no years 2037–2040.
- Not checked in a browser yet (same dev `.env` problem as plan 5): the widgets, and the PDF downloads.

## After plan 6 (2026-11-04 to 2026-11-06)

- Print fixes (`9e31ca9`): the members table of forms 1–4 at 8 pt, with widths that keep dates, 13-digit accounts and
  EIDs on one line; the signature block moves whole to the next page; the travel group's box on forms 5–6 waits for
  the leader unless step 2 is skipped. `agreements/scope.ts`: an employee with a branch-scoped role also reads the
  agreements they travel on at other branches (the reminder links open).
- Shipped workflows (`6ceb367`): each of `agreements`, `payments` and `settlements` declares its `workflow.json` as a
  shipped workflow (`shared/shipped-workflow.ts`, `defineShippedWorkflow` from the platform's 1.2.0 approval
  package, through the linked checkout). `migrate` creates, publishes and makes default the three workflows;
  later admin edits are kept, and `approval:apply <key> --force` puts the file's version back. The manual workflow
  set-up steps in [`docs/deploy-testing.md`](docs/deploy-testing.md) are gone. Test: `test/shipped-workflows.test.ts`.
- Profile card (`6811a1c`): `components/MyProfileCard.vue` in the sidebar (`layouts/default.vue`), strings in en
  and lo. No test (web only), not reviewed.

## Approach: app first, platform later

The app builds what the platform lacks in its own modules, behind interfaces shaped like the proposal
([`docs/proposals/2026-10-15-nelvine-platform-gaps.md`](docs/proposals/2026-10-15-nelvine-platform-gaps.md)),
and swaps each for the platform package once released.

**Platform version (checked 2026-11-16).** `.nelvrc.json` says `platformVersion: 1.1.0` (templates, copied files,
`docs/platform/`). The packages are `link:`ed to the checkout `../nelvine-platform`, which is at **1.3.0** (tag
`v1.3.0`, 2026-11-09, plus 2 commits), so the app runs 1.3.0 package code against 1.1.0 copied files. The
shipped-workflow change above already depends on 1.2.0. Next step: `nelv update` to 1.3.0 (merges copied files
and `docs/platform/`, adds new template dependencies since 1.3.0), then typecheck and the DB tests. Released since
1.1.0: 1.2.0 (2026-11-03/04) `platform-numbering`, `platform-refdata`, `platform-org` with `unitRole`/supervisor
approvers and re-resolve, shipped workflows, `PlatformEntityDialog`; 1.3.0 (2026-11-07/09) `platform-brand`, side
nav submenus, menu map, `PlatformFormWizard`, `useRecordSubmit`.

| Proposal item             | Platform state (2026-11-16)                       | In this app                                                     |
| ------------------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| M1 data sources           | Released 1.1.0                                    | Used (`source('hrm')`)                                          |
| M2 portal sign-in handoff | Released 1.1.0 (`SIGN_IN_MODE=handoff`)           | Web uses the handoff sign-in mode; API module `auth-hrm` still the app's own |
| C3 subject attributes     | Released 1.1.0 (`subjectAttributes` on a module)  | HRM branch, EID, head office as subject attributes (`auth-hrm`); branch scope still TypeScript |
| M3 document numbering     | Released 1.2.0 (`platform-numbering`)             | REF counter and Doc.no parser in `agreements`; swap to consider |
| M4 reference data         | Released 1.2.0 (`platform-refdata`)               | Effective-dated tables in `travel-master`; swap to consider     |
| C1 org approval routing   | Released 1.2.0 (`platform-org`, `unitRole`)       | Approval resolvers in the app (plans 3–5); swap to consider     |
| C6 shipped workflows      | Released 1.2.0                                    | Used (see "After plan 6")                                       |
| C2 XLSX writer            | Not released                                      | App writer behind an interface (`payments/xlsx.ts`)             |
| C4 money helpers          | Not released                                      | App helper for decimals, rounding and the 13-digit guard        |
| N1 calendar, N2 posting   | Not released                                      | App code (`hrm/holidays.ts`, posting batches)                   |
| C5 date fields            | Not released                                      | `AppDateInput.vue` (dd/mm/yyyy, model `YYYY-MM-DD`)             |

The app depends on the platform checkout by absolute `link:` paths (`.nelvrc.json`, `apps/*/package.json`); move
to the registry version with `nelv upgrade` when the server install needs it.

Reported to the platform team earlier: `sourcePicker` answers 422 not 400 (open), PascalCase upstream columns and
`CamelCasePlugin` (1.1.0 added `DATA_SOURCE_<NAME>_CAMEL_CASE=false`), missing web template dependencies after
`nelv update` (fixed in 1.3.0).

## Plans

| Plan | Spec §18 step                                            | State        |
| ---- | -------------------------------------------------------- | ------------ |
| 1    | Scaffold, HRM read layer, sign-in handoff                | Done         |
| 2    | Master data with seed (ranks, zones, rates, bands, fuel, GL), PM2 bundle | Done |
| 3    | Agreements: forms 1–4, REF, Doc.no, approval             | Done         |
| 4    | Payment calculation, checking table, upload file         | Done         |
| 5    | Settlement, approval chain, posting batch                | Done         |
| 6    | Dashboard, reminders, PDF forms, carried fixes           | Done         |
| 7    | Transit form (regulation 4.7)                            | Waits on question 13 |

Plan 7 is next, once the transit form's layout is supplied. Write each plan when the previous one is done, so it can use the real code.

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
- `NUXT_PUBLIC_PLATFORM_SIGN_IN_URL` is read by the web server when it starts (the build does not bake it in); the PM2
  bundle stores it in `apps/web/hrm-login-url.txt` and `ecosystem.config.cjs` passes it on.
- `/me` says "not linked" for any error, also when HRM is down.

Plan 4 working answers (user, 2026-10-29; built in plan 4, still to confirm with Finance, all kept as data where possible):

- Q4 overseas currency: payment entries all in USD on both sides (GL account string with `USD`); the app does no
  conversion.
- Q3: the second payment debit is 4408730001 (accommodation).
- Q6: private-car fuel at payment is DR 4405100001 / CR member CASA.
- Q7 border (form 4): domestic entries in LAK for the allowances; group advance DR 1362220001 / CR holder's CASA in
  USD; settlement does not pass through 2361800001.
- Q9 REMARK: "HR code" = the agreement's zone code (`D`, `OB1`, `OA1`, ...), my reading, to confirm; bill number =
  the agreement REF.
- Q14: `BRANCH` of a member line = the member's HRM branch from the submit snapshot, written like the GL lines'
  branch (`888010`), my call.
- Fuel = km ÷ 7 × fuel price on the departure date, rounded up to a whole kip.
- Plan 4 scope: checking table, payment approval (finance officer → finance section head, new role
  `finance_section_head`), `.xlsx` export, mark `posted` with an optional CORE reference, "cancelled after export"
  on agreement cancel. (The idempotent set-up command planned for the workflows was dropped: see "Carry into plan 5".)

Plan 5 working answers (user, 2026-11-02; to confirm with Finance, may change later):

- Q5 overseas settlement: every case with a spent part (partly used, fully used, overspent) passes through
  2361800001, following the ກ22 text over the FA-M `ສາຍເດີນ` sheet (which draws it in case 1 only). Domestic
  settlement never does. Overseas settlement entries are in USD on both sides, as in Q4 (my call).
- Q5 timing: two moments. The settlement file books step 1 (DR 4405200001 / CR 2361800001, plus the CASA lines of
  the case). After posting it in CORE, Finance types the suspense number into the app, which then produces a second
  file for step 2 (DR 2361800001 / CR 1362220001). A third batch type, settlement clearing.
- Q8 `RVS_NO`: the suspense number CORE gives the step 1 holding entry, typed by the finance officer; written on the
  2361800001 lines of the clearing file.
- My calls: the overdue list is a filter of the settlements list (reminder notifications in plan 6); cancelling an
  agreement after its settlement is exported marks the settlement `cancelled_after_export`, like a payment.

Carry into plan 7 (struck where plan 6 did it):

- The transit form (regulation 4.7, ກ9 item 3), when the business supplies its layout (question 13).
- Plan 6 calls to confirm: the reminder days, the PDF signature boxes, the Lao wording of the case labels 2–4 on
  forms 5–6 (cell B5 of the sheet is cut off), and that the Attach File line of forms 1–4 always ticks ຂໍ້ຕົກລົງ.
- Still open from plan 5: draft cancel and a real request cancel untested; the role migration of plan 5 is not
  idempotent; editor and overdue items are done (plan 6).

Carried from plan 4 (still open unless struck):

- Deferred minors of plan 4, grouped:
  - Calculation: `compareAmounts` in the meal cap can throw before the `amount_too_large` guard (unreachable with real
    rates); `signedCents` repeats `toCents` parsing and belongs in `money.ts`; a capped meal deduction's basis does not
    say "capped" and the fuel row's rate × count differs from its amount; the per-item `amount_too_large` path names
    the departure date; `CALC_MESSAGES` repeats the English strings of `module.ts`, and field-error details are
    English only; a no-op recalculate bumps the version without a history row; `GET /payments/{id}` reads the payment
    twice; a missing zone in `rates.ts` throws a plain `Error` (500).
  - Posting lines: a negative GL total reports `amount_too_large`; a null GL or SEQ, or an unknown GL, writes a
    malformed account or empty NAME; REMARK gets a double space when a part is empty or the agreement has no leader; a
    payment netting to zero (items that cancel out, not an empty payment) still exports; the batch insert has an audit entry but no `writeHistory` row.
  - Cancel and approval: the cancel listener closes over the setup context (use the module `ctx()` accessor); the
    cancel paths from `in_approval`, `calculated` and `posted`, the no-op, and a listener error rolling back are
    untested, as are the bills re-check on `onStatusChange('pending')` and cancelled to void.
  - Web: no leader, holder or account markers in the checking table; "posted" uses its own modal, not `useConfirm`;
    an invalid bill has no field highlight; the lookup's "no payment" answer uses `notify.error`.
  - Tests and housekeeping: `mulDivCeilWhole` repeats a count check and has no test for fractional input; the
    posting-entries test pins only the domestic accommodation GL. (Done in plan 5: the `seed.ts` header, `caseKey`
    is an enum, a listener error rolling the cancel back is tested.)
- The set-up command for the agreement, payment and settlement workflows is not built: the approval module creates workflows
  only through its HTTP routes, so both are created by hand ([`docs/deploy-testing.md`](docs/deploy-testing.md))
  until proposal C6.
- Finance confirming the plan 4 working answers (above), the Europe group 1 word (question 2) and the `PostType` map
  (ຂ1).
- The seed migration imports `RANK_CODES` from `lookups.ts`; keep that constant unchanged (the seed is frozen).
- `shared/db.ts` types the app's tables; new tables go there too.
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
- Plan 5 working answers (above) to confirm with Finance: questions 5 and 8. The full list, with the build step each blocks, is spec v3 §17–18.
- Deployment: PM2 bundle built (see above); not yet installed on the testing server.
