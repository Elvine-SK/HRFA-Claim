# External read-only data sources

Read people, organisation units, customers or accounts from a database the app does not own (an HR system, a core
system), with typed Kysely queries, lists included. A source is MySQL/MariaDB only, read-only, and never part of the
app's database, its transactions or its migrations.

## Configure

```
DATA_SOURCES=hr,core
DATA_SOURCE_HR_URL=mysql://hr_reader:…@hr-db:3306/hr   # required, must start with mysql://
DATA_SOURCE_HR_POOL_SIZE=5                             # default 5
DATA_SOURCE_HR_TIMEOUT_MS=5000                         # default 5000: connect, pool wait and each query
DATA_SOURCE_HR_TIMEZONE=+07:00                         # default +00:00: the zone of the upstream's DATETIME values
```

- Names are lower-case `[a-z][a-z0-9_]*`; the variable uses the upper-case name. A `DATA_SOURCE_<X>_*` variable whose
  name is not in `DATA_SOURCES` is a config error, so a misspelt name fails at boot.
- The time zone is an offset (`+07:00`), not a named zone (`Asia/Vientiane`).
- Sources connect lazily: one that is down at boot does not stop the app.
- Tracing: pass `sourcePlugins: (name) => ({ plugins, onQuery })` in `PlatformAppOptions` (wire it to
  `otelKyselyPlugin`, as for the app database).

## Production: give each source a user with SELECT only

Every source connection runs `SET SESSION TRANSACTION READ ONLY`, but that is the second guard, not the first: an
explicit read-write transaction overrides it. The first guard is the database user: create one per source with
`GRANT SELECT` only, on the schemas the app reads. `platform doctor` reports write privileges (`INSERT`, `UPDATE`,
`DELETE`, `CREATE`, `DROP`, `ALTER`, `ALL PRIVILEGES`) on any database as a failure, not only on the source's own.
The platform never migrates, resets or writes a source at runtime.

## Read

```ts
import { source } from '@elvine-sk/platform-db'

const people = await source('hr').selectFrom('employees').select(['empNo', 'fullName']).execute()
```

- `source(name)` for a name that is not configured throws, naming the missing `DATA_SOURCES` entry.
- A source is never in the app's transaction. Calling `source()` inside `inTransaction` is allowed; the read runs on
  its own connection and sees the upstream's data, not the transaction's. It does not roll back and is not consistent
  with the app's uncommitted rows.
- Sources keep `CamelCasePlugin` but not the app's `typeCast`: no UUID decoding (a `CHAR(16) employee_id` is a
  string), and `TINYINT(1)` stays a number (`1`, not `true`). `DECIMAL` and `DATE` are strings; `DATETIME` and
  `TIMESTAMP` are `Date` values read in the source's time zone.
- Streaming (`.stream()`) errors from a source are not mapped to `source.unavailable`; use `.execute()`.
- `source()` is not gated by permissions: internal lookups (the requester's own unit) run without a request. A route
  that returns source rows to a caller does the check (below).

### Types

```sh
cd apps/api && pnpm add -D kysely-codegen
pnpm run platform source:types hr                        # in apps/api; writes src/sources/hr.d.ts
pnpm run platform source:types hr --out src/sources/hr.d.ts
```

It reads `DATA_SOURCE_HR_URL` (in `.env` or the environment), generates the schema types, types `DATE` columns as
`string`, and merges them into `DataSources` so `source('hr')` is typed. `kysely-codegen` must be installed in the
app; the command says so when it is missing. The URL goes to the generator through the environment, and failures
are reported without the credentials. Commit the file and regenerate it by hand when the upstream schema changes.
The app's `tsconfig.json` must include `src/sources/*.d.ts`.

## Unavailable upstream

A failure to reach a source (connect, timeout, pool wait, access denied, unknown database) becomes `AppError` code
`source.unavailable`, HTTP `503`, message "An external data source is unavailable. Try again later." with
`details: { source }`. The driver message is logged, never returned. A SQL bug (unknown column) stays `500`.

- Routes that read a source declare the `503` themselves: `errorResponses` has no 503 helper. Add
  `503: jsonContent(ErrorSchema, 'The HR system is unavailable')` to the route's `responses`.
- The timeout is per query. A list runs a count and a page, so against a slow upstream it can take about twice
  `DATA_SOURCE_<X>_TIMEOUT_MS` before answering; a down one fails on the first query.
- A source has its own pool; its failures never touch the app's pool.
- `/ready` has a `sources` entry per source (`ok`, `unavailable`, or `unknown` until the first check). It never waits
  on a source and never returns `503` because of one; the status is refreshed in the background when older than
  10 s.

## Lists

Build the query on `source(name)`, then scope it with `sourceScope`, which answers `403` without the permission and
returns a `ScopedSelect` for `paginate`:

```ts
const qb = source('hr').selectFrom('employees').select(['empNo', 'fullName', 'unitCode', 'active'])
const page = await paginate(await sourceScope(ctx, c, 'hr', qb, 'employee.read'), query, employeeFields, {
  tieBreaker: 'empNo',
})
```

- The query must come from `sourceScope` or `sourcePicker`: they bind it to the source. An unbound source query
  passed to `paginate` is counted on the app database and fails.
- `paginate` needs a `tieBreaker` (a unique column) when the table has no `id` column.
- No tenant fence and no row policies: sources are not tenant-aware. Gate by permission, declared in the module that
  exposes the route, as for any permission.
- Field maps use the usual `FieldSpec` types; do not use `uuid`.
- `TINYINT(1)` columns come back as numbers: convert in the route (`active === 1`), and use `toIso` for dates.

### Pickers

`sourcePicker(ctx, c, name, qb, permission, query, options?)` is for "find a person" routes. It checks the
permission, then rejects a search shorter than `minSearch` characters (default 2, after trimming) with
`422 validation.failed` (field `q`, code `search_required`), and caps `pageSize` at `maxPageSize` (default 20). It
returns `{ qb, query }` for `paginate`.

```ts
const qb = source('hr').selectFrom('employees').select(['empNo', 'fullName', 'unitCode'])
const picked = await sourcePicker(ctx, c, 'hr', qb, 'employee.search', query)
return c.json(await paginate(picked.qb, picked.query, optionFields, { tieBreaker: 'empNo' }), 200)
```

Few columns rule: a picker selects only what its list shows (number, name, unit). With a search term required and
20 rows per page, giving every requester the picker permission is acceptable; with more columns it is a directory
dump. Keep the full-detail list behind its own stricter permission.

## Store upstream keys

App rows keep the upstream's own key (the employee number) in a plain column. There are no foreign keys across
databases, and the platform does not mirror source rows. The upstream row can change or vanish: read it again when
you need it, and copy the fields a record must keep (a name on an approved request) onto the record.

## Tests and local development

Tests run against a local database built from two committed files, `test/sources/<name>.schema.sql` and
`test/sources/<name>.fixtures.sql`. Make the schema file from the real upstream and write the fixture rows by hand:

```sh
mysqldump --no-data --skip-triggers -h hr-db -u hr_reader -p hr > apps/api/test/sources/hr.schema.sql
```

(`--skip-triggers`: the loader does not support `DELIMITER`.) In `test/global-setup.ts`, after `setupTestDatabase`:

```ts
await setupTestSource(
  'hr',
  { schema: join(dir, 'hr.schema.sql'), fixtures: join(dir, 'hr.fixtures.sql') },
  'hr_fam', // the suite, as for setupTestDatabase
)
```

It creates the source's test database, drops its tables, and loads both files; it refuses a name without `test`.
Point the app config at it with `authTestConfig({ dataSources: [{ name: 'hr', url: testSourceUrl('hr'), poolSize: 2,
timeoutMs: 1000, timezone: '+07:00' }] })`. Fixtures load once per run: tests must not change source rows.

For development, load the same files into a local database and point `DATA_SOURCE_HR_URL` at it:

```sh
mariadb -h localhost -P 3306 -u root -p -e "CREATE DATABASE IF NOT EXISTS hr_fam_src_hr"
mariadb -h localhost -P 3306 -u root -p hr_fam_src_hr < apps/api/test/sources/hr.schema.sql
mariadb -h localhost -P 3306 -u root -p hr_fam_src_hr < apps/api/test/sources/hr.fixtures.sql
```

## `platform doctor`

Run `pnpm run platform doctor` in `apps/api`. For each source it prints the time zone, connects, and checks that the session is read-only and that `SHOW GRANTS`
lists no write privileges on any database. A source it cannot reach, a session that is not read-only, or a write
grant is a problem; run it with the production `DATA_SOURCE_*` variables.

## Not covered

Other engines, a stale fallback when the upstream is down, writing to the upstream, joining a source into the app's
transaction, row policies on source tables, and a UI picker component (build one with Nuxt UI over the picker route).
