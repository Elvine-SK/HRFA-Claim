# Reference data

Package `@elvine-sk/platform-refdata` (`nelv add refdata`; requires `audit`, `auth`, `authorization`, `transfer`).
It gives a module code lists (categories, units) and rate tables (tax rates, fees) that change over time: each
change is a dated sheet, a lookup answers "what applied on this date", and an admin page edits them. The
platform's reference app uses it for product categories and tax rates.

## Set up

Register `refdata({ timeZone? })` after `transfer()` and before the modules that declare tables (`nelv add refdata`
does it; options go in `apps/api/src/platform.options.ts`). `timeZone` is an IANA zone, default `UTC`: "today" and
every effective-date comparison use it (`Asia/Vientiane`, for example). A module that declares tables lists `refdata` in `dependsOn`. Apps that
add the capability run `pnpm db:migrate` (`202611020100_refdata_create`: tables `refdata_sheets`, `refdata_rows`,
`refdata_table_state`). Dates travel as `yyyy-mm-dd` strings.

## Declare a table

A module field `refTables: [defineRefTable({...})]`. A repeated `key`, an unknown column type, a `ref` to a table
that is undeclared or not a `codes` table, and a key column of a type that cannot be a key all throw at boot.

| Field              | Meaning                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `key`              | Unique across modules: `products.tax_rates`                                                   |
| `label`            | Name on the admin page (a web i18n key or a literal)                                          |
| `kind`             | `codes`: one key column `code` and a `label` column. `rates`: values that apply from a date   |
| `scope`            | `global`: one set for the app. `workspace`: each workspace may keep its own, see below        |
| `columns`          | `{ name: { type, key?, optional?, table?, precision?, scale?, maxLength? } }`                 |
| `managePermission` | Optional permission needed to change the table's sheets, on top of the `refdata.*` permission |

Key columns make up the row key (joined with `|`; a value containing `|` is refused). A `rates` table needs at
least one key column (`category`), which `get` takes as `{ category: 'GOODS' }` (a string when there is one).

Column types: `text` (`maxLength`), `code` (no spaces, up to 64), `label` (an object with `en` and `lo`, both
required), `integer`, `decimal` (`precision`, `scale`), `boolean`, `ref` (`table`: the code must exist and be
active on the sheet's date, error `refdata.ref_inactive`). `text`, `code`, `integer` and `ref` may be keys. A
decimal is a **string** from the database to the caller: never `Number()` it. Write decimals as strings too; a
JSON number is taken only when it is a safe integer (`refdata.invalid` otherwise, since `0.1` or a large number has
already lost digits). An app adds its own with a module field
`refColumnTypes: [defineRefColumnType({ name, schema, fromText, toText, key? })]`; both fields go through
declaration merging, so list `refdata` in `dependsOn`.

## Sheets

A sheet is the full set of rows of a table from its `effectiveFrom` date. The sheet in force on a day is the one
with the greatest `(effectiveFrom, revision)` on or before it. A new sheet starts as a copy of the latest sheet at
its level, so a change is "copy, edit the rows that changed". A workspace level's first sheet starts as a copy of
the global sheet in force on its date (empty when there is none), so it overrides only the rows it changes.

- A sheet is editable (rows, date, delete) while it starts after today. Once in force it is **locked**
  (`409 refdata.sheet_locked`); change it with a correction.
- Two sheets of one level cannot start on one date (`409 refdata.date_taken`).
- Every change is audited: `refdata.sheet_created`, `sheet_redated`, `sheet_deleted`, `sheet_corrected`,
  `history_closed`, `rows_changed` (row values included when a change touches at most 20 rows). A CSV import
  writes rows one at a time, so it records one `rows_changed` event per row.

### Backfill and Close history

When a table is new its history is **open**: sheets from the past can be created and edited, so an admin can load
last year's rates. History stays open, per table and per level (global, or one workspace), until the first public
lookup (`get`, `sheet`, `pick`, `label`, the `/options` picker route) or an admin presses _Close history_. From
then on a new sheet must start after today (`422 refdata.date_in_past`), because records may already have used
the old answer. Admin routes, including `GET /refdata/tables/{key}/codes` (the admin grid's non-closing
code list), never close history, so an admin can look at what they are loading. A lookup inside a caller's
transaction that wrote no reference data closes history on its own connection: it stays closed even if the caller
rolls back. Seed sheets before any lookup runs.

### Corrections

A mistake in a sheet that is already in force is fixed with `correctSheet(table, level, rows, reason)` /
`POST /refdata/tables/{key}/corrections`: it creates a sheet **from today** holding exactly the rows given, with
the next `revision` for today, and it is locked on save. A `reason` is required (`422 refdata.reason_required`,
up to 500 characters). Lookups for past days still return the old sheet; records keep what they stored.

## Workspace and global sheets

A `global` table has global sheets only. A `workspace` table has global sheets and per-workspace sheets (the
workspace is the request's tenant, `getContext().tenantId`; `refdata` does not depend on `platform-tenancy`).
A lookup in a workspace uses the workspace's own sheet in force; **a workspace with no sheet on or before the
day falls back to the global level**. Once a workspace has a sheet, global sheets no longer apply to it for
dates from then on: its first sheet starts as a copy of the global sheet in force on its date, with every global
key, and later global sheets do not reach it. To drop a key in the workspace, remove its row there. With no
workspace in the request, only the global level exists.

## Look up

```ts
const refs = ctx.services.get(REFDATA)
const { sheetId, effectiveFrom, row } = await refs.get('products.tax_rates', 'GOODS', { asOf?, workspaceId? })
const { rows } = await refs.sheet('products.tax_rates')                // every row in force
const items = await refs.pick('products.categories', { q: 'foo' })     // active codes, for a dropdown
const name = await refs.label('products.categories', 'GOODS', 'lo')    // locale, then en, then the code
```

`asOf` is a `Date` or `yyyy-mm-dd` (default today in the configured zone). `get` returns inactive codes too, so
an old record still resolves; `pick` returns active ones only. `get` and `sheet` throw `422 refdata.not_found`
(`details: { table, key, asOf }`) when nothing is in force; `pick` returns `[]`. Rows are frozen. Call lookups
through the normal request context, inside or outside `inTransaction`. `resolveSheet` answers "which sheet" without
reading rows or closing history. A key is read like stored keys: `' GOODS'` finds `GOODS`, an integer key `'05'`
finds `5`, and a value its column refuses finds nothing (`refdata.not_found`). Over HTTP the picker is
`GET /refdata/tables/{key}/options?asOf&q`.

### Store the sheet on your records

The platform never writes your tables. A record that uses a rate keeps **`sheetId` plus a copy of the values it
used**, so it stays correct when the rate changes or a sheet is corrected:

```ts
const { sheetId, row } = await refs.get('products.tax_rates', category)
// write taxRate: String(row.rate) and taxRateSheetId: sheetId on the product row
```

Re-read on the events that should change the answer (for example take today's rate on every save of a record with a category) and leave the rest alone. A code stored on a record (`category`) can later go inactive; `get`
still finds it.

### Caching

Which sheet is in force is re-read from the database at most once a second per instance. Rows of a sheet are
cached only once the sheet has been in force 5 minutes (`ROWS_SETTLE_MS`), so an edit committed just after
midnight is never served stale, and only after history is closed at that level. Other instances see a change
within about a second.

## Permissions

| Permission              | Allows                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `refdata.read`          | See tables, sheets and rows; the picker                                                    |
| `refdata.manage`        | The request's workspace sheets only; global sheets need `refdata.manage_global`            |
| `refdata.manage_global` | Change global sheets. Not in any seeded role: only super administrators have it by default |

A table's `managePermission` is required on top of either. A write to another workspace's sheet is `404`.
Grant `refdata.read` and `refdata.manage` to roles in the usual way ([modules.md](modules.md)).

## Admin page and routes

Web: Administration → Reference data (page `apps/web/app/pages/admin/refdata.vue`, `refdata.read`): tables,
sheet timeline, an editable grid per sheet, new sheet, move date, delete, correction with a reason, Close history,
CSV import and export. Routes under `/refdata`: `GET /tables`, `GET|POST /tables/{key}/sheets`,
`PATCH|DELETE /sheets/{id}`, `GET|PUT|DELETE /sheets/{id}/rows`, `POST /tables/{key}/corrections`,
`POST /tables/{key}/close-history`, `GET /tables/{key}/codes`, `GET /tables/{key}/options`.

## CSV

Every table registers a transfer (`transfer` module) with entity `refdata-<key with . replaced by ->`
(`products.tax_rates` is `refdata-products-tax_rates`). Columns are the table's columns; a `label` column is two
(`name.en`, `name.lo`); a `codes` table also has `active`.

- **Export** always with the `sheetId` filter (`POST /transfers/{entity}/export?filter[sheetId][eq]=<id>`). Without
  it the file mixes the rows of every sheet the caller sees.
- **Import** into one sheet: `POST /transfers/{entity}/import?target=<sheetId>` (required). The sheet must exist,
  belong to the table and still be editable (`409 refdata.sheet_locked`), and the caller must be allowed to write
  there; rows are added or replaced by key.
- A dry run (`dryRun=true`) checks every cell's type like a real write. Whether a `ref` code exists and is active,
  and whether the sheet got locked meanwhile, are checked per row when it is written.
- The transfer permission shows as `refdata.read` (so anyone who can see data can open the dialog); the real
  check is per target sheet, as above.

## Errors

| Code                      | Status | When                                                                             |
| ------------------------- | ------ | -------------------------------------------------------------------------------- |
| `refdata.not_found`       | 422    | No row or sheet in force; `details: { table, key, asOf }`                        |
| `refdata.sheet_locked`    | 409    | Editing, moving or deleting a sheet already in force                             |
| `refdata.date_taken`      | 409    | Another sheet of the level starts on that date                                   |
| `refdata.date_in_past`    | 422    | Creating or moving a sheet to today or earlier after history is closed           |
| `refdata.reason_required` | 422    | A correction without a reason                                                    |
| `refdata.invalid`         | 422    | Field errors (`details[].code`): bad cell, unknown column, not a date, bad level |
| `refdata.ref_inactive`    | 422    | A `ref` code that is inactive on the sheet date (field error)                    |
| `refdata.unknown_table`   | 500    | A lookup for a table nobody declared                                             |

A stale `version` on edit is `409 resource.stale_version`, as elsewhere.

## Testing

Use the database tests (`RUN_DB_TESTS=1`), see [testing.md](testing.md). Freeze or move "today" with `setClock`
(re-exported by `@elvine-sk/platform-refdata`, from platform-core). It is platform-core's clock, so it moves audit
timestamps too; reset it with `setClock(null)`. In tests, seed your sheets before the first lookup so history stays open while you do.
