# nelvine-platform: Gaps and Proposed Modules

Date: 2026-10-15, updated 2026-10-29 (C3 hook in generated apps, C5 date fields). Status: proposal for the
platform team.
Shared copy: https://claude.ai/code/artifact/8abaea3e-cf9e-4ade-ad08-8b2de8493a84

Four capabilities are missing before a business back-office app can be built on nelvine-platform: external
read-only data sources, sign-in handed over from a host portal, document numbering, and reference data with
effective dates. The gaps were found while designing the first such app, a travel payment app for a bank
(agreements, allowance calculation, approvals, accounting upload), but each item is written for any app on the
platform, not for that one.

## At a glance

| #   | Item                                         | Priority         | Where                             | Who else gains                                                                     |
| --- | -------------------------------------------- | ---------------- | --------------------------------- | ---------------------------------------------------------------------------------- |
| M1  | External read-only data sources              | Must have        | `db`                              | Any app that reads a legacy system, a data warehouse or another app's database     |
| M2  | Trusted sign-in handoff from a host portal   | Must have        | `auth` (new provider package)     | Any app opened as a tile from an existing portal or intranet                       |
| M3  | Document numbering                           | Must have        | New package `numbering`           | Every app with forms: requests, orders, contracts, claims                          |
| M4  | Reference data with effective dates          | Must have        | New package `refdata`             | Any app with rates, fees, bands, tax or price tables                               |
| C1  | Approval routing by organisation and by fact | Core improvement | `approval`                        | Every app whose approvers depend on the requester's unit or the record's values    |
| C2  | Pluggable file writers (XLSX, fixed-width)   | Core improvement | `transfer`                        | Every app that exports to finance, auditors or another system                      |
| C3  | Organisation scope distinct from tenancy     | Core improvement | `authorization` docs + helper     | Every multi-branch or multi-department organisation                                |
| C4  | Money and decimal helpers                    | Core improvement | `core`                            | Every app that handles amounts                                                     |
| C5  | Date fields in the organisation's format     | Core improvement | `nuxt` (web template)             | Every app whose users write dates day first (dd/mm/yyyy)                           |
| N1  | Business calendar                            | Nice to have     | New package `calendar`            | Deadlines, SLAs, approval due times in working days                                |
| N2  | Posting batches (ledger lines and export)    | Nice to have     | New package `posting`             | Every app that pays, charges or books entries                                      |
| N3  | Printable documents and PDF                  | Nice to have     | New package `documents`           | Every app with paper forms, letters or receipts                                    |
| N4  | Snapshot of external records                 | Nice to have     | Pattern in docs, later a helper   | Every app that copies data from a source of truth onto a document                  |

Must have = an app cannot start its first screen without it. Core improvement = an existing package is close but
needs a change. Nice to have = an app can build it locally first and move it into the platform once a second app
needs it.

## Must have

These four block the first screens of a business app. Each is general: the travel payment app is only the first
consumer.

### M1. External read-only data sources

Today `createDatabase` builds one pool, and `currentDb()`, `inTransaction` and the migrations assume that one
database. Apps in an existing organisation usually read people, organisation units, customers or products from a
system they do not own.

Proposed:

- Named extra connections declared in config (`DATABASE_SOURCES_<NAME>_URL` or similar), each with its own pool
  size and timeouts.
- A read-only mode: the connection refuses writes at the driver level, and the platform never runs migrations or
  test resets on it.
- Kept out of the app's transactions: `currentDb()` stays the app database; a source is reached by name, e.g.
  `source('hr')`.
- Typed with Kysely like the main database; a type generator from an existing schema would help.
- Testing helpers: build a local database from a structure dump and load fixture rows, per vitest project.
- Health check and OTel spans per source, so a slow upstream is visible.

Not in scope: writing to external systems (that is an integration, not a data source).

### M2. Trusted sign-in handoff from a host portal

Many organisations already have a portal with its own login, and new apps open as tiles inside it. Users must not
sign in twice. `auth-oidc` already links an external identity (`provider`, `subject`) to a platform user, but only
through the OIDC redirect and callback flow.

Proposed, as a provider package beside `auth-oidc`:

- One-time code exchange: the host stores a hashed code with the user's id and a short expiry (about 60 s); the
  app redeems it once and starts a platform session. A signed token (JWT with a shared key) as a second option for
  hosts that cannot add a table.
- Upstream session check: a hook that re-checks the host session at an interval and ends the platform session when
  the host logs out or times out.
- Users created ahead of sign-in from an external id, without invitation, password or MFA enrolment, so approval
  steps can be assigned to people who have not opened the app yet.
- Mapping rules: which upstream field becomes `username`, display name, and subject attributes.
- Redirect to the host's login page when there is no session.
- Replay protection, audit events for every handoff, and rate limits.

### M3. Document numbering

Almost every business form carries a human-readable number that people quote on paper and in search. Getting it
right under concurrent requests is easy to get wrong, so it belongs in the platform.

Proposed:

- Sequences keyed by any parts the app chooses (document type, unit, year), with reset rules (yearly, never).
- A format template, e.g. `{seq:4}.ACME.{unit}.{yyyy}`, plus a parser so search accepts the formatted number and
  known variants (other language, other separators).
- Safe allocation in the caller's transaction (a locked counter row), so a rolled-back request does not leave a
  gap unless the app allows gaps.
- Manual numbers: an app may accept a typed number instead, checked for format and uniqueness against the same
  register.
- Localised display of the same canonical number (for example a Latin and a local-script form).
- Admin view of sequences and their current values, with audited changes.

### M4. Reference data with effective dates

Rates, fees, bands, account maps and code lists change when a regulation or price list changes, and past
calculations must keep the values they were made with.

Proposed:

- A way to declare a reference table in a module: key columns, value columns, types, and an `effective_from`
  (optional `effective_to`).
- Lookup "as of" a date: `refdata.get('rates', key, asOf)`, cached and invalidated on change.
- A generic admin screen per table: list, filter, add a new version from a date, never edit a past version in
  place.
- Import and export through `transfer`, and an optional approval before a new version takes effect.
- Every change in the audit log, and the version used stored on the record that used it.

Without it, every app writes its own master-data screens and its own history rules.

## Core improvements

These packages exist and are close; each needs a change rather than a new module.

### C1. Approval routing by organisation and by fact

`approval` already supports approvers by user, role, group or a registered `resolver`, step conditions, escalation
and delegation. Two things are missing (the second is listed as not built in the platform handoff):

- **Organisation chain.** Most organisations approve up their own hierarchy: officer, section, department, then
  branch or head office. Each app can write a resolver, but a platform resolver driven by the requester's unit
  (from subject attributes or an org source) would make this configuration instead of code. A re-organisation is
  then a data change.
- **Workflow chosen by a fact.** Pick the workflow from the record (unit, amount, type), e.g. a branch request goes
  to the branch chain and a head-office one to the head-office chain. Today one entity type maps to one workflow.
- Smaller: a documented pattern for "cancel and return to the creator, who files a new record with a new number",
  and an option for steps that wait with no delegation.

### C2. Pluggable file writers in `transfer`

`transfer` writes CSV only. Finance teams, auditors and other systems often expect `.xlsx` or a fixed-width or
bank-specific layout. Proposed: a writer interface (CSV, XLSX, fixed-width, custom) chosen per data transfer, with
header and footer rows and totals lines.

### C3. Organisation scope, distinct from tenancy

`tenancy` models workspaces a user switches between. A branch or department tree is different: a user belongs to
one unit, sees their unit's records, and head office sees all. This already works through
`SubjectAttributesProvider` and policy conditions. Proposed: a documented pattern and a small helper for unit-tree
scope ("my unit and its children"), and a note in the tenancy docs so teams do not model branches as workspaces.

Found while building the first app (2026-10-29): an app created with `nelv` cannot pass `subjectAttributes`.
The generated `platform.modules.ts` calls `authorization()` with no options, and it must not be edited by hand.
The first app therefore scopes by branch in its own code (`scopedBy`) rather than with policies. Proposed: let an
app declare its subject attributes in a module field (for example `subjectAttributes` on `defineModule`) or in
`.nelvrc.json`, so the generated file wires them in. Then a branch rule becomes a policy
(`branchCode eq subject.branchCode`) that administrators can see and change.

### C4. Money and decimal helpers in `core`

MariaDB returns `DECIMAL` as a string, and JavaScript numbers are floats. Proposed: a decimal type with arithmetic,
named rounding modes (including organisation rules such as "round up from a set digit"), currency codes with minor
units, and a Zod schema for amounts in requests and responses. One helper avoids each app rounding the same amount
differently.

### C5. Date fields in the organisation's format

The web template uses the browser's native date input (`<UInput type="date">`), whose format follows the
browser's language: an English browser shows mm/dd/yyyy, while staff in Laos write dd/mm/yyyy. The page cannot
change it. Nuxt UI already has `UInputDate` and `UCalendar`, but they take `@internationalized/date` values, a
package the app cannot add because the generated `package.json` files must not be edited by hand. Proposed:

- `@elvine-sk/platform-nuxt` ships a date field (`PlatformDateInput`, built on `UInputDate`) whose model is a
  plain `YYYY-MM-DD` string, so apps and the API keep using ISO dates.
- An app setting for the date order (`dd/mm/yyyy` by default for `lo`, configurable for `en`), used by that field
  and by `useDates()` for displaying dates, so lists, detail pages and inputs agree.
- `@internationalized/date` becomes a dependency of `platform-nuxt`, not of each app.

Until then the first app has its own small field (typed dd/mm/yyyy, with the browser's calendar behind a button),
with the same `YYYY-MM-DD` model, so moving to the platform field is a component swap.

## Nice to have

An app can build these locally first. They should move into the platform once a second app needs them.

### N1. Business calendar

Holidays and working days per organisation or region, with helpers such as "N working days after a date" and
"working hours between two times". It can read holidays from an external source (M1) or keep its own table. With
it, approval `dueInHours` could count working time, which improves every workflow on the platform.

### N2. Posting batches

Apps that pay, charge or book money produce accounting entries. Proposed: balanced debit and credit lines, a batch
lifecycle (`draft`, `approved`, `exported`, `posted`), a guard against creating the same batch twice, and an
adapter interface. The first adapter writes an upload file through `transfer` (C2); a direct integration with an
accounting or core banking system can replace it later in one place for every app.

### N3. Printable documents and PDF

Many organisations still sign and file paper. Proposed: print views from a template, server-side PDF rendering, the
PDF stored through `files`, with en and lo fonts included.

### N4. Snapshot of external records

When a record is submitted, apps copy fields from a source of truth (a person's name, unit, account) so later
upstream changes do not alter it. Proposed: start as a documented pattern; later a helper that copies the declared
fields, stores the source version, and shows a "source changed since submit" warning.

## Proposed order

1. M1 external data sources and M2 sign-in handoff: an app cannot show a screen without them.
2. M3 document numbering and M4 reference data: needed for the first forms and the first calculation.
3. C1 approval routing, C3 subject attributes in generated apps, C4 money helpers and C5 date fields: apps can
   bridge with a custom resolver, their own scope code and local helpers until then.
4. C2 file writers, N1 calendar, N2 posting batches: built inside the first app, moved up when a second app needs
   them.
5. C3 unit-tree helper and docs, N3 PDF, N4 snapshot helper: as demand appears.

Meanwhile the first app builds items 3 to 5 in its own modules, behind interfaces that match this proposal, so
moving them into the platform is a package swap rather than a rewrite.

## Open questions

- M1: should a data source be able to take part in a distributed transaction, or is read-only enough for now?
- M2: one-time code, signed token, or both? Who owns the host-side part (table and redirect) for each host?
- M3: are gaps in a sequence acceptable by default, or must every number be used?
- M4: one generic `refdata` package, or a pattern each module follows with shared helpers?
- C1: should the organisation tree come from a data source (M1) or be kept in the platform?
- N2: does the platform want to own an accounting model at all, or only the batch and export lifecycle?
