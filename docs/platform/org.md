# Organisation and approval routing

Package `@elvine-sk/platform-org` (`nelv add org`; requires `auth`, `authorization`, `audit`, `transfer`). It holds
the organisation as **units** (a tree) and **people** (a unit, a supervisor, optionally a platform user), and gives
approval and record visibility one answer to "who is in which unit".

## Set up

`nelv add org` registers `org()`; options go in `apps/api/src/platform.options.ts`. A module that reads the org lists `org` in `dependsOn`. Apps that add the capability run
`pnpm db:migrate` (`202611040100_org_create`: tables `org_units`, `org_people`); approval's re-resolving also needs
`202611040200_approval_assignment_origin`.

## Model

- **Unit**: `code`, `name`, `parentCode` (null for a root), `active`. Several roots are fine. No cycles.
- **Person**: `code`, `name`, `unitCode`, `supervisorCode`, `userId` (null for people without a login), `active`.
  A platform user is linked to at most one person. No cycles in supervisors.
- Codes are 1–64 characters, `A-Z a-z 0-9 _ . -`, starting with a letter or digit, trimmed. They compare
  case-insensitively (`utf8mb4_general_ci`): in TypeScript compare `code.toLowerCase()`, or call
  `normalizeCode` (`platform-org`, also exported as `normalizeOrgCode` by `platform-server`). Names are 1–200
  characters.
- Inactive units and people are kept (records still name them) but never resolve as approvers. The walk up passes
  through an inactive unit to its parent.
- There is **one tree for the whole install**. The tables have a nullable `workspace_id`, always null, so
  workspaces do not split the org. Model branches and departments as units, not as workspaces.

## Built-in source or your own

By default the platform tables back the org: **Administration → Organisation** (needs `org.manage` to edit,
`org.read` to look), CSV import and export (transfers `org-units` and `org-people`), audit actions
`org.unit.created`, `org.unit.updated`, `org.person.created`, `org.person.updated`, `org.imported`.

An app can answer from its own system (typically HRM through a data source, `docs/platform/data-sources.md`)
instead. Provide it in exactly one place:

- a module field `orgSource: OrgSource` on `defineModule` (list `org` in `dependsOn`), or
- `org({ source })` in `apps/api/src/platform.options.ts`.

Two providers, or a module field plus the option, fail at boot. With an app source the built-in tables, the editing
routes and CSV import are off: writes fail with `org.read_only` and the admin page shows the org read-only. Every
`OrgSource` method must be implemented (`unit`, `ancestors`, `descendants`, `person`, `personOfUser`, `usersInUnit`,
`listUnits`, `listPeople`, `searchPeople`; types in `platform-server`). The platform caches answers per instance for
60 s.

Example over a data source `hr` (`employees(empNo, fullName, unitCode, active)`). That table has no unit
tree and no supervisor, so units are flat and `supervisor` approvers would find nothing; a real HRM supplies
`parentCode` and `supervisorCode` from its own columns:

```ts
import { source } from '@elvine-sk/platform-db'
import type { OrgPerson, OrgSource, OrgUnit } from '@elvine-sk/platform-server'

const unit = (code: string): OrgUnit => ({ code, name: code, parentCode: null, active: true })
const person = (e: { empNo: string; fullName: string; unitCode: string; active: number }): OrgPerson => ({
  code: e.empNo,
  name: e.fullName,
  unitCode: e.unitCode,
  supervisorCode: null,
  userId: null, // link to users through your own mapping (username = empNo, handoff external id, ...)
  active: e.active === 1,
})
const employees = () =>
  source('hr').selectFrom('employees').select(['empNo', 'fullName', 'unitCode', 'active'])

export const hrOrg: OrgSource = {
  async unit(code) {
    const row = await employees().where('unitCode', '=', code).executeTakeFirst()
    return row ? unit(row.unitCode) : null
  },
  async ancestors(code) {
    const u = await this.unit(code)
    return u ? [u] : []
  },
  async descendants(code) {
    return (await this.unit(code)) ? [code] : []
  },
  async person(code) {
    const row = await employees().where('empNo', '=', code).executeTakeFirst()
    return row ? person(row) : null
  },
  async personOfUser() {
    return null // needs the user-to-employee link
  },
  async usersInUnit() {
    return []
  },
  async listUnits() {
    const rows = await source('hr').selectFrom('employees').select('unitCode').distinct().execute()
    return rows.map((r) => unit(r.unitCode))
  },
  async listPeople(unitCode) {
    return (await employees().where('unitCode', '=', unitCode).execute()).map(person)
  },
  async searchPeople(term, limit) {
    const rows = await employees().where('fullName', 'like', `%${term}%`).limit(limit).execute()
    return rows.map(person)
  },
}
```

`personOfUser` and `usersInUnit` are where your system connects employees to platform users; without that link no
approver resolves.

## Approver kinds

Workflow steps (`approvers` and `escalateTo`) gain two shapes, picked in the workflow editor:

```ts
{ unitRole: { role: 'hr_section_head', unitFact: 'branchCode' } }
{ supervisor: { personFact: 'travellerCode', level: 1 } } // level 1 (direct) to 5
```

`unitFact` and `personFact` name a fact of the entity declared in `fields` with type `string` (the definition is
refused otherwise, and refused while `org` is not installed).

- **unitRole**: the unit code comes from the fact. Walking from that unit up to the root, the first unit where an
  active holder of the role (directly or through a group) is a member of that unit wins. The requester is excluded
  first (`allowSelfApproval: false`), so a requester who is the only holder in their unit sends the step to the
  parent. An unknown unit, a missing fact or nobody up to the root: no approvers.
- **supervisor**: the person code comes from the fact; follow `supervisorCode` `level` times through active people;
  the result is that person's linked user. A gap in the chain, an inactive person or a person without a user: no
  approvers (no walk past a gap). One level per step: a two-level chain is two steps.
- Delegation applies afterwards, as for other kinds.

"No approvers" at submit, resubmit or when a stage activates is `approval.no_approvers` (422); the step and the
reason (for example "no supervisor at level 2 for person E123") are in `error.details`.

Expose the facts in the entity:

```ts
fields: { unitCode: { type: 'string' } },
async loadFacts(id) {
  const person = await ctx().services.get(ORG_DIRECTORY).personOfUser(creatorId)
  return { /* ... */ unitCode: person?.unitCode ?? '' }
}
```

## Following the organisation while a request waits

The recurring job `approval.reresolve` (default every hour; `approval({ reresolveEvery: '30m' })`, or `'off'`)
resolves again every active step that uses `unitRole` or `supervisor` and compares with its pending assignments:

- new approvers get a pending assignment (`origin: 'resolved'`), the `approval.assigned` notification and event;
- approvers no longer resolved are `withdrawn` (shown in the request history); decisions already made still count,
  so an `all` step needs only the remaining approvers, and the job completes the step when withdrawals leave only
  approvals (the same path as a decision, including `onStatusChange`);
- an approver who comes back later is restored to `pending`;
- an automatic delegation follows its delegator; a hand-made reassignment (`origin: 'reassigned'`) wins: a step with
  a pending reassignment is skipped entirely until it ends, so org changes do not reach it;
- when the result is empty nothing is withdrawn and holders of `approval_workflow.manage` get one `approval.stuck`
  notification per step (not repeated);
- every change writes the event `approvers_updated` and the audit action `approval.approvers_updated` (actor:
  system). One failing request rolls back and does not stop the others; the job pages through all waiting requests.

`POST /approval/requests/{id}/recalculate` (needs `approval_workflow.manage`; button _Recalculate approvers_ on the
request page) does the same for one request at once and answers `{ changed, stuck, reason? }` (`stuck`: a step nobody
can approve; the page shows the reason). A step skipped by its condition is never resolved.

## Record visibility by unit

`platform-org` adds subject attributes `subject.personCode`, `subject.unitCode` and `subject.unitTree` (the unit and
every unit below it). A user without an active person gets none, so conditions on them are unknown and deny.

```ts
{ field: 'branchCode', op: 'in', value: { var: 'subject.unitTree' } }
```

For routes that do not use policies, `unitRows(ctx, qb, 'res.branchCode', userId)` (`platform-org`) returns a
`ScopedSelect` of rows whose unit is in the caller's tree; no person means no rows.

- `unitTree` is capped at 1,000 codes. Above that the attribute is left out (a warning is logged once per user per
  minute); give such a head-office user an unconditional permission.
- **It can be stale for up to about 2 minutes** after an org change: the authorization subject cache (60 s) sits on
  top of the org cache (60 s), and an org write does not bump the authorization version.
- Policy conditions compare codes case-insensitively but do **not** trim leading spaces; `unitRows` does
  (`TRIM(column)`), which also means it cannot use an index on the column. Store codes trimmed.

## CSV

Transfers `org-units` (`code,name,parentCode,active`) and `org-people`
(`code,name,unitCode,supervisorCode,username,active`) import in one transaction and may refer to rows later in the
same file; a cycle through file rows is refused with `org.cycle` and nothing is written. A user is matched by
`username`.

- **An empty `parentCode`, `supervisorCode` or `username` cell clears that value on existing rows; a column left out
  of the file keeps it as stored.** A file with only `code,name` renames units without touching their parents.
- The dry run checks the shape of the file only (columns, codes, flags), not the references or cycles; those are
  checked when the import runs.

## Errors

`org.invalid`, `org.cycle`, `org.not_found`, `org.code_taken`, `org.user_linked`, `org.read_only`,
`approval.org_missing` (a definition that uses these kinds while `org` is not installed).

## Not built

- A different tree per workspace (needs approval requests that store their workspace and a per-workspace
  authorization subject cache).
- A workflow chosen by a fact; unit types or levels; roles granted "in" a unit.
- Supervisor chains that skip gaps; org history and effective dates; writing an app source from the admin page.
