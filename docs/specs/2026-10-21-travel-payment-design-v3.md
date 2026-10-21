# Travel Payment — design v3

Date: 2026-10-21. Status: draft for review. Plan 1 (scaffold, HRM read layer, sign-in handoff) is built; the rest
is not. Supersedes [v2 of 2026-10-20](2026-10-20-travel-payment-design-v2.md), which is kept for history only.

"HR-FAM" is a temporary working name. The final name and the URLs are still open (ຂ9).

Sources: `docs-and-facts-of-project/` (DG presentation 07.09.2026, `1.Workflow.xlsx`, `2. ກຳນົດ code and data.xlsx`
of 2026-10-16, `3. Format form HRM.xlsx`, `4. Format form FA-M.xlsx` of 2026-10-20 with its new sheets `GL` and
`ສາຍເດີນ`, the 2026 staff policy regulation, the position regulation, the HRM V3 structure dump,
`personnel_account_FROM_HRM_V3.sql`), the decisions of 2026-10-13 and 2026-10-20, and the business and technical
answers in [`docs/travel-payment-answers.json`](../travel-payment-answers.json) (export of 2026-10-21T02:44).
References such as (ກ12) or (ຂ5) point to the question with that id in
[`docs/questions-for-business-finance-lo.html`](../questions-for-business-finance-lo.html).

## 0. Changes from v2

| Area                     | v2                                                      | v3                                                                                                       |
| ------------------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Forms 2 and 4 options    | Open                                                    | Form 2 has the policy option and overnight / not overnight; form 4 has the policy option only (ກ6)      |
| Border routes            | Full list needed                                        | The four routes of the regulation plus "Other" with free text (ກ7)                                       |
| Seed codes               | `OA2P*` assumed; Americas–Africa in OE1 assumed         | Both confirmed and corrected in the code file (ກ11)                                                      |
| Advance                  | Mandatory, exactly one holder                           | Optional again; with an advance, exactly one holder; without one, no settlement (ກ13, ກ14)              |
| Who files a settlement   | The advance holder                                      | Any member of the agreement, usually an officer, on the holder's behalf (ກ13)                           |
| Settlement step 2        | Team leader                                             | Team leader or a deputy, chosen by typing their EID when submitting (ກ13, ກ19)                          |
| Branch settlement chain  | Open                                                    | Leader or deputy → branch office–IT officer → branch office–IT section head → branch management (ກ19)  |
| Rank                     | From the map only; override removed                     | "ວ່າການ" takes the rank of the position filled; "ຮັກສາການ" keeps the own rank; board members out (ກ15) |
| Cancellation             | By a reviewer or Finance; after export open             | Cancel button with a mandatory reason; after export Finance corrects the entries by hand (ກ16)          |
| Doc.no                   | Six-digit branch code                                   | Branch part open: `010` (ກ12 answer) or `888010` (chat 2026-10-20); one series for agreements and notices, restarting every year |
| GL accounts              | Five accounts                                           | Seven accounts with SEQ, including 4405100001 fuel (FA-M `GL` sheet)                                     |
| Posting entries          | Payment entries and an assumed settlement entry         | Entries per case from the FA-M `ສາຍເດີນ` sheet; overseas settlement through holding account 2361800001 (ກ21, ກ22) |
| Account string           | Branch and SEQ open                                     | `888` + branch of the posting user + CCY + GL + SEQ; `BRANCH` column from the account (ກ24)             |
| Upload file              | Format open                                             | `.xlsx`, one file per agreement and transaction type, REMARK content, AMT `1,000,000.00` (ກ25)          |
| Settlement expense lines | Free text; cross rate open                              | Domestic lines carry an expense type (fuel or fare); overseas lines carry a currency, an optional cross rate and proof of the rate (ກ27, ສາຍເດີນ) |

## 1. Purpose

BCEL pays staff who travel on official work a daily allowance, an accommodation allowance and, for the group, a
travel advance that is settled after the trip. Today HR issues a paper agreement, Finance re-types it into a
spreadsheet, calculates by hand and uploads the entries to the bank's core banking system (CORE).

The app replaces the re-typing. HR enters the agreement once. Finance retrieves it by its document number (Doc.no)
or its system reference (REF), the system calculates the entitlements, approvals run in the system, and the system
produces the CORE upload file. A member of the group later files the settlement of the advance online against the
same agreement.

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
- Optional group travel advance and its settlement (forms 5 domestic, 6 overseas).
- Approval flows for agreement, payment and settlement.
- CORE upload file per posting batch, and a manual "posted" confirmation.
- Master data screens: rank mapping, zones and countries, border routes, rates, advance bands, fuel price,
  GL accounts, posting entries.

After the first forms, still in version 1 once its layout is supplied: a separate form for provincial staff who
travel to Vientiane Capital to prepare an overseas trip (regulation 4.7, ກ9 item 3).

Out of version 1: direct CORE posting, payroll, the policies of regulation article 5 onward (staff posted to
provinces), ticket and vehicle booking, several countries on one agreement and the two-country rule of regulation
4.8 (ກ8), staff of subsidiary companies (ຂ3), board members who are not in HRM (a separate paper request, ກ15),
delegation of approvals (ກ19), automatic reversal of entries already posted (ກ16), e-mail notifications (ຂ12).

## 4. Architecture

One app created with `nelv create` (type `enterprise`: audit, auth, authorization, jobs, notifications, approval,
transfer) plus the `files` capability. App modules under `apps/api/src/modules/`:

| Module          | Responsibility                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| `hrm`           | Second, read-only database connection to HRM; employee, organisation, geography and holiday lookups. |
| `auth-hrm`      | Sign-in handoff from the HRM portal; links an HRM employee to a platform user.                       |
| `travel-master` | Ranks, PostType-to-rank map, zones, countries, border routes, rates, advance bands, fuel price, GL accounts, posting entries. |
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
- **Acting positions** (ກ15). A member who is "ຮັກສາການ" (holding a post in an acting capacity) is paid at the
  rank of their own position: a deputy head of department acting as head stays at the deputy rank. Nothing is
  entered. A member who is "ວ່າການ" (filling a post) is paid at the rank of the post filled: HR picks that position
  on the member row, the rank comes from its `PostType` through the rank map, and the form shows both positions.
  Whether HRM already records "ວ່າການ" is open (section 17). There is no other rank override.
- **Board members.** Board members who are not BCEL staff are not in HRM; their trips are requested on paper
  outside the app (ກ15). Board members who are staff but not directors get `P3` (regulation); how that is
  recognised from HRM is open.
- **Accounts.** "One active account per currency" is not enforced by a unique key in HRM. The app takes the newest
  non-deleted row and shows a warning when there are several. A member without an account in a currency the
  agreement pays blocks submission: LAK for every member of a domestic or border trip, USD for every member of an
  overseas trip, and USD for the advance holder of a border or overseas trip that has an advance.

## 6. Sign-in handoff

Built in plan 1. One-time code, chosen by HRM (ຂ5):

1. The user clicks the tile in HRM. HRM creates a random code, stores its hash with the `eid` and a 60-second
   expiry in a small table (working name `tb_app_handoff`) and redirects to `/auth/hrm?code=…`.
2. The API finds the code and checks it is unexpired, then records its hash in the app's own
   `hrm_handoff_redemptions` table, whose unique key refuses a second use, and reads the `eid`.
3. The API finds or creates the platform user for that `eid`, starts a platform session and redirects to the app.

HRM adds the table and the redirect, and deletes old rows itself. The app never writes to HRM: the platform's data
source is read-only, so the app's database user needs `SELECT` only, on that table as on the others (ຂ7, still to be
granted). The kit for the HRM team is [`docs/hrm-handoff.md`](../hrm-handoff.md).

`auth-hrm` follows the shape of the platform's `auth-oidc` package: an external identity (`provider = 'hrm'`,
`subject = EID`) linked to a platform user. Further rules:

- HRM-provisioned users have `username = EID`, no e-mail, no local password, invitation or MFA enrolment; HRM's
  login is the gate.
- HRM deletes the user's `tb_current_login` row on logout, and an HRM session ends after 4 hours without activity
  (ຂ6). The platform session checks for that row every minute and ends when it is gone; its own idle timeout is
  also 4 hours.
- A visit without a session redirects to the HRM login page.
- A user is also created, without a session, when an agreement names them as team leader, deputy leader or advance
  holder, so that approval steps can be assigned to people who have not opened the app yet.
- A user seen for the first time gets the employee role (ຂ8).

## 7. Master data

- **Ranks** `P1`–`P9` with Lao and English names, and the **PostType-to-rank map**.
- **Zones**: `D` domestic, `OB1` border, `OA1`/`OA2` Asia-Pacific groups 1 and 2, `OE1`/`OE2` Europe groups 1
  and 2. Daily and accommodation rates for `D` and `OB1` are in LAK, the others in USD. Rate codes are the zone
  followed by the rank, as in the code file: `DP1`…`DP9`, `OB1P1`…, `OA1P1`…, `OA2P1`…, `OE1P1`…, `OE2P1`….
- **Countries** with zone and group, searchable by first letters. Seeded from the lists in the code file. The
  Americas and Africa use the `OE1` rates (regulation 4.3, ກ11); because the file's list of them is incomplete (it
  has no Brazil and names Africa only as a whole), every country of North America, South America, Central America,
  the Caribbean and Africa is seeded in `OE1` by continent. Countries of Asia-Pacific and Europe not named in group 1
  fall into group 2, as the file says.
- **Border routes**: the four routes of regulation 4.1 (Vientiane Capital – Nong Khai – Udon Thani, Houaphanh –
  Thanh Hoa, Savannakhet – Mukdahan, Luang Namtha – Boten), and "Other", where the form takes the route as free
  text (ກ7). All routes use the `OB1` rates. An administrator can add routes.
- **Rates** by zone and rank: daily allowance per person per day, accommodation per person per night, and for the
  overseas zones a personal allowance per country. Form 2 adds a same-day rate (150,000 LAK per person per day,
  regulation 3.1.6). Each rate row has an effective-from date so that a future regulation does not rewrite past
  calculations.
- **Group advance bands**: domestic by trip length (1–2 days 2,000,000; 3–5 days 3,500,000; 6–10 days 5,000,000;
  11 days or more 7,000,000 LAK per trip, ກ4); border and overseas by group size (1 person 1,000; 2–5 persons
  1,500; 6–10 persons 2,000; 11 or more 2,500 USD per country).
- **Fuel price** per litre, entered by an administrator with an effective-from date at the current price, and the
  consumption rule of 7 km per litre (regulation 3.1.3 and 3.1.6, ກ9 item 5).
- **GL accounts**, from the FA-M `GL` sheet, each with its SEQ:

  | GL         | SEQ    | Use                                                                 |
  | ---------- | ------ | ------------------------------------------------------------------- |
  | 1362220001 | `0001` | Travel advance to staff                                             |
  | 2361800001 | `0001` | Holding account (payable to outside suppliers), overseas settlement |
  | 4405100001 | `0001` | Fuel expense                                                        |
  | 4405200001 | `0001` | Fare expense (plane or car tickets)                                 |
  | 4408720001 | `0001` | Daily allowance                                                     |
  | 4408730001 | `0001` | Accommodation                                                       |
  | 4408600002 | `0001` | Overseas personal allowance                                         |

  An account can have several SEQs, each for a different case (ກ24); the table keeps GL and SEQ together so that a
  new case is a new row.
- **Posting entries**: the debit and credit lines of each case in section 11, kept as data so that Finance's
  corrections do not need code.

Values are seeded from `2. ກຳນົດ code and data.xlsx` (2026-10-16) and `4. Format form FA-M.xlsx` (2026-10-20).
Where the code file and the regulation differ, the seed follows the regulation (article 4, page 4): Europe group 1
there is Belgium, France, Russia, Switzerland, England, **Netherlands** ("ໂຮນລັງ"), Spain, "ອຽກລັງ", Greece and
Norway. The code file's "ໂຣມານີ" in `OE1` is a typo for "ໂຮນລັງ"; Romania ("ຣູມານີ") is `OE2`, as both lists say.
The word "ອຽກລັງ" (code file "ອັງກະລັງ") names no country clearly; until the business says which, the seed reads it
as a second spelling of England and leaves Italy, which neither list names, in `OE2` as "other European".

## 8. Agreement (forms 1–4)

Header: form type, subject, REF (issued by the system), Doc.no, document date, reference, title, travel from and
to dates, route or destination, policy option, advance (yes or no), attachment of the signed agreement or notice.

- Form 1: two dropdowns, province to province.
- Form 2: district to district within one province, with overnight / not overnight, and for a same-day trip
  whether the distance is 50 km or more (ກ1).
- Form 3: one country (shows country, zone and group) (ກ8). A trip to two countries is two agreements, each with
  the dates spent in its country.
- Form 4: province to border route, or "Other" with the route typed (ກ7).
- **Policy option** (who pays), on every form (ກ6): BCEL pays everything; host pays travel; host pays
  accommodation; host pays meals; host pays meals and accommodation. Only form 2 carries the overnight option.
- **Host-provided meals.** Where the host provides only some meals, the form records how many meals per member
  (regulation 4.6); section 9 deducts them.
- **Private car.** Where a member travels by private car, the form records the distance in km (regulation 3.1.3
  and 3.1.6); section 9 pays the fuel.

### Numbers

Two numbers, by decision ກ12:

- **REF** is issued by the system when the agreement is first saved, unique, and never reused. It is the key that
  links the agreement, its payment and its settlement. A cancelled agreement keeps its REF; the replacement gets a
  new one (ກ16).
- **Doc.no** is the number of the signed paper agreement or notice, typed by HR (EP-IN). Format
  `NNNN.BCEL.<branch>.YYYY`:
  - `NNNN` is typed from the paper and padded to four digits. Agreements and notices share one series, which
    restarts every year (ກ12).
  - `<branch>` defaults to the user's branch; head office may choose any branch when it enters an agreement on a
    branch's behalf. **Open:** the business's answer writes it as three digits (`0001.BCEL.010.2026`), the
    correction of 2026-10-20 as HRM's six-digit `BRANCH_CODE` (`0001.BCEL.888010.2026`). The app stores the branch
    as HRM's `BRANCH_CODE` either way; only the printed and typed form changes, and the parser accepts both.
  - `YYYY` is the year of the document date.
  - The Lao form `NNNN.ທຄຕລ.<branch>.YYYY` maps to it one to one. The app stores the `BCEL` form, accepts either
    form (and the paper spelling with `/`) on entry and in search, and displays the form that matches the user's
    language.
  - A Doc.no may not be used by two agreements that are not cancelled, so a cancelled agreement's replacement can
    carry the same paper number.

Finance and the members find an agreement by either number.

### Members and roles

Members: `EID` typed, the rest filled from HRM. Each member has their own departure and return dates, defaulting
to the header dates, and a day count calculated by the system (ກ3), on every form. Each member also has a "days
subtracted" input, entered by hand, which lowers the paid day count; the form shows both the calculated and the
resulting count (ກ2).

Roles on the agreement:

- **Team leader**: exactly one.
- **Deputy leader**: none or more. Settlement step 2 may be taken by the leader or a deputy (ກ19).
- **Advance holder**: when the agreement has an advance, exactly one member, who may be the leader (ກ13). When it
  has none, no holder, no advance is paid and no settlement is filed (ກ14).

### Statuses

`draft` → `in_approval` → `approved`. A reviewer who rejects returns the agreement to `draft` with a comment.
A reviewer, or Finance during payment, may instead cancel it with the cancel button and a mandatory reason; the
creator is notified and files a new agreement, which gets a new REF (ກ10, ກ16). An approved agreement is never
edited in place: any change of members, dates or destination is a cancellation and a new agreement.

Cancellation after the payment batch has been exported is allowed, still with a reason. The app then marks the
batch "cancelled after export" and lists it for Finance, who correct the entries already posted in CORE by hand and
then calculate and post the new agreement (ກ16). The app produces no reversal file in version 1.

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
- group advance from the bands in section 7, credited to the advance holder, only when the agreement has an
  advance. Domestic bands use the agreement's header dates, not the longest member (ກ3); border and overseas bands
  use the number of members.

Form 2 (ກ1):

- overnight: domestic daily and accommodation rates (`DP*`), as form 1
- same day, 50 km or more: the same-day rate, no accommodation
- same day, under 50 km: no allowance

Form 4 (ກ7): daily and accommodation rates `OB1P*` in LAK; group advance by group size in USD; no personal
allowance.

The policy option removes the components the host covers (ກ5):

| Option                              | Daily | Accommodation | Personal (overseas) | Group advance |
| ----------------------------------- | ----- | ------------- | ------------------- | ------------- |
| BCEL pays everything                | Paid  | Paid          | Paid                | Paid          |
| Host pays travel                    | Paid  | Paid          | Paid                | Paid          |
| Host pays accommodation             | Paid  | Not paid      | Paid                | Paid          |
| Host pays meals                     | Not paid | Paid       | Paid                | Paid          |
| Host pays meals and accommodation   | Not paid | Not paid   | Paid                | Paid          |

Further rules (ກ9):

- **Host-provided meals** (regulation 4.6): per meal, daily rate ÷ 3; a result with a fraction is rounded up to a
  whole unit of the rate's currency; the deduction is that amount × meals provided. Example: 100 USD ÷ 3 = 33.33,
  rounded up to 34 USD (ກ9 item 2).
- **Private car fuel** (regulation 3.1.3 and 3.1.6): distance ÷ 7 × fuel price effective on the departure date.
- **Day 8 onward** of a trip between provinces (regulation 3.1.5): accommodation is paid on actual bills up to the
  rate, handled manually in version 1. The checking table flags members whose trip is longer than seven days, and
  Finance enters the billed amount per night from day 8, which the system caps at the rate.

Rates are taken from the rate row effective on the departure date. Every amount shows the rate and count it came
from. Finance cannot change a calculated amount (ກ10). If the table is wrong, Finance rejects the payment and the
agreement is cancelled and filed again (section 8).

Approval (ກ18): finance officer → finance section head.

Posting: the payment entries of section 11. Statuses: `calculated` → `in_approval` → `approved` → `exported` →
`posted`.

## 10. Advance settlement (forms 5–6)

Only an agreement with an advance has a settlement. Any member of the agreement may open the form with the REF or
Doc.no and file it (ກ13); usually an officer compiles it for the group, and the leader or deputy reviews it as
step 2. Trip, dates and advance amount are pulled from the agreement and payment, and the advance amount cannot be
edited (ກ29). The filer chooses the case (unused, partly used, fully used, overspent; the system checks it against
the totals), enters expense lines and attaches receipts.

- Expense descriptions are free text (ກ28).
- Domestic lines also carry an expense type, fuel or fare, which chooses the expense account (section 11).
- Each line needs a receipt, PDF only (ກ28). A line without a receipt (regulation 4.4) needs a written reason, is
  highlighted for the finance officer, and is approved within the normal chain.
- Overseas lines carry a currency, an amount, a cross rate and the resulting USD amount, USD = amount ÷ cross rate.
  The filer types the cross rate per line; a line already in USD has no cross rate. A line with a cross rate needs
  proof of the rate attached (ກ27).
- total expenses = sum of lines; remaining = advance − total expenses
- remaining > 0: the holder returns it from their account; remaining < 0: the holder is reimbursed the excess
  (regulation 3.2.3). The entries are in section 11.

On submitting, the filer types the EID of the leader or a deputy, who takes step 2; the app refuses an EID that is
not the agreement's leader or one of its deputies, and refuses the filer's own EID.

Approval chain (ກ19):

| Step | Head office                                   | Branch                                   |
| ---- | --------------------------------------------- | ---------------------------------------- |
| 1    | A member submits                              | A member submits                         |
| 2    | Team leader or deputy, chosen on submitting   | Team leader or deputy, chosen on submitting |
| 3    | Finance officer (data and receipts)           | Branch office–IT officer                 |
| 4    | Finance section head                          | Branch office–IT section head            |
| 5    | Head of the Administration–Finance department | Branch management                        |

An approver who is away leaves the step waiting: no delegation and no escalation in version 1. After the last
approval a posting batch is created.

Deadline: five working days after return, counted from the day after the return date, using `tb_holiday` (ກ20). A
settlement submitted after the deadline is accepted but needs a reason. The app reminds the members and lists
overdue settlements for Finance; it blocks nothing.

## 11. Posting batch and upload file

One batch per agreement and transaction type (payment, settlement); one upload file per batch, never several
agreements in one file (ກ25). A batch cannot be created twice for the same pair. The export refuses a batch whose
debits and credits differ in the same currency. After uploading to CORE, Finance marks the batch `posted` and may
record the CORE reference (ກ26).

### Entries

From the FA-M `ສາຍເດີນ` sheet (ກ21, ກ22). CASA is the member's own account; "expense" is 4405100001 (fuel) or
4405200001 (fare) by the line's expense type, and always 4405200001 overseas.

| Case                                | Domestic (LAK)                                     | Overseas                                                                                     |
| ----------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Payment: daily and accommodation    | DR 4408720001, DR 4408730001 / CR CASA             | DR 4408720001, DR 4408730001 / CR CASA (USD)                                                 |
| Payment: personal allowance         | —                                                  | DR 4408600002 / CR CASA (USD)                                                                |
| Payment: group advance              | DR 1362220001 / CR holder's CASA                   | DR 1362220001 / CR holder's CASA (USD)                                                       |
| Settlement 1: partly used           | DR CASA (remainder), DR expense (used) / CR 1362220001 | DR CASA / CR 1362220001 (remainder, USD); DR 4405200001 / CR 2361800001 (used); then DR 2361800001 / CR 1362220001 (USD) |
| Settlement 2: unused                | DR CASA / CR 1362220001                            | DR CASA / CR 1362220001 (USD)                                                                |
| Settlement 3: fully used            | DR expense / CR 1362220001                         | DR 4405200001 / CR 1362220001 (USD)                                                          |
| Settlement 4: overspent             | DR expense / CR 1362220001, CR CASA (excess)       | DR 4405200001 / CR 1362220001, CR CASA (excess, USD)                                         |

Points of this table still open with Finance (section 17): the sheet shows the second payment debit as
4408720001, read here as 4408730001; it debits the overseas GL accounts in LAK against USD credits; only overseas
case 1 passes through 2361800001; it has no line for private-car fuel at payment; it has no border case. Because the
entries are data (section 7), each answer is a data change.

### Upload file

Columns, from the FA-M `Upload file` sheet: `ACCOUNT, BRANCH, NAME, CCY, CHEQUE_NO, AMT, RVS_NO, DR_CR, REMARK`.

- **File**: `.xlsx` (ກ25). The writer sits behind an interface, so that another layout, or direct CORE posting
  later, replaces it in one place.
- **ACCOUNT**: GL lines use the account string `888` + three-digit branch + CCY + GL + SEQ, for example
  `888010LAK44087200010001` or `888010USD13622200010001`. The branch is that of the Finance user who creates the
  batch: `010` at head office, `050` at Luang Prabang (ກ24). Member lines use the member's account number.
- **BRANCH**: the branch of the line's account (ກ24): for a GL line the branch in its account string, for a member
  line the branch of the member's account.
- **AMT**: two decimals and thousands separators, as CORE's reports show them (`1,000,000.00`) (ກ25).
- **DR_CR**: one row per GL account per side, marked `DR` or `CR`; member lines one row each (ກ25).
- **CHEQUE_NO**: empty, unless a cheque is issued (ກ25).
- **RVS_NO**: the suspense (holding) reference, filled on the lines of a settlement that pass through 2361800001
  (ກ25).
- **REMARK**: HR policy code + team name + total days + province or country + Doc.no + departure–return dates +
  bill number; Lao script allowed (ກ25).

## 12. Roles and visibility

Starting roles: employee (agreements they are a member of, and their settlements), HR officer, HR section head, HR
department head, branch or head-office management, finance officer, finance section head, finance department head,
administrator (master data, roles). At a branch, the branch's office–IT officer and section head hold the finance
officer and finance section head roles for that branch (ກ19). Record scope uses the branch on the document, so a
branch sees its own documents and head office sees all. Approval workflows are data in the platform's approval
module; the leader-or-deputy step is a resolver that reads the EID chosen on submitting.

Every create, change, cancellation, approval, export and posting confirmation is written to the audit log.

## 13. Files and notifications

- Signed agreements and notices: PDF, JPG or PNG. Receipts and proof of exchange rates: PDF only (ກ28). At most
  50 MB per file (ຂ11).
- Stored in a shared folder through the platform `files` capability, with S3-compatible storage as the
  alternative; kept with no time limit (ຂ11).
- Notifications in the app only in version 1: step assigned, rejected, cancelled, approved, settlement due and
  overdue (ຂ12).

## 14. Screens

- Agreements: list with filters, form per type, detail with members, attachments and approval history.
- Payments: "enter REF or Doc.no" lookup, checking table, approval, batch export, batches cancelled after export.
- Settlements: my settlements, form, finance review queue, overdue list.
- Master data: rank map, zones and countries, border routes, rates, advance bands, fuel price, GL accounts, posting
  entries.
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
  form 4, per-member dates and days subtracted by hand, host-provided meals and their rounding in LAK and USD, fuel,
  the day-8 cap, the advance bands at their boundaries (including 10 and 11 days), agreements without an advance,
  and the rank of a member filling a post ("ວ່າການ").
- Posting: every case of section 11, domestic and overseas, balanced per currency; the account string per branch
  and currency.
- Doc.no: parsing of both scripts and the paper spelling, three- and six-digit branch parts and the head-office
  default, and reuse after cancellation.
- Settlement: filed by a member who is not the holder; step 2 refuses an EID that is not leader or deputy, and the
  filer's own; the branch chain.
- Database tests per module following the platform's testing guide; HRM lookups run against a local database
  built from the structure dump with fixture rows, including excluded `WORK_STATUS` and `COMPANY_CODE` values.
- End-to-end: agreement → payment → export → settlement → export, once domestic and once overseas; agreement
  without an advance → payment → export; and agreement → cancel → new agreement with the same Doc.no.

## 17. Open questions

Assumptions the build follows unless corrected:

1. Deputy leaders are marked on the agreement, and the EID typed for settlement step 2 must be the leader or one
   of them, not the filer (ກ13, ກ19). When the filer is the only leader and there is no deputy, step 2 is skipped.
2. Day 8 onward (ກ9 item 1): Finance enters the billed amount, capped at the rate. This is an input, not a change
   of a calculated amount, so it does not conflict with ກ10.
3. Finance confirms "posted" by hand with a CORE reference (ກ26, answered "SKIP").
4. Cancellation after export: the app produces no reversal file; Finance corrects in CORE (ກ16).
5. The filer of a domestic settlement chooses the expense type per line (fuel or fare); Finance rejects a wrong one.
6. All countries of the Americas and Africa are `OE1` (ກ11, code file 4.3).
7. `AMT` is a number cell formatted `#,##0.00`, which shows as `1,000,000.00`.

Needed from the business:

1. Doc.no branch part: three digits (`0001.BCEL.010.2026`) or six (`0001.BCEL.888010.2026`) (ກ12)?
2. Regulation 4.2, Europe group 1: which country is "ອຽກລັງ" (code file "ອັງກະລັງ")? If it is Italy, Italy moves
   from `OE2` to `OE1`. Is Brazil, which the 4.3 list does not name, `OE1` like the rest of the Americas?
3. FA-M `ສາຍເດີນ`, section 1: is the second debit 4408730001 (accommodation)?
4. Overseas entries debit the GL in LAK and credit CASA in USD: does CORE convert, at which rate (buying or selling,
   of which date), and who provides it?
5. Overseas settlement: only case 1 passes through 2361800001; is that intended for cases 3 and 4? When is the
   second step (DR 2361800001 / CR 1362220001) posted: in the same file or later, and on what event (ກ22)?
6. Which account takes the private-car fuel paid with the allowance: 4405100001?
7. Border trips (form 4): allowances in LAK, advance in USD. Are the entries those of the domestic column, with the
   advance in USD? Does the settlement pass through 2361800001?
8. `RVS_NO`: where does the suspense reference come from, and who enters it (ກ25)?
9. `REMARK`: what is the "HR code" (rank code, rate code, or another), and which bill number (ກ25)?
10. "ວ່າການ": does HRM record it, or does HR enter it on the form (ກ15)? How is a board member who is staff but not
    a director recognised for `P3`?
11. Same day, under 50 km, but with an overnight stay: domestic rates, or nothing (ກ1)? On the business's question
    whether form 2 needs its own codes: the app proposes none for the overnight case (it uses `DP*`) and one code,
    `DS`, for the same-day rate of 150,000 LAK.
12. Several countries: one agreement per country, each with the dates in that country, is how this spec reads ກ8.
    Please confirm.
13. Layout of the transit form for regulation 4.7 (ກ9 item 3).
14. Member lines in the upload file: how is the branch of a member's account known (ກ24)?

Needed from HRM and IT:

1. The full `PostType` → `P1`–`P9` mapping (ຂ1).
2. Status of `hrm_employee_account_currency` on testing and production, USD and THB accounts, and one active
   account per currency (ຂ2).
3. The database user for testing, and the handoff table (ຂ5, ຂ7).
4. Whether one employee may hold several HRM sessions at once (ຂ6).
5. The app's name in Lao and English and the testing and production URLs (ຂ9).
6. SMTP details, through the Technical team (ຂ12); the CORE contact (ຂ13).

## 18. Build order

1. App scaffold, HRM read layer, sign-in handoff. **Done** (plan 1).
2. Master data with seed, and the deployment to the testing server. Needs ຂ1 (rank map); business question 2
   changes one country's zone at most. The posting entries come with step 4, which is the first to use them.
3. Agreements with REF, Doc.no and approval. Needs business question 1 (Doc.no branch part) before the parser is
   final.
4. Payment calculation, checking table, upload file. Needs business questions 3, 4, 6, 7, 9 and 14.
5. Settlement with approval chain and posting batch. Needs business questions 5 and 8.
6. Dashboard, reminders, printable views, transit form.
