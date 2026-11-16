# Document numbers

Package `@elvine-sk/platform-numbering` (`nelv add numbering`; requires `audit`, `auth`, `authorization`). It gives
a module safe issuing of human-readable numbers in the caller's transaction, a register of every number in use,
uniqueness, find-by-number and per-language display. The platform's reference module (`notes`) uses it: one issued number and one typed number.

## Set up

Register `numbering({ timeZone? })` before the modules that declare sequences (`nelv add numbering` does it; options go in
`apps/api/src/platform.options.ts`). `timeZone` is an IANA
zone, default `UTC`: periods and `{yyyy}` / `{mm}` are computed in it (`Asia/Vientiane`, for example). A
module that declares sequences lists `numbering` in `dependsOn`. Apps that add the capability run `pnpm db:migrate`
(`202610300100_numbering_create`: tables `numbering_counters`, `numbering_register`).

## Declare a sequence

A module field `numberSequences: [defineSequence({...})]`. `key` is unique across the app (a repeated key throws at
boot). `defineSequence` throws on a declaration that cannot give unique numbers: an unknown placeholder, a width on
anything but `{seq}` or `{seq:0}`, `reset` or `gaps` on a typed sequence, an issued format without `{seq}`, a
`yearly` reset without `{yyyy}` or `{yy}`, a `monthly` reset without `{mm}` and a year placeholder, a name in
`parts` that the format does not use.

| Field        | Meaning                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------ |
| `key`        | `notes.number`                                                                                   |
| `label`      | Name on the admin page (a web i18n key or a literal)                                             |
| `kind`       | `issued`: the platform counts and hands out numbers. `typed`: people enter them, it checks       |
| `format`     | Template, below                                                                                  |
| `reset`      | Issued only: `yearly`, `monthly` or `never` (default). The counter starts at 1 in each period    |
| `parts`      | Issued only: names of values the caller passes, each with its own counter (`['branch']`)         |
| `gaps`       | Issued only, default `false`, see "Gap-free or not"                                              |
| `reuse`      | `never`: a released number stays blocked. `after_release`: it is free again                      |
| `entityType` | What the register rows point at (`note`)                                                         |
| `labels`     | `{ label: { en: 'NV', lo: 'ນວ' } }`: text per placeholder per locale; the canonical form is `en` |
| `parse`      | Optional hook for other spellings, below                                                         |

A sequence is issued or typed, never both. Capability packages add the field by declaration merging; the module
lists it in `moduleFields`.

### Template

`{seq:N}` the counter zero-padded to N (a wider value is not cut; `{seq}` is unpadded), `{yyyy}`, `{yy}`, `{mm}`, a
name from `parts`, a key of `labels` (`{label}`). Everything else is literal. `N-{yyyy}-{seq:6}` gives
`N-2026-000017`.

The scope key of a counter is the part values in declared order, then `yyyy` or `yyyy-mm`, joined with `|` (empty
for a plain `never` sequence). A part value that is empty or contains `|` or `~` is refused
(`422 numbering.invalid`).

## Issued numbers

```ts
const { number, value } = await numbers.issue('notes.number', { entityId: id, parts?: { branch }, date? })
```

`date` defaults to now in the configured zone. It writes the register row and returns the canonical number. Call it
in the same `inTransaction` as the insert of the entity, then keep the number on your own row.

### Gap-free or not

- `gaps: false` (default): the counter row is bumped in the caller's transaction. A rollback gives the number back.
  It must run inside `inTransaction`, else it throws `500 numbering.not_in_transaction`. The counter row lock is
  held until the caller commits, so concurrent saves of the same counter wait for each other; keep that
  transaction short.
- `gaps: true`: the bump runs in its own short transaction on a second pool connection, so concurrent saves do not
  wait, and a rollback of the caller burns the number. Inside a caller's transaction it needs a second connection:
  size the database pool above the peak number of concurrent issuers. With the default pool of 10, ten concurrent
  transactions that issue `gaps: true` numbers can wait forever for the second connection.

## Typed numbers

People type the number from a paper form. Hand the input to the service; it parses, stores the canonical form and
checks it is free.

| Call                                       | Does                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `claim(key, input, { entityId, field? })`  | Parse, write the register row; returns the canonical number                                                   |
| `change(key, input, { entityId, field? })` | Release the entity's current number in that sequence and claim the new one; the same number is a no-op        |
| `release(entityType, entityId, key?)`      | Mark the entity's live numbers released (cancel, delete); `reuse` decides if it is free                       |
| `numberOf(key, entityId)`                  | The entity's live number or `null`                                                                            |
| `find(input, { keys? })`                   | `[{ key, number, entityType, entityId, status }]` for every sequence whose parser reads the input; live first |
| `display(key, number, locale)`             | The stored canonical number in the words of `locale` (the stored string if it does not parse)                 |

Name the form field in `field` (default `number`) so the error lands on it. Store `claim`'s return value, not the
input. Run claim, change and release in the transaction that saves the entity.

### Parsing

The default parser accepts the exact canonical spelling: trimmed, case-insensitive, `{seq:N}` takes at least N
digits, and `{label}` matches the text of any locale. For other spellings (`/` for `.`, no zero padding, a branch
written another way) add `parse(input) => values | null` where values hold `seq`, `yyyy`, `mm` and parts. The
platform re-renders the canonical form from them, so every spelling stores the same string. Issued sequences accept
`parse` too, for `find`.

### Uniqueness and reuse

Uniqueness is per sequence key, and case variants collide through the database collation. A live number blocks
others. After `release`, `reuse: 'after_release'` frees it and `reuse: 'never'` keeps it blocked.
Under `reuse: 'never'` a typed number's own released spelling stays blocked, so the entity that released it gets
`409` too when it claims or changes back to that number, even in another case. An entity holds one live number per
typed sequence: `claim` for an entity that already has one throws, use `change`; `change` claims the new number
before it releases the old one, so a failed change leaves the old number live.

## Keep the number on your row too

Store the canonical number on the app's own table (list, sort, filter, display). The register is the authority for
uniqueness and find. For a search box, use `find(q, { keys })` and add the entity ids it returns to the `q` filter,
so a number matches in any accepted spelling. Show typed numbers per language with `display`.

## Errors

| Case                                    | Response                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| Typed input does not parse              | `422 validation.failed`, `details[0] = { path: <field>, code: 'numbering.invalid' }` |
| Number held                             | `409 numbering.taken`, `details: { number }`                                         |
| Missing or malformed part value         | `422 numbering.invalid`                                                              |
| Counter scope the sequence cannot issue | `422` field error on `scope`, code `numbering.invalid_scope`                         |
| Counter moved backwards                 | `422` field error on `value`, code `numbering.counter_backwards`                     |
| Unknown sequence key                    | `500 numbering.unknown_sequence`                                                     |
| Gap-free issue outside a transaction    | `500 numbering.not_in_transaction`                                                   |

Messages exist in en and lo.

## Admin

Permissions `numbering.read` and `numbering.manage`. Routes:

- `GET /numbering/sequences`: declared sequences (key, label, kind, format, parts, reset, gaps, reuse), counter count
  and last issued.
- `GET /numbering/sequences/{key}/counters`: paged counters (scope, last value, updated).
- `PUT /numbering/sequences/{key}/counters/{scope}` `{ value, version }`: needs `numbering.manage`. Forward only
  (a value at or below the current one is `422 numbering.counter_backwards`). It creates the counter row when the
  period has none. The path segment `~` stands for the empty scope. The scope must be one `issue` can produce: the part
  values in order (none empty), then `YYYY` (yearly) or `YYYY-MM` (monthly), else `422 numbering.invalid_scope`. Audited as `numbering.counter_moved`
  `{ key, scope, from, to }`.

Web: Administration → Numbering ("Document numbers" in the menu, page `apps/web/app/pages/admin/numbering.vue`).
A sequence opens its counters; "Move forward" asks for the new value with a warning that numbers in between are
skipped; "Set a new counter" starts one for a period that has none.

## Tests

Use the database tests (`RUN_DB_TESTS=1`), see [testing.md](testing.md).

## Not built

Editing sequences at runtime, sequences that both issue and accept typed numbers, a number input component, a
global number search box, a per-tenant switch (pass the tenant as a part), moving hr-fam onto the package.
