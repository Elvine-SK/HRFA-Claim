# Writing a module

A module is one folder under `apps/api/src/modules/<name>/`, registered in `apps/api/src/modules/index.ts`
(`appModules`, after the platform's modules). The usual files: `module.ts` (the `defineModule` declaration),
`migrations.ts`, `schema.ts` (zod schemas and the `FieldMap` lists and policies use), `queries.ts` (reads and
writes, history), `routes.ts`, and one file per integration (approval, files, transfer). The platform's own
reference module (`notes`) uses every capability below; the examples are taken from it.

## Steps

1. Declare it with `defineModule({ name, dependsOn, ... })`. List every module whose services or `PlatformModule`
   fields you use in `dependsOn` (`authorization`, `approval`, `files`, ...).
2. Add it to `appModules` in `apps/api/src/modules/index.ts`. `createRegistry` throws on a wrong order, a missing
   dependency, or a duplicate name.
3. Write migrations, then the fields below that the module needs.
4. Add routes, then `pnpm run openapi` and `cd apps/web && pnpm run api:types`.
5. Add a test file (see [testing.md](testing.md)). Done when `RUN_DB_TESTS=1 pnpm run test`,
   `pnpm run typecheck` and `cd apps/api && pnpm run openapi:verify` pass.

## Lifecycle hooks

Run in module order: `setup(ctx)` (provide services with `ctx.services.provide(serviceKey<T>('name'), impl)`), then `middleware(ctx)` (wraps every `/api/v1/*` request), then `routes(api, ctx)`. `onReady` runs from `platform.ready()` (and `start()`); `onShutdown` runs in reverse order. `commands` run through `cd apps/api && pnpm run platform <command>`; `ctx.services.get` throws when the providing module is missing, `tryGet` returns `undefined`.

## Migrations

- `MigrationSet` keyed `YYYYMMDDHHmm_<source>_<change>`, enforced by `^\d{12}_[a-z0-9-]+_[a-z0-9_]+$` (the source segment has no underscores). All packages' and the app's sets merge, sort by name, and run forward-only with unordered pending migrations allowed.
- Build tables with `createTable(db, name)` (InnoDB, utf8mb4_general_ci), `withStandardColumns` (`id`, `created_*`, `updated_*`, `version`) and `withSoftDelete` (`deleted_*` plus generated `active_flag` for live-only unique keys). Types: `uuidType`, `datetimeType` (`datetime(3)`), `jsonType` (`longtext`) with `jsonCheck(col)`, status columns as `varchar` with `inCheck(col, values)` (no `ENUM`).
- Name every UUID column `id`, `*_id` or `*_by`.
- Never edit a migration that already ran somewhere: add a new one. The test setup collects every module's migrations itself.

## Records

Write inside `inTransaction`: insert with `createdStamp(id)`, update with `updateVersioned(table, id, version, values)`, soft-delete with `updateVersioned(..., deletedStamp())`, and record each change with `writeHistory(config, { entityId, version, action, before, after })` (see the sketch below). `HistoryConfig.redacted` fields store `['[redacted]', '[redacted]']`.

```ts
// schema.ts
export const noteHistory = { entityType: 'note', tracked: ['title', 'body', 'status'] } as const

// queries.ts
export const live = () => currentDb().selectFrom('notes').select(COLUMNS).where('deletedAt', 'is', null)

export async function getNote(id: string) {
  const row = await live().where('id', '=', uuidBin(id)).executeTakeFirst()
  if (!row) throw AppError.notFound()
  return row
}

export async function createNote(input: NoteInput) {
  const id = uuidv7()
  return inTransaction(async () => {
    await currentDb()
      .insertInto('notes')
      .values({ ...createdStamp(id), ...input })
      .execute()
    await writeHistory(noteHistory, { entityId: id, version: 1, action: 'create', after: input })
    return getNote(id)
  })
}

export async function updateNote(id: string, version: number, patch: Partial<NoteInput>) {
  return inTransaction(async () => {
    const before = await getNote(id)
    const next = await updateVersioned('notes', id, version, patch, { softDelete: true })
    const after = await getNote(id)
    await writeHistory(noteHistory, { entityId: id, version: next, action: 'update', before, after })
    return after
  })
}
```

`updateVersioned` answers `409 resource.stale_version` when `version` is not the stored one, so two people
editing the same record never overwrite each other silently: send the version the client loaded.

### Audit events and record history

Two trails, written in the same transaction as the change:

- **Record history** (`record_history`): what changed in one record, field by field with old and new values.
  Serve it on a history route of the record (`GET /notes/{id}/history` in the reference module).
- **Audit log** (`audit_events`): who did what, across the app. With `audit()` installed, every history row
  also writes an event: `record.created` / `record.updated` / `record.deleted` / `record.restored`, category
  `data`, target = the entity type and id, `details: { version, fields }` (the changed field names, never the
  values). A module adds nothing for this: no `auditActions`, no call.

Turn it off for one entity with `audit: false` on its `HistoryConfig` (high-volume or unimportant records), or
for the whole app with `audit({ recordChanges: false })`. A history row written outside `writeHistory` (a
stored procedure) reaches the log through `announceHistory(config, historyId)` after the write (below).

Record your own audit event, with `getAudit(ctx).record({ action, targetType, targetId, details })`, for what
is not a field change: a status decision, an export, a permission-relevant action, a refusal (`outcome:
'denied'`). Declare each action in the module's `auditActions` (outside production an undeclared one throws).
An action whose prefix is not a category (`auth`, `authz`, `admin`, `data`, `approval`, `system`) is filed as
`data`. `details` passes through `redact()`; `{ independent: true }` keeps a failure event when the transaction
rolls back.

## Stored procedures

Optional. TypeScript with Kysely is the default; a team that prefers to
keep write rules in the database can put them in stored procedures and call them with `callProcedure` from
`@elvine-sk/platform-db`.

Use a procedure for set-based or heavy writes and for rule checks on data (stock below zero, a status
transition). Don't use one for anything that depends on who is asking: permissions, policies and scopes stay in
TypeScript, as do routes, validation, reads (lists need `applyScope` / `paginate`), audit events and `afterCommit`
side effects (written by the service right after the call).

```ts
await callProcedure('products_update', [uuidArg(id), version, name ?? null /* … */], {
  errors: { 'products.stock_negative': 422, 'products.not_draft': 409 },
})
```

- `callProcedure(name, args, { errors })` runs `CALL name(…)` on `currentDb()`, inside `inTransaction`: it joins
  the surrounding transaction, or opens one so a procedure that signals after a write leaves nothing behind. A
  procedure called through `getDatabase()` or another pool runs outside the app's transaction.
- `name` must match `^[a-z][a-z0-9_]{0,63}$` (refused before anything is sent). Arguments are bound; wrap a UUID
  in `uuidArg(id)` (sent as `BINARY(16)`, `null` stays `NULL`).
- It returns the first result set with camelCase keys (other result sets are dropped). Columns named `id`, `*_id`
  and `*_by` come back as UUID strings, as in every read; other `BINARY(16)` columns stay Buffers, `DECIMAL`
  stays a string, `TINYINT(1)` is a boolean. Rows are unscoped: never return them to a caller who has not
  passed the checks (`scopedBy` or TypeScript scoping first).
- Errors: `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '<module>.<key>'` (errno 1644). A key listed in `errors`
  becomes an `AppError` with that code and status, and the response text comes from the module's `messages`
  (add every key in en and lo). `resource.not_found` (404) and `resource.stale_version` (409) are always known.
  Any other key is rethrown and answers 500: `mapDatabaseError` deliberately does not map 1644, since only the
  calling module knows a key's status and an unexpected SIGNAL is a bug to log.
- The procedure must not `COMMIT`, `ROLLBACK`, `START TRANSACTION` or run DDL (MariaDB commits before DDL): the
  app owns the transaction. Check before writing, so a refusal changes nothing even outside a transaction.
- Pass in what only the app knows: the actor, `now()`, the request id, and the ids of new rows (uuidv7, which
  history lists sort by), for example as the last arguments.
- A procedure that inserts into `record_history` takes the row's id from the app; call
  `announceHistory(config, historyId)` after it, in the same transaction, so the change reaches the audit log. It does nothing when the procedure wrote no row.
- Create procedures in a migration of the module that owns them, `DROP PROCEDURE IF EXISTS` first (DDL is not
  rolled back, so a run that failed half way may have created some). Change one later with DROP + CREATE in a
  new migration, never by editing the old one. The test databases drop procedures and functions on reset.
- MariaDB puts a `DECIMAL` or `INT` variable into JSON as a string: `CAST(x AS DOUBLE)` / `CAST(x AS SIGNED)`
  inside `JSON_ARRAY` and `JSON_OBJECT` . Compare text byte for byte with
  `BINARY a <=> BINARY b`: the collation ignores letter case.

## Workspaces (platform-tenancy)

Optional. With `tenancy()` installed, people are members of workspaces and a resource can be kept per
workspace. The server picks the request's
workspace from the person's memberships: the `X-Tenant-Id` header or the `nelv_tenant` cookie
(`POST /tenancy/switch`) only selects among them, and someone in exactly one needs no choice.

To keep a resource per workspace:

1. A `tenant_id BINARY(16) NOT NULL` column (`withTenantColumn` + `createTenantIndex` for a new table; an
   existing one needs a migration that adds the column and fills it for existing rows), and `tenantId: { type: 'uuid' }` in
   its `FieldMap`.
2. `policyResources.<r>.tenantField: 'tenantId'`. Authorization then fences every check and scope on the
   request's workspace, for supers too; without a workspace nothing matches. Read the column in the row you
   pass to `authorize`, and leave it out of responses.
3. Writes take `requireTenantId()` (or `tenantValues()`); jobs carry the workspace of the request that queued
   them. Pass `tenantId: currentTenantId()` in the record of a `create` check.
4. CLI commands have no request: set the workspace with `runWithContext({ ...getContext(), tenantId }, …)`
   . `tenancy:create <key> <name> [--member <email or username>]` makes one.

The web shows the workspace in the sidebar's brand block, switches between several there, and sends someone in
several with none chosen to `/workspace` first (`useWorkspaces`, `middleware/workspace.global.ts`).
Administration → Workspaces needs `tenant.manage`. Approval requests and notifications are not per workspace.

## Module fields

| Field                                   | Package       | Shape and effect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permissions`                           | server        | `{ resource: [actions] }` gives keys `resource.action`; authorization syncs them to the `permissions` table on ready, and keys no longer declared stop granting.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `policyResources`                       | authorization | `{ resource: { fields: FieldMap, label } }`: fields policy conditions may reference and their columns for `applyScope`. Without it, policies on the resource accept no condition (`authz.no_fields`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `auditActions`                          | server/audit  | Every action the module passes to `audit.record`; outside production an undeclared action throws.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `messages`                              | server        | `{ en: { [errorCode]: text }, lo: {...} }`; the error handler translates `AppError` messages by negotiated locale (`en`, `lo`, default `en`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `menus`                                 | server        | `MenuItem { key, label, to, icon?, group?, order?, permission? }`, served by `GET /api/v1/platform/manifest` and shown in the web menu: `label` is a web i18n key, `to` must be a web page, `group` is `workspace` (default, also for unknown groups) or `admin` or a `menuGroups` id; shown when the user `canSome` its `permission`. An app's own web nav item with the same id wins; `order` sorts items in the manifest only, and on the web they follow the app's own items in a shared group. Apps add to `workspace`, `admin` or another manifest group with `useNavigation().extend`: `register` replaces the whole group, and done after the manifest loads it drops the platform items. |
| `menuGroups`                            | server        | `{ id, label, order? }` groups beyond `workspace` (10) and `admin` (80); the same id replaces a built-in; a group without `order` gets 100.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `manifest`                              | server        | `(ctx) => sections` merged into the manifest response (approval uses it for `approvables`): arrays from several modules are concatenated, a later non-array value replaces an earlier one with a warning, and `modules`, `groups` and `nav` are ignored with a warning.                                                                                                                                                                                                                                                                                                                                                                                                                           |     |
| `publicRoutes`                          | auth          | `'METHOD /path'` relative to `/api/v1`, `/*` suffix for prefixes; everything else requires sign-in.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `jobs`, `recurringJobs`                 | jobs          | See below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `approvalEntities`, `approvalResolvers` | approval      | See below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `dataTransfers`                         | transfer      | See below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `events`                                | server        | See below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `inboundHandlers`                       | webhooks      | See below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Jobs

- `JobDefinition { name, queue?, maxAttempts? (5), handler(payload, info) }`; the return value is stored as the job result. `RecurringJob { name, job, every: '30s' | '5m' | '1h' | '1d', payload? }`, minimum 10s.
- Enqueue with `ctx.services.get(JOBS).enqueue(name, payload, { uniqueKey?, runAt?, maxAttempts? })`. It writes through `currentDb()`, so the job becomes visible when the surrounding transaction commits; a `uniqueKey` returns the existing queued/running job.
- Handlers run as the system actor with `requestId` `job:<id>`, outside any transaction. A throw retries after `min(3600, 5 * 2^attempts)` seconds until `maxAttempts`, then the job is `dead`. Act as a user with `runWithContext({ ...SYSTEM_CONTEXT, actor: { type: 'user', id } }, fn)` .

## Approval

- `defineApprovalEntity({ type, facts, fields, loadFacts, canView, onStatusChange?, display? })` . Facts are snapshotted at submission and are what step conditions see; `fields` types them. `onStatusChange` runs inside the decision's transaction. `display: { label, icon?, link? }` (web i18n key or literal, icon, record page with `:id`, e.g. `/notes/:id`) is how approval lists show the record; without it they show the type name, a generic icon and no link.
- `approvalResolvers: { 'requester.manager': async ({ requesterId, facts, ... }) => userIds }`.
- Submit with `ctx.services.get(APPROVAL).submit(type, entityId, userId)`. Workflows are data, created through `POST /api/v1/approval/workflows` and `.../{id}/versions` with `activate: true`; approvers are `{ user } | { role } | { group } | { resolver }`, steps complete on `any` or `all`.
- A record type can have several live workflows. Submit routes take an optional JSON body `SubmitBody` (`{ workflow?: string }` from `@elvine-sk/platform-approval/schemas`) and pass `{ workflow }` as the fourth `submit()` argument. Without it the type's default (or its only usable live workflow) is used; with several and no default, submit returns 422 `approval.workflow_required` and the web's submit dialog asks the user. Admins limit who may choose a workflow (`audience`: role and group keys), set one default per type and deactivate workflows.

## Data transfers

`defineTransfer({ entity, label, export?, import? })` . Export: `{ resource, action? ('read'), fields, query, columns }`; the job re-applies the requester's scope with the `policyResources` field map (falling back to `fields`), then list filters and sort. Import: `{ permission, columns, schema, importRow }`; needs `permission` unconditionally, and each row runs `importRow` in its own transaction as the importing user.

## Events and live updates

`@elvine-sk/platform-events` (`events()`, `nelv add events`) turns changes into platform events: live hints
to browsers over SSE (`GET /events`) and the input of outgoing webhooks. Without the package `emit` does
nothing.

Declare every type a module emits in `events` (a core field; outside production an undeclared type throws):

```ts
events: {
  'note.published': {
    label: 'notes.events.published', // message key of the module, shown in the webhook editor
    subject: 'note', // entity type of the subject
    webhook: true, // offered to webhook subscriptions; without it the event is live only
    load: (id) => loadNoteForApi(id), // optional: the record in its API shape, for `full` webhook payloads
  },
},
```

Emit with `emit(ctx, { type, subject?, audience, data? })` from `@elvine-sk/platform-server`, inside the
transaction of the change: webhook deliveries are written in that transaction (a rollback leaves none), the live
hint goes out after commit. `id`, `at`, `tenantId` and `actor` come from the request context.

- `audience` decides who hears it live: `{ users: [ids] }`, `{ permission: 'note.read' }` (holders, by
  `canSome`), or `{ everyone: true }` (everyone connected in the event's workspace). Webhooks ignore it: they
  match on type and workspace.
- `data` is small and never holds record values (`{ fields: ['title'] }`). The wire carries the type, the
  subject, the time, `data` and `byMe`; never the actor id. `byMe` compares users, so the same person's
  other tab sees its own change as `byMe` and gets no banner (a save there still meets the `409`).
- `record.created` / `updated` / `deleted` / `restored` come from record history for free: every
  `writeHistory` (and `announceHistory`) emits one to `everyone` in the workspace with `data.fields`. Turn it
  off per entity with `events: false` on the `HistoryConfig` (independent of `audit: false`). Record history has
  several observers: audit and events each add one with `addHistoryObserver(fn)`, which returns a remover. The
  deprecated `setHistoryObserver` replaces all of them (**breaking** for audit and events), and its `fn` sees
  only rows with `audit` on, as before.
- Built in: `record.*`, `notification.created` (from `notify()`), `job.finished` (the job's creator and
  holders of `job.read`, in the job's workspace; for housekeeping jobs, `webhooks.*`, `*.purge` and
  `platform.cleanup`, the creator only, and nothing without one), `approval.assigned` / `approval.decided`, `webhook.test`.

On the web, `useLiveEvents()` (one `EventSource` per tab) reloads the bell, approvals, jobs and transfer
queries. For a record type, register its API paths in an app plugin, and use `useLiveRecord` on its form:

```ts
// app/plugins/live-records.ts
export default defineNuxtPlugin(() => {
  registerLiveRecord('note', ['/notes']) // a record.* hint for 'note' reloads queries under /notes
})
// NoteForm.vue
const live = useLiveRecord('note', () => props.note?.id, { dirty, reload: () => emit('reload') })
// live.changedElsewhere: show <PlatformLiveChangedBanner> instead of replacing unsaved edits
```

Timers that only stand in for live updates use `refetchInterval: livePolling(ms)`: they poll only while the
stream is down. Missed hints are not replayed; after a reconnect every live query reloads once. Settings and the
proxy: [deployment.md](deployment.md), "Events and live updates (SSE)".

## Webhooks

`@elvine-sk/platform-webhooks` (`webhooks()`, after `events`, `jobs` and `authorization`; `nelv add webhooks`)
sends events out and receives them. Administrators manage both in Administration → Webhooks (`webhook.read`,
`webhook.manage`; no role holds them at first). Security: [security.md](security.md), "Webhooks".

Reading another system's database (an HR system): [data-sources.md](data-sources.md).

**Outgoing.** A subscription picks event types (or `<prefix>.*` patterns) among those declared with
`webhook: true`. Payload `minimal` (default) sends `{ version: 1, id, type, at, subject, data }`; `full` adds
`record` from the event's `load` and can only be chosen for events that have one. Give an event `load` only
when its API shape is safe to hand to whoever runs the receiver: it is not filtered by the receiver's
permissions. Deliveries are rows and jobs (queue `webhooks`), so they survive restarts and show in
Administration → Jobs.

**Incoming.** A module declares what can be done with what arrives; an administrator creates a source (its URL is
`POST /api/v1/hooks/{sourceId}`) and picks the handler:

```ts
inboundHandlers: {
  'notes.create': {
    label: 'notes.inbound.create', // message key; the web shows its own key of the same name when it has one
    body: z.object({ title: z.string().min(1).max(200), body: z.string().max(20_000).default('') }),
    handle: async (body, { sourceId, deliveryId, headers }) => {
      await createNote({ ...body, status: 'draft', pinned: false, dueOn: null })
    },
  },
},
```

- The handler runs in a job as the `system` actor in the source's workspace (none for an all-workspaces
  source). Its writes share a transaction with marking the event `processed`.
- A body that fails `body` ends `failed` at once; a throw retries (3 attempts), then `failed` with the error.
  _Run again_ in the log queues it again. A handler can run twice for one event (a rerun while a retry is
  queued): make it idempotent where that matters.
- Keys are unique across modules (a second declaration stops the API at start). Without `webhooks()` installed
  the field does nothing, and the API logs a warning at boot.

## Dashboard stats and widgets

`@elvine-sk/platform-dashboard` stores each person's dashboard layout and serves `GET /dashboard/stats`. A module
adds numbers to the stat strip with `dashboardStats` (list `dashboard` in `dependsOn`):

```ts
dashboardStats: [
  defineDashboardStat({
    key: 'notes.published', // unique across modules
    label: 'notes.status.published', // web i18n key
    icon: 'i-lucide-send',
    tone: 'success',
    permission: 'note.read', // left out for people without it
    value: ({ ctx, c }) => countNotes({ ctx, c }, 'published'), // count through applyScope / scopeAll
  }),
]
```

A stat that throws is logged and shown as "—"; the others still load. Widgets are web components: register them in
an app plugin with `useWidgetRegistry().register({ id, title, description, icon, sizes, defaultSize, order,
permission, module, component })` (the component gets a `size` prop and draws itself in
`PlatformDashboardWidgetFrame`), and shortcuts with `useQuickActions().register(...)`. The server never validates
widget ids: the web drops ids that are unknown or no longer visible to the person.

Administrators choose which roles see a widget. Declare the widget's id on the module that adds it, and it becomes the
permission `widget.<id>` (resource `widget`, shown as "Dashboard widgets" in the access matrix, each row named after
the widget's title):

```ts
dashboardWidgets: ['recent_notes'], // the id given to useWidgetRegistry().register; a-z, 0-9, _ (a permission action)
```

No role holds a new widget permission until an administrator grants it; super administrators see every widget. A
person then needs both `widget.<id>` and the widget's own `permission`. The platform's widgets (`stats`, `quick`,
`approvals` with the approval module, `activity` with audit) are declared by the dashboard package. A widget
registered only on the web, with no declaration, is not gated by role.

## Files

Records take attachments with `fileEntities` (`defineFileEntity`, with `display` for file lists). Storage (local
disk, a shared folder or S3), permissions, the attachments card and the API are in [files.md](files.md).

## Lists, filters and saved views

A module declares each list the web may filter (a core field, no package needed):

```ts
lists: {
  notes: {
    fields: noteFields, // the FieldMap the list route parses its query with
    views: [
      { key: 'mine', label: 'notes.views.mine', query: { filters: [{ field: 'ownerId', op: 'eq', value: '@me' }] } },
    ],
  },
},
messages: { en: { 'notes.views.mine': 'My notes' }, lo: { … } },
```

- The key (`notes`) is what the page passes to its table as `list-key`. The first module to declare a key keeps
  it; a second one is logged and ignored.
- `GET /platform/manifest` publishes each list's fields as `lists.<key>.fields`: type, the operators the API
  accepts, enum values, `nullable`, `sortable`, `searchable`. Never the column. Every signed-in person can read
  these names, also for lists they may not open.
- `views` are built-in views, in tab order. `label` is a message key of the module. `@me` stands for the caller's
  id and is allowed on `uuid` fields only. A view the list's own parser would refuse, a duplicate key or a
  misplaced `@me` stops the API at startup, naming the module, list and view.
- `checkViewQuery(fields, query)` and `collectLists(registry)` are exported from `@elvine-sk/platform-server`.

Saved views need `@elvine-sk/platform-views` (`views()`, after `auth`; `nelv add views`): the `saved_views`
table and `GET /views?list=`, `POST /views`, `PATCH` and `DELETE /views/{id}`. Each person sees only their own
views (20 per list; names unique per person and list, compared without letter case) plus the list's built-in
ones. Without the package the filter bar still works and the tab row is not shown.

On the web, `PlatformDataTable` takes `list-key`, `filter-labels` (field → label; a field without a label is not
offered), `filter-value-labels` (field → value → label, for enums) and `filter-user-fields` (`uuid` fields that
hold a user). `filter-hide` lists fields the page filters with a control of its own (they get no chip and are
not offered; the status tabs' field is hidden already). A page that keeps something of its own in `?view=`
passes `view-param` so the saved-view tabs use another query parameter.
