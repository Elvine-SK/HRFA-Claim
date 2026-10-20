# Travel Payment — design

Date: 2026-10-13. Status: superseded by [v2 of 2026-10-20](2026-10-20-travel-payment-design-v2.md), which folds in
the business and technical answers. Kept for history.

"HR-FAM" is a temporary working name. The final name is not chosen; it is needed before the app is scaffolded,
because `nelv create <name>` uses it for the directory, the package names and the default title.

Sources: `docs-and-facts-of-project/` (DG presentation 07.09.2026, `1.Workflow.xlsx`, `2. ກຳນົດ code and data.xlsx`,
`3. Format form HRM.xlsx`, `4. Format form FA-M.xlsx`, the 2026 staff policy regulation, the position regulation, the
HRM V3 structure dump, `personnel_account_FROM_HRM_V3.sql`) and the decisions taken in conversation on 2026-10-13.

## 1. Purpose

BCEL pays staff who travel on official work a daily allowance, an accommodation allowance and, for the group, a
travel advance that is settled after the trip. Today HR issues a paper agreement, Finance re-types it into a
spreadsheet, calculates by hand and uploads the entries to the bank's core banking system (CORE).

The app replaces the re-typing. HR enters the agreement once. Finance retrieves it by its document number
(**Doc.no**, the "main key"), the system calculates the entitlements, approvals run in the system, and the system
produces the CORE upload file. The advance holder later files the settlement online against the same Doc.no.

## 2. Decisions already taken

| Topic            | Decision                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| Platform         | Built on nelvine-platform (Hono + Kysely/MariaDB API, Nuxt UI web, en and lo).                             |
| Forms            | This app builds all six forms. HRM has no travel-agreement table.                                          |
| HRM              | Existing system, MariaDB `bcel_hrm_v3`. Read-only source of users, employees, organisation, geography.     |
| HRM access       | Direct database user. Testing host `10.0.7.110`, production `10.0.2.116`. Development uses testing only.   |
| Entry point      | The app is a tile in the HRM portal (a `tb_module` row whose `md_url` points to this app).                 |
| Sign-in          | Token handoff from HRM. No second login, no separate accounts.                                             |
| Roles            | Configured in this app (platform roles and policies), not in HRM's `tb_module_txn_role`.                   |
| Accounts         | From `hrm_employee_account_currency` (`eid`, `ccy`, `account_no`, `account_name`, `is_deleted`).           |
| CORE             | Direct integration is postponed. Version 1 ends at the upload file; Finance uploads it by hand as today.   |

## 3. Scope

In version 1:

- Agreement forms 1–4: domestic between provinces, between districts inside a province, overseas, border zone.
- Entitlement calculation and the Finance checking table for each agreement.
- Group travel advance and its settlement (forms 5 domestic, 6 overseas).
- Approval flows for agreement, payment and settlement.
- CORE upload file per posting batch, and a manual "posted" confirmation.
- Master data screens: rank mapping, zones and countries, rates, advance bands, GL accounts.

Out of version 1: direct CORE posting, payroll, the policies of regulation article 5 onward (staff posted to
provinces), ticket and vehicle booking.

## 4. Architecture

One app created with `nelv create` (type `enterprise`: audit, auth, authorization, jobs, notifications, approval,
transfer) plus the `files` capability. App modules under `apps/api/src/modules/`:

| Module        | Responsibility                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| `hrm`         | Second, read-only database connection to HRM; employee, organisation, geography and holiday lookups.   |
| `auth-hrm`    | Sign-in handoff from the HRM portal; links an HRM employee to a platform user.                         |
| `travel-master` | Ranks, PostType-to-rank map, zones, country and border lists, rate tables, advance bands, GL accounts. |
| `agreements`  | Forms 1–4, members, attachments, approval, Doc.no uniqueness.                                          |
| `payments`    | Calculation, checking table, approval, posting batches, upload file.                                   |
| `settlements` | Forms 5–6, expense lines, receipts, approval chain, return or top-up posting batch.                    |

The app's own tables live in the app database. Nothing is written to HRM except, at most, the handoff table in
section 6.

## 5. HRM read layer

Employee lookup by `EID` (five characters, the "User ID" typed on the forms):

| Field on the form | HRM source                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------- |
| Name              | `hrm_employee.NAME_LAO`, `SNAME_LAO`, `NAME_ENG`, `SNAME_ENG`                               |
| Position          | `hrm_employee.POSITION_CODE` → `hrm_position.PostName`                                      |
| Department        | `DEPARTMENT_CODE` → `hrm_department`; section and unit from `hrm_section`, `hrm_unit`       |
| Branch            | `hrm_employee.BRANCH_CODE` (default `888010`) → `hrm_branch`                                |
| Rank              | `hrm_position.PostType` → this app's rank map → `P1`…`P9`                                   |
| Account           | `hrm_employee_account_currency` where `ccy` matches and `is_deleted = 0`                    |

Only employees with `IS_DELETE = 'N'` and `APPROVED_STATUS = 'A'` are selectable. Provinces and districts come
from `hrm_province` and `hrm_district`; working days for deadlines use `tb_holiday`.

Rules:

- **Snapshot.** When an agreement is submitted, each member's name, position, department, branch, rank code and
  account numbers are copied onto the member row. Later HRM changes do not alter a submitted document.
- **Rank map.** `PostType` groups positions of one level and is not the P number itself (PostType 7 is head of
  department, centre or branch, which is `P3`). The mapping is a table in this app, edited by an administrator.
  A member whose `PostType` has no mapping blocks submission.
- **Rank override.** HR may override a member's rank on the agreement with a reason (the policy puts board members
  who are staff but not directors at `P3` whatever their position). Finance sees the override.
- **Accounts.** "One active account per currency" is not enforced by a unique key in HRM. The app takes the newest
  non-deleted row and shows a warning when there are several. A member without an account in the payment currency
  blocks submission.

## 6. Sign-in handoff

Recommended mechanism, a one-time code:

1. The user clicks the tile in HRM. HRM creates a random code, stores its hash with the `eid` and a 60-second
   expiry in a small table (working name `tb_app_handoff`) and redirects to `/auth/hrm?code=…`.
2. The API finds the code, checks it is unexpired and unused, marks it used and reads the `eid`.
3. The API finds or creates the platform user for that `eid`, starts a platform session and redirects to the app.

This needs a small change in HRM (one table, one redirect) and write access for the app's database user on that
one table. The fallback, if HRM cannot change, is a form POST of the existing HRM `session_token`, checked against
`tb_current_login`; it needs no new table but the token stays valid for the whole HRM session.

`auth-hrm` follows the shape of the platform's `auth-oidc` package: an external identity (`provider = 'hrm'`,
`subject = EID`) linked to a platform user. Further rules:

- HRM-provisioned users have no local password, invitation or MFA enrolment; HRM's login is the gate.
- The platform session re-checks `tb_current_login` at an interval, so an HRM logout or timeout ends it.
- A visit without a session redirects to the HRM login page.
- A user is also created, without a session, when an agreement names them as leader or advance holder, so that
  approval steps can be assigned to people who have not opened the app yet.
- To be verified during implementation: the platform identifies users by e-mail or username; HRM users will use
  the `EID` as username where no e-mail exists.

## 7. Master data

- **Ranks** `P1`–`P9` with Lao and English names, and the **PostType-to-rank map**.
- **Zones**: `D` domestic, `OB1` border, `OA1`/`OA2` Asia-Pacific groups 1 and 2, `OE1`/`OE2` Europe groups 1
  and 2, each with its currency (`D` and `OB1` in LAK, the others in USD). The Americas and Africa use the `OE1`
  rates (regulation 4.3). Border trips use the domestic daily and accommodation rates, but the group advance
  follows the overseas bands (regulation 4.1, last paragraph).
- **Countries** with zone and group, searchable by first letters; **border routes** (for example Vientiane Capital
  – Nong Khai).
- **Rates** by zone and rank: daily allowance per person per day, accommodation per person per night, and for the
  overseas zones a personal allowance per country. Each rate row has an effective-from date so that a future
  regulation does not rewrite past calculations.
- **Group advance bands**: domestic by trip length (1–2 days 2,000,000; 3–5 days 3,500,000; 6–10 days 5,000,000;
  more than 10 days 7,000,000 LAK per trip); overseas by group size per country (1 person 1,000; 2–5 persons
  1,500; 6–10 persons 2,000; 11 or more 2,500 USD).
- **GL accounts**: 4408720001 daily allowance, 4408730001 accommodation, 4408600002 personal allowance,
  1362220001 travel advance, and the settlement expense accounts.

Values are seeded from `2. ກຳນົດ code and data.xlsx`. The `OA2` table in that file is labelled with `OA1P*` codes;
the seed uses `OA2P*`.

## 8. Agreement (forms 1–4)

Header: form type, subject, Doc.no, document date, reference, title, travel from and to dates, route or
destination, policy option, attachment of the signed agreement or notice.

- Form 1: two dropdowns, province to province. Form 2: district to district within one province. Form 3: country
  (shows country, zone and group). Form 4: province to border zone.
- **Policy option** (who pays): BCEL pays everything; host pays travel; host pays accommodation; host pays meals;
  host pays meals and accommodation. Form 2 has overnight / not overnight.
- **Doc.no** is a sequence number in the format `NNNN.BCEL.YYYY`, with a Lao form `NNNN.ທຄຕລ.YYYY` that maps to
  it one to one. The app stores the `BCEL` form as the canonical value, accepts either form on entry and in
  search (also the paper spelling `001/ທຄຕລ.2026`), pads the number to four digits, and displays the form that
  matches the user's language. The canonical value is unique in the system. It is the key Finance and the advance
  holder use.

Members: `EID` typed, the rest filled from HRM. Each member has their own departure and return dates (the
"update" versions of the forms), defaulting to the header dates, and a day count calculated by the system. One
member is marked team leader and one advance holder; they may be the same person. An agreement may state that no
advance is taken.

Statuses: `draft` → `in_approval` → `approved`, with `rejected` returning to `draft` and `cancelled` possible
until a payment batch is exported. Approval is prepared by → checked by → approved by, as on the paper form. On
approval, Finance is notified.

## 9. Payment calculation

Finance opens an approved agreement by Doc.no. The system builds the checking table, one row per member:

- days = return date − departure date + 1
- daily allowance = days × rate
- nights = days − 1; accommodation = nights × rate
- overseas: personal allowance per country, once
- group advance from the bands in section 7, credited to the advance holder

The policy option removes the components the host covers. Rates are taken from the rate row effective on the
departure date. Every amount shows the rate and count it came from; Finance can adjust a line only with a reason,
and the adjustment is kept beside the calculated value.

Posting: debit the GL account of each component, credit each member's account. Statuses: `calculated` →
`in_approval` → `approved` → `exported` → `posted`.

## 10. Advance settlement (forms 5–6)

The advance holder opens the form with the Doc.no. Trip, dates and advance amount are pulled from the agreement
and payment. The holder chooses the status (unused, partly used, fully used), enters expense lines with amounts,
and attaches receipts. Overseas lines carry an amount, a cross rate and the resulting USD amount.

- total expenses = sum of lines; remaining = advance − total expenses
- remaining > 0: the holder returns it. Debit the holder's account for the remainder and the expense account for
  the amount used; credit 1362220001 for the full advance.
- remaining < 0: the holder is reimbursed the excess (regulation 3.2.3).

Approval chain: advance holder submits → team leader → finance officer (data and receipts) → finance section
head → head of the Administration–Finance department. After the last approval a posting batch is created. The
regulation's deadline is five working days after return; the app shows overdue settlements to Finance and
reminds the holder.

## 11. Posting batch and upload file

One batch per Doc.no and transaction type (payment, advance, settlement). A batch cannot be created twice for the
same pair. Columns of the upload file, from `4. Format form FA-M.xlsx`:

`ACCOUNT, BRANCH, NAME, CCY, CHEQUE_NO, AMT, RVS_NO, DR_CR, REMARK`

GL lines use the composed account string (for example `888010LAK44087200010001`), one debit line per GL account;
member lines use the member's account number, one credit line each. The export refuses a batch whose debits and
credits differ. After uploading to CORE, Finance marks the batch `posted` and may record the CORE reference.
Generation sits behind an interface so that direct CORE posting can replace the file later.

## 12. Roles and visibility

Starting roles: employee (own settlements, agreements they are a member of), HR officer, HR checker, HR approver,
finance officer, finance section head, finance department head, administrator (master data, roles). Record scope
uses the branch on the document, so a branch sees its own documents and head office sees all. Approval workflows
are data in the platform's approval module; the team-leader step is a resolver that reads the leader from the
agreement.

Every create, change, approval, export and posting confirmation is written to the audit log.

## 13. Screens

- Agreements: list with filters, form per type, detail with members, attachments and approval history.
- Payments: "enter Doc.no" lookup, checking table, approval, batch export.
- Settlements: my settlements, form, finance review queue, overdue list.
- Master data: rank map, zones and countries, rates, advance bands, GL accounts.
- Dashboard: documents waiting for me, agreements without payment, settlements overdue.

All text in English and Lao. Printable views match the paper layouts in `3. Format form HRM.xlsx`.

## 14. Testing

- Calculation: table-driven unit tests covering every zone and rank, each policy option, per-member dates, the
  advance bands at their boundaries, and settlement with money left over and with overspend.
- Database tests per module following the platform's testing guide; HRM lookups run against a local database
  built from the structure dump with fixture rows.
- End-to-end: agreement → payment → export → settlement → export, once domestic and once overseas.

## 15. Open questions

Assumptions the build will follow unless corrected:

1. Days are counted inclusively and nights are days − 1 for every member.
2. The domestic advance band "10 days and above" means more than 10 days, since 6–10 already covers day 10.
3. Overseas amounts are paid in USD to the member's USD account.
4. An unknown `EID` arriving from HRM gets the employee role only.

Needed from the business or from HRM:

1. The full `PostType` → `P1`–`P9` mapping (query on `hrm_position` grouped by `PostType`).
2. One-time code or session-token fallback for the handoff.
3. Agreement approval routing: who checks and who approves, by role or by department; and whether branches
   approve and settle locally.
4. (Resolved.) Regulation 4.3 states that North America, South America and all of Africa, not split into groups,
   receive the same policy as Europe group 1. Those countries are seeded with zone `OE1`; the spreadsheet already
   lists them inside the `OE1` country list. Still to confirm: whether Finance wants them shown as "Europe group 1"
   or as their own zone name with the same rates.
5. Form 2 (within a province): which rates apply with and without an overnight stay. The regulation gives 150,000
   LAK per person per day for same-day trips of 50 km or more; the forms do not say.
6. The form key sheet and the form sheets disagree on which forms carry the policy option and which carry the
   accommodation option (forms 2 and 4).
7. Settlement expense account: when 2361800001 applies and when 4405200001.
8. The GL account string for USD entries and whether the branch part is always `888010` or the member's branch.
9. Whether these regulation rules belong in version 1: day 8 onward paid on actual bills up to the rate (3.1.5);
   a host-provided meal deducting one third of the daily allowance, rounded up (4.6); the second-country rule
   (4.8); provincial staff transiting through Vientiane (4.7).
10. (Resolved.) Doc.no is one sequence in the format `NNNN.BCEL.YYYY`, mapped to `NNNN.ທຄຕລ.YYYY` in Lao, so
    uniqueness on Doc.no alone holds. Still to confirm: whether HR types the number from the signed paper or the
    app issues the next number, and whether the middle part is always `BCEL`.

## 16. Build order

1. App scaffold, HRM read layer, sign-in handoff.
2. Master data with seed.
3. Agreements with approval.
4. Payment calculation, checking table, upload file.
5. Settlement with approval chain and posting batch.
6. Dashboard, reminders, printable views.
