# Travel Payment — design v2

Date: 2026-10-20. Status: draft for review. Nothing is built yet. Supersedes
[v1 of 2026-10-13](2026-10-13-travel-payment-design.md).

"HR-FAM" is a temporary working name. The final name and the URLs are still open (ຂ9); the name is needed before
the app is scaffolded, because `nelv create <name>` uses it for the directory, the package names and the default
title.

Sources: `docs-and-facts-of-project/` (DG presentation 07.09.2026, `1.Workflow.xlsx`, `2. ກຳນົດ code and data.xlsx`,
`3. Format form HRM.xlsx`, `4. Format form FA-M.xlsx`, the 2026 staff policy regulation, the position regulation, the
HRM V3 structure dump, `personnel_account_FROM_HRM_V3.sql`), the decisions of 2026-10-13, and the business and
technical answers in [`docs/travel-payment-answers.json`](../travel-payment-answers.json) (export of
2026-10-20T08:16). References such as (ກ12) or (ຂ5) point to the question with that id in
[`docs/questions-for-business-finance-lo.html`](../questions-for-business-finance-lo.html).

## 0. Changes from v1

| Area                     | v1                                                    | v2                                                                                                     |
| ------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Document number          | `NNNN.BCEL.YYYY`, the main key                        | Doc.no `NNNN.BCEL.<branch code>.YYYY` typed from the paper; the system issues its own reference (REF) (ກ12) |
| Day count                | Calculated only                                       | Calculated, minus days the user subtracts by hand (ກ2)                                                 |
| Form 2 rates             | Open                                                  | Overnight: domestic rates; same day and 50 km or more: 150,000 LAK; under 50 km: nothing (ກ1)          |
| Finance adjustments      | Finance adjusts a line with a reason                  | No adjustments; a wrong document is cancelled and the creator files a new one (ກ10, ກ16)               |
| Rank override            | HR overrides with a reason                            | Removed until the business explains its "no" (ກ15)                                                     |
| Advance                  | Optional, holder may be the leader                    | One advance holder must be chosen; the advance is paid with the payment (ກ13, ກ14)                     |
| Extra regulation rules   | Open                                                  | Meal deduction and private-car fuel calculated; day 8+ bills manual; transit a separate form (ກ9)       |
| Several countries        | Open                                                  | One country per agreement (ກ8)                                                                         |
| Approval chains          | Prepared → checked → approved                         | Agreement 4 steps, payment 2 steps, settlement 5 steps; no delegation (ກ17–ກ19)                        |
| Late settlement          | Reminder only                                         | Allowed, with a mandatory reason (ກ20)                                                                 |
| Receipts                 | Any attachment                                        | Receipts PDF only; other attachments PDF, JPG, PNG; 50 MB per file (ກ28, ຂ11)                          |
| Selectable employees     | `IS_DELETE`, `APPROVED_STATUS`                        | Also `WORK_STATUS = 1` and `COMPANY_CODE = '00'` (ຂ3)                                                  |
| Sign-in handoff          | One-time code recommended, fallback open              | One-time code chosen (ຂ5); HRM idle timeout 4 hours (ຂ6)                                               |
| Deployment, files, mail  | Not covered                                           | PM2 first, built off-server; shared folder; in-app notifications first (ຂ10–ຂ12)                       |

## 1. Purpose

BCEL pays staff who travel on official work a daily allowance, an accommodation allowance and, for the group, a
travel advance that is settled after the trip. Today HR issues a paper agreement, Finance re-types it into a
spreadsheet, calculates by hand and uploads the entries to the bank's core banking system (CORE).

The app replaces the re-typing. HR enters the agreement once. Finance retrieves it by its document number (Doc.no)
or its system reference (REF), the system calculates the entitlements, approvals run in the system, and the system
produces the CORE upload file. The advance holder later files the settlement online against the same agreement.

## 2. Decisions taken

| Topic            | Decision                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| Platform         | Built on nelvine-platform (Hono + Kysely/MariaDB API, Nuxt UI web, en and lo).                             |
| Forms            | This app builds all forms. HRM has no travel-agreement table.                                              |
| HRM              | Existing system, MariaDB `bcel_hrm_v3`. Read-only source of users, employees, organisation, geography.     |
| HRM access       | Direct database user with `SELECT` on the listed HRM tables, no `EXECUTE` (ຂ10, decided 2026-10-20). Testing `10.0.7.110`, production `10.0.2.116`. |
| App database     | Its own MariaDB 11.4 database, separate from `bcel_hrm_v3` (ຂ10).                                          |
| Entry point      | A tile in the HRM portal (a `tb_module` row whose `md_url` points to this app).                            |
| Sign-in          | One-time code handoff from HRM (ຂ5). No second login, no separate accounts.                                |
| Roles            | Configured in this app (platform roles and policies), not in HRM's `tb_module_txn_role`.                   |
| Default role     | An HRM user seen for the first time gets the employee role (ຂ8).                                           |
| Accounts         | From `hrm_employee_account_currency` (`eid`, `ccy`, `account_no`, `account_name`, `is_deleted`).           |
| Currency         | Domestic in LAK. Overseas allowances and every border or overseas group advance in USD, to USD accounts (ກ7, ກ23). |
| CORE             | No direct integration in version 1. The app produces an upload file; Finance uploads it by hand (ຂ13).     |
| Deployment       | Node.js 22.12+ under PM2 first; Docker or Podman later. Built on a developer machine and copied in (ຂ10).  |
| Files            | Shared folder, S3-compatible storage as the alternative; kept with no time limit (ຂ11).                    |
| Notifications    | In-app in version 1. E-mail after the internal SMTP server is agreed with the Technical team (ຂ12).        |

## 3. Scope

In version 1:

- Agreement forms 1–4: domestic between provinces, between districts inside a province, overseas (one country),
  border zone.
- Entitlement calculation and the Finance checking table for each agreement, including the host-meal deduction
  and the private-car fuel allowance (section 9).
- Group travel advance and its settlement (forms 5 domestic, 6 overseas).
- Approval flows for agreement, payment and settlement.
- CORE upload file per posting batch, and a manual "posted" confirmation.
- Master data screens: rank mapping, zones and countries, border routes, rates, advance bands, fuel price,
  GL accounts.

After the first forms, still in version 1 once its layout is supplied: a separate form for provincial staff who
travel to Vientiane Capital to prepare an overseas trip (regulation 4.7, ກ9 item 3).

Out of version 1: direct CORE posting, payroll, the policies of regulation article 5 onward (staff posted to
provinces), ticket and vehicle booking, several countries on one agreement and the two-country rule of regulation
4.8 (ກ8), staff of subsidiary companies (ຂ3), delegation of approvals (ກ19), e-mail notifications (ຂ12).

## 4. Architecture

One app created with `nelv create` (type `enterprise`: audit, auth, authorization, jobs, notifications, approval,
transfer) plus the `files` capability. App modules under `apps/api/src/modules/`:

| Module          | Responsibility                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| `hrm`           | Second, read-only database connection to HRM; employee, organisation, geography and holiday lookups. |
| `auth-hrm`      | Sign-in handoff from the HRM portal; links an HRM employee to a platform user.                       |
| `travel-master` | Ranks, PostType-to-rank map, zones, countries, border routes, rates, advance bands, fuel price, GL.  |
| `agreements`    | Forms 1–4, members, attachments, approval, REF issue, Doc.no checks.                                 |
| `payments`      | Calculation, checking table, approval, posting batches, upload file.                                 |
| `settlements`   | Forms 5–6, expense lines, receipts, approval chain, return or top-up posting batch.                  |

The app's own tables live in the app database. Nothing is written to HRM.

Rule-heavy writes run as stored procedures in the app database, called through the platform's `callProcedure`:
REF allocation, status transitions, creating a posting batch (balanced, once per agreement and type) and the
settlement posting. The entitlement calculation, permissions, branch scope, validation, lists and audit stay in
TypeScript. HRM is read through its tables, not through its own procedures.

Platform gaps this app depends on (external data source, portal handoff, numbering, reference data) are listed in
[the platform proposal](../proposals/2026-10-15-nelvine-platform-gaps.md). Until the platform has them, the app
builds them in its own modules behind interfaces that match that proposal.

## 5. HRM read layer

Employee lookup by `EID`, the five-character "User ID" typed on the forms. It is both the employee code and the
time-clock code (ຂ3).

| Field on the form | HRM source                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------- |
| Name              | `hrm_employee.NAME_LAO`, `SNAME_LAO`, `NAME_ENG`, `SNAME_ENG`                               |
| Position          | `hrm_employee.POSITION_CODE` → `hrm_position.PostName`                                      |
| Department        | `DEPARTMENT_CODE` → `hrm_department`; section and unit from `hrm_section`, `hrm_unit`       |
| Branch            | `hrm_employee.BRANCH_CODE` (default `888010`) → `hrm_branch`                                |
| Rank              | `hrm_position.PostType` → this app's rank map → `P1`…`P9`                                   |
| Account           | `hrm_employee_account_currency` where `ccy` matches and `is_deleted = 0`                    |

An employee is selectable only when `IS_DELETE = 'N'`, `APPROVED_STATUS = 'A'`, `WORK_STATUS = 1` and
`COMPANY_CODE = '00'` (ຂ3). Provinces and districts are read from `hrm_province` and `hrm_district`; countries,
zones and groups are kept in this app, because `hrm_country` has about 35 countries and no zone (ຂ4). Working days
for deadlines use `tb_holiday`.

Rules:

- **Snapshot.** When an agreement is submitted, each member's name, position, department, branch, rank code and
  account numbers are copied onto the member row. Later HRM changes do not alter a submitted document.
- **Rank map.** `PostType` groups positions of one level and is not the P number itself (PostType 7 is head of
  department, centre or branch, which is `P3`). The mapping is a table in this app, edited by an administrator.
  A member whose `PostType` has no mapping blocks submission.
- **No rank override.** The business answered "no" to letting HR override a member's rank, without a reason (ກ15).
  Version 1 takes the rank from the map only. The regulation's special case (board members who are staff but not
  directors get `P3`) stays an open question.
- **Accounts.** "One active account per currency" is not enforced by a unique key in HRM. The app takes the newest
  non-deleted row and shows a warning when there are several. A member without an account in a currency the
  agreement pays blocks submission: LAK for every member of a domestic or border trip, USD for every member of an
  overseas trip, and USD for the advance holder of a border or overseas trip.

## 6. Sign-in handoff

One-time code, chosen by HRM (ຂ5):

1. The user clicks the tile in HRM. HRM creates a random code, stores its hash with the `eid` and a 60-second
   expiry in a small table (working name `tb_app_handoff`) and redirects to `/auth/hrm?code=…`.
2. The API finds the code and checks it is unexpired, then records its hash in the app's own
   `hrm_handoff_redemptions` table, whose unique key refuses a second use, and reads the `eid`.
3. The API finds or creates the platform user for that `eid`, starts a platform session and redirects to the app.

HRM adds the table and the redirect, and deletes old rows itself. The app never writes to HRM: the platform's data
source is read-only, so the app's database user needs `SELECT` only, on that table as on the others (ຂ7, still to be
granted).

`auth-hrm` follows the shape of the platform's `auth-oidc` package: an external identity (`provider = 'hrm'`,
`subject = EID`) linked to a platform user. Further rules:

- HRM-provisioned users have no local password, invitation or MFA enrolment; HRM's login is the gate.
- HRM deletes the user's `tb_current_login` row on logout, and an HRM session ends after 4 hours without activity
  (ຂ6). The platform session checks for that row at an interval and ends when it is gone; its own idle timeout is
  also 4 hours.
- A visit without a session redirects to the HRM login page.
- A user is also created, without a session, when an agreement names them as team leader or advance holder, so
  that approval steps can be assigned to people who have not opened the app yet.
- A user seen for the first time gets the employee role (ຂ8).
- To be verified during implementation: the platform identifies users by e-mail or username; HRM users will use
  the `EID` as username where no e-mail exists.

## 7. Master data

- **Ranks** `P1`–`P9` with Lao and English names, and the **PostType-to-rank map**.
- **Zones**: `D` domestic, `OB1` border, `OA1`/`OA2` Asia-Pacific groups 1 and 2, `OE1`/`OE2` Europe groups 1
  and 2. Daily and accommodation rates for `D` and `OB1` are in LAK, the others in USD. The Americas and Africa use
  the `OE1` rates (regulation 4.3) and are seeded in `OE1`.
- **Countries** with zone and group, searchable by first letters; **border routes** (for example Vientiane Capital
  – Nong Khai – Udon Thani, Houaphanh – Thanh Hoa, Savannakhet – Mukdahan, Luang Namtha – Boten). The full list
  of routes is still needed from the business.
- **Rates** by zone and rank: daily allowance per person per day, accommodation per person per night, and for the
  overseas zones a personal allowance per country. Form 2 adds a same-day rate (150,000 LAK per person per day,
  regulation 3.1.6). Each rate row has an effective-from date so that a future regulation does not rewrite past
  calculations.
- **Group advance bands**: domestic by trip length (1–2 days 2,000,000; 3–5 days 3,500,000; 6–10 days 5,000,000;
  11 days or more 7,000,000 LAK per trip, ກ4); border and overseas by group size (1 person 1,000; 2–5 persons
  1,500; 6–10 persons 2,000; 11 or more 2,500 USD).
- **Fuel price** per litre, entered by an administrator with an effective-from date, and the consumption rule of
  7 km per litre (regulation 3.1.3 and 3.1.6, ກ9 item 5).
- **GL accounts**: 4408720001 daily allowance, 4408730001 accommodation, 4408600002 personal allowance,
  1362220001 travel advance, and the settlement expense accounts.

Values are seeded from `2. ກຳນົດ code and data.xlsx`. The `OA2` table in that file is labelled with `OA1P*` codes;
the seed uses `OA2P*` (ກ11, assumption not yet confirmed).

## 8. Agreement (forms 1–4)

Header: form type, subject, REF (issued by the system), Doc.no, document date, reference, title, travel from and
to dates, route or destination, policy option, attachment of the signed agreement or notice.

- Form 1: two dropdowns, province to province.
- Form 2: district to district within one province, with overnight / not overnight, and for a same-day trip
  whether the distance is 50 km or more (ກ1).
- Form 3: one country (shows country, zone and group) (ກ8).
- Form 4: province to border route.
- **Policy option** (who pays): BCEL pays everything; host pays travel; host pays accommodation; host pays meals;
  host pays meals and accommodation. Which of forms 2 and 4 carry the policy option and which the overnight option
  is still open (ກ6).
- **Host-provided meals.** Where the host provides only some meals, the form records how many meals per member
  (regulation 4.6); section 9 deducts them.
- **Private car.** Where a member travels by private car, the form records the distance in km (regulation 3.1.3
  and 3.1.6); section 9 pays the fuel.

### Numbers

Two numbers, by decision ກ12:

- **REF** is issued by the system when the agreement is first saved, unique, and never reused. It is the key that
  links the agreement, its payment and its settlement. A cancelled agreement keeps its REF; the replacement gets a
  new one (ກ16).
- **Doc.no** is the number of the signed paper agreement, typed by HR (EP-IN). Format
  `NNNN.BCEL.<branch code>.YYYY`, for example `0001.BCEL.888010.2026`:
  - `NNNN` is typed from the paper and padded to four digits.
  - `<branch code>` is HRM's full six-digit `BRANCH_CODE`. It defaults to the user's branch; head office defaults
    to `888010` and may choose any branch when it enters an agreement on a branch's behalf.
  - `YYYY` is the year of the document date.
  - The Lao form `NNNN.ທຄຕລ.<branch code>.YYYY` maps to it one to one. The app stores the `BCEL` form, accepts either form
    (and the paper spelling with `/`) on entry and in search, and displays the form that matches the user's
    language.
  - A Doc.no may not be used by two agreements that are not cancelled, so a cancelled agreement's replacement can
    carry the same paper number.

Finance and the advance holder find an agreement by either number.

### Members and roles

Members: `EID` typed, the rest filled from HRM. Each member has their own departure and return dates, defaulting
to the header dates, and a day count calculated by the system (ກ3). Each member also has a "days subtracted"
input, entered by hand, which lowers the paid day count; the form shows both the calculated and the resulting
count (ກ2).

One member is marked team leader and one, exactly one, advance holder (ກ13, ກ14). They may be the same person. The
"no advance" option of v1 is dropped.

### Statuses

`draft` → `in_approval` → `approved`. A reviewer who rejects returns the agreement to `draft` with a comment. A
reviewer, or Finance during payment, may instead cancel it; the creator is notified and files a new agreement,
which gets a new REF (ກ10, ກ16). An approved agreement is never edited in place: any change of members, dates or
destination is a cancellation and a new agreement. Cancellation is possible until its payment batch is exported;
after that, see open question 7.

Approval (ກ17), each step by role scoped to the agreement's branch:

1. Officer who prepares the agreement.
2. Section head.
3. Department head.
4. Branch management, or head office management for head-office agreements.

The business called this chain provisional; it is kept as data in the platform's approval module so that it can be
changed without code. On approval, Finance is notified.

## 9. Payment calculation

Finance opens an approved agreement by REF or Doc.no. The system builds the checking table, one row per member:

- days = return date − departure date + 1 − days subtracted by hand (section 8)
- daily allowance = days × rate
- nights = days − 1; accommodation = nights × rate
- overseas: personal allowance for the country, once
- group advance from the bands in section 7, credited to the advance holder. Domestic bands use the agreement's
  header dates, not the longest member (ກ3); border and overseas bands use the number of members.

Form 2 (ກ1):

- overnight: domestic daily and accommodation rates, as form 1
- same day, 50 km or more: the same-day rate, no accommodation
- same day, under 50 km: no allowance

The policy option removes the components the host covers (ກ5):

| Option                              | Daily | Accommodation | Personal (overseas) | Group advance |
| ----------------------------------- | ----- | ------------- | ------------------- | ------------- |
| BCEL pays everything                | Paid  | Paid          | Paid                | Paid          |
| Host pays travel                    | Paid  | Paid          | Paid                | Paid          |
| Host pays accommodation             | Paid  | Not paid      | Paid                | Paid          |
| Host pays meals                     | Not paid | Paid       | Paid                | Paid          |
| Host pays meals and accommodation   | Not paid | Not paid   | Paid                | Paid          |

Further rules (ກ9):

- **Host-provided meals** (regulation 4.6): per meal, daily rate ÷ 3, rounded up to a whole unit of the rate's
  currency; the deduction is that amount × meals provided. Example: 100 USD ÷ 3 = 33.33, rounded up to 34 USD
  ("ເສດ 3 ຂຶ້ນໄປປັດຂຶ້ນ (ຖ້ວນ)", ກ9 item 2).
- **Private car fuel** (regulation 3.1.3 and 3.1.6): distance ÷ 7 × fuel price effective on the departure date.
- **Day 8 onward** of a trip between provinces (regulation 3.1.5): accommodation is paid on actual bills up to the
  rate, handled manually in version 1. The checking table flags members whose trip is longer than seven days, and
  Finance enters the billed amount per night from day 8, which the system caps at the rate. Open question 5.

Rates are taken from the rate row effective on the departure date. Every amount shows the rate and count it came
from. Finance cannot change a calculated amount (ກ10). If the table is wrong, Finance rejects the payment and the
agreement is cancelled and filed again (section 8).

Approval (ກ18): finance officer → finance section head.

Posting: debit the GL account of each component, credit each member's account; the advance is credited to the
holder's account in the same batch (ກ14). Statuses: `calculated` → `in_approval` → `approved` → `exported` →
`posted`.

## 10. Advance settlement (forms 5–6)

The advance holder opens the form with the REF or Doc.no. Trip, dates and advance amount are pulled from the
agreement and payment, and the advance amount cannot be edited (ກ29). The holder chooses the status (unused,
partly used, fully used), enters expense lines and attaches receipts.

- Expense descriptions are free text (ກ28).
- Each line needs a receipt, PDF only (ກ28). A line without a receipt (regulation 4.4) needs a written reason, is
  highlighted for the finance officer, and is approved within the normal chain. The business invited a proposal
  here; this is it, to be confirmed.
- Overseas lines carry an amount, a cross rate and the resulting USD amount, USD = amount ÷ cross rate. Who enters
  the cross rate is open (ກ27).
- total expenses = sum of lines; remaining = advance − total expenses
- remaining > 0: the holder returns it. Debit the holder's account for the remainder and the expense account for
  the amount used; credit 1362220001 for the full advance (ກ21, assumption not yet confirmed).
- remaining < 0: the holder is reimbursed the excess (regulation 3.2.3); credit the holder's account for the
  excess (ກ21, assumption).

Approval chain (ກ19), confirmed for head office: advance holder submits → team leader → finance officer (data and
receipts) → finance section head → head of the Administration–Finance department. The branch chain is open. An
approver who is away leaves the step waiting: no delegation and no escalation in version 1. After the last
approval a posting batch is created.

Deadline: five working days after return, counted from the day after the return date, using `tb_holiday` (ກ20). A
settlement submitted after the deadline is accepted but needs a reason. The app reminds the holder and lists
overdue settlements for Finance; it blocks nothing.

## 11. Posting batch and upload file

One batch per agreement and transaction type (payment, settlement). A batch cannot be created twice for the same
pair. Columns of the upload file, from `4. Format form FA-M.xlsx`:

`ACCOUNT, BRANCH, NAME, CCY, CHEQUE_NO, AMT, RVS_NO, DR_CR, REMARK`

GL lines use the composed account string (for example `888010LAK44087200010001`), one debit line per GL account;
member lines use the member's account number, one credit line each. The export refuses a batch whose debits and
credits differ. After uploading to CORE, Finance marks the batch `posted` and may record the CORE reference (ກ26,
assumption).

CORE takes a file drop of a spreadsheet; the exact format is not settled (ຂ13, ກ25). The writer starts with
`.xlsx` and sits behind an interface, so that another layout, or direct CORE posting later, replaces it in one place.

## 12. Roles and visibility

Starting roles: employee (own settlements, agreements they are a member of), HR officer, HR section head, HR
department head, branch or head-office management, finance officer, finance section head, finance department head,
administrator (master data, roles). Record scope uses the branch on the document, so a branch sees its own
documents and head office sees all. Approval workflows are data in the platform's approval module; the team-leader
step is a resolver that reads the leader from the agreement.

Every create, change, cancellation, approval, export and posting confirmation is written to the audit log.

## 13. Files and notifications

- Signed agreements and notices: PDF, JPG or PNG. Receipts: PDF only (ກ28). At most 50 MB per file (ຂ11).
- Stored in a shared folder through the platform `files` capability, with S3-compatible storage as the
  alternative; kept with no time limit (ຂ11).
- Notifications in the app only in version 1: step assigned, rejected, cancelled, approved, settlement due and
  overdue (ຂ12).

## 14. Screens

- Agreements: list with filters, form per type, detail with members, attachments and approval history.
- Payments: "enter REF or Doc.no" lookup, checking table, approval, batch export.
- Settlements: my settlements, form, finance review queue, overdue list.
- Master data: rank map, zones and countries, border routes, rates, advance bands, fuel price, GL accounts.
- Dashboard: documents waiting for me, agreements without payment, settlements overdue.

All text in English and Lao. Printable views match the paper layouts in `3. Format form HRM.xlsx`.

## 15. Deployment

- Node.js 22.12 or later and MariaDB 11.4 (ຂ10).
- Version 1 runs under PM2. The build is produced on a developer machine and copied to the server, because the
  server's internet access is limited; no package download on the server. A Docker or Podman image follows the
  same build later.
- The app database is separate from `bcel_hrm_v3`. The app's HRM user has read rights on the tables listed in ຂ7
  and on the handoff table, `SELECT` only.

## 16. Testing

- Calculation: table-driven unit tests covering every zone and rank, each policy option, form 2's three cases,
  per-member dates and days subtracted by hand, host-provided meals and their rounding in LAK and USD, fuel, the day-8 cap, the advance
  bands at their boundaries (including 10 and 11 days), and settlement with money left over and with overspend.
- Doc.no: parsing of both scripts and the paper spelling, six-digit branch codes and the head-office default
  `888010`, and reuse after cancellation.
- Database tests per module following the platform's testing guide; HRM lookups run against a local database
  built from the structure dump with fixture rows, including excluded `WORK_STATUS` and `COMPANY_CODE` values.
- End-to-end: agreement → payment → export → settlement → export, once domestic and once overseas; and agreement
  → cancel → new agreement with the same Doc.no.

## 17. Open questions

Assumptions the build follows unless corrected:

1. Team leader and advance holder may be the same person; then the team-leader step of the settlement is skipped
   (ກ13).
2. Day 8 onward (ກ9 item 1): Finance enters the billed amount, capped at the rate. This is an input, not a change
   of a calculated amount, so it does not conflict with ກ10. Please confirm.
3. Assumptions of v1 that the business left unanswered: OA2 codes and Americas–Africa in OE1 (ກ11), settlement
   posting (ກ21), one file per agreement and transaction type with GL debits combined (ກ25), manual "posted"
   confirmation with a CORE reference (ກ26).

Needed from the business:

1. Forms 2 and 4: which carry the policy option and which the overnight option (ກ6).
2. Rank override: why "no", and how the regulation's special `P3` case is handled (ກ15).
3. Settlement approval chain for branches; is the head-office chain complete (ກ19)?
4. Cancellation after payment: how money already paid is recovered (ກ16, second part).
5. Settlement expense account: when 2361800001 applies and when 4405200001 (ກ22).
6. GL account string for USD entries, the meaning of the final `0001`, and which branch goes in the branch part
   and in the `BRANCH` column (ກ24).
7. Upload file: file type, `REMARK` content and length, decimals in `AMT` (ກ25).
8. Cross rate on form 6: entered per line or provided by the system; currency per line; proof attached (ກ27).
9. Full list of border routes (ກ7).
10. Layout of the transit form for regulation 4.7 (ກ9 item 3).
11. Same day, under 50 km, but with an overnight stay: domestic rates, or nothing (ກ1)?

Needed from HRM and IT:

1. The full `PostType` → `P1`–`P9` mapping (ຂ1).
2. Status of `hrm_employee_account_currency` on testing and production, USD and THB accounts, and one active
   account per currency (ຂ2).
3. The database user for testing, and the handoff table (ຂ5, ຂ7).
4. Whether one employee may hold several HRM sessions at once (ຂ6).
5. The app's name in Lao and English and the testing and production URLs (ຂ9).
6. SMTP details, through the Technical team (ຂ12); the CORE contact (ຂ13).

## 18. Build order

1. App scaffold, HRM read layer, sign-in handoff. Needs ຂ9 (name), ຂ7 (database user), ຂ5 (handoff table).
2. Master data with seed. Needs ຂ1 (rank map) and the border routes.
3. Agreements with REF, Doc.no and approval.
4. Payment calculation, checking table, upload file.
5. Settlement with approval chain and posting batch.
6. Dashboard, reminders, printable views, transit form.
