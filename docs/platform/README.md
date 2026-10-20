# Building on the Nelvine platform

These guides describe how HR-FAM is meant to be built on the platform (1.0.0). They are
recommendations, not rules the build enforces: following them keeps your code secure by default, consistent
with the platform's own screens, and easy to upgrade. Where the platform does enforce something (a list that
skips its scope doesn't compile, an undeclared event throws outside production), the guide says so.

`nelv update` keeps this folder in step with the platform version you upgrade to. Put your team's own
conventions in `AGENTS.md` at the app root, not here: edits here are merged on update and can conflict.

| Guide                                | Read before                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| [modules.md](modules.md)             | writing an API module: migrations, records, permissions, events, jobs, approval |
| [authorization.md](authorization.md) | guarding a route, writing a list query, or adding policy fields                 |
| [web.md](web.md)                     | adding a page, a menu item, UI strings, or a live-updating form                 |
| [testing.md](testing.md)             | writing or running a test                                                       |
| [files.md](files.md)                 | attaching files to records or choosing storage                                  |
| [security.md](security.md)           | settings for lockout, CAPTCHA, request limits, live updates and webhooks        |
| [data-sources.md](data-sources.md)   | reading another system's database (an HR system): config, types, lists, pickers |
| [oidc.md](oidc.md)                   | setting up single sign-on                                                       |
| [deployment.md](deployment.md)       | running several instances, PM2, Redis, the proxy in front of the API            |

## Where things go

| Path                                                    | Owner           | What                                                                                        |
| ------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/<name>/`                          | you             | One folder per module: `module.ts`, `migrations.ts`, `schema.ts`, `queries.ts`, `routes.ts` |
| `apps/api/src/modules/index.ts`                         | you             | `appModules`: your modules, registered after the platform's                                 |
| `apps/api/src/platform.modules.ts`                      | generated       | Platform modules from `.nelvrc.json`; change them with `nelv add <capability>`              |
| `apps/api/test/`                                        | you             | Tests; `global-setup.ts` builds the test database from every module                         |
| `apps/web/app/pages/`, `components/`, `plugins/`        | you (new files) | Your pages, components and plugins                                                          |
| `apps/web/app/pages/index.vue`, `plugins/navigation.ts` | you (starters)  | The home page and your menu groups: copied once, then yours                                 |
| `apps/web/app/**` (copied)                              | platform        | Layouts, platform components, composables, platform pages                                   |
| `apps/web/i18n/locales/`                                | both            | Platform strings (copied) and your own area files (see [web.md](web.md))                    |
| `docs/platform/`                                        | platform        | These guides                                                                                |

A file you create is yours: `nelv update` never touches it. A file copied from the platform is tracked: you
may edit it and `nelv update` merges upstream changes into your edit (3-way). To take a copied file over for
good, add a glob for it to `exclude` in `.nelvrc.json`; it then stops receiving platform fixes. Prefer adding a
file of your own over editing a copied one.

## Principles

1. **Data goes through the platform's helpers.** Query with `currentDb()` (it joins the surrounding
   transaction), write inside `inTransaction`, and use `createdStamp`, `updateVersioned` and `writeHistory`, so
   every record has its version, its history and its audit trail. Effects that must wait for the commit (mail,
   calls to other systems) go in `afterCommit`.
2. **Every route checks access.** Single records: load, 404 if missing, then `authorize`. Lists: build the page
   with `paginate` from a `ScopedSelect` (`applyScope`, `scopeAll`, `ownRows`, or `scopedBy` with a reason).
   Permissions are declared by the module, never hard-coded role names. See [authorization.md](authorization.md).
3. **Declare what a module brings.** Permissions, policy fields, audit actions, events, jobs, lists, menu items
   and messages are fields of `defineModule`, not side code. List every module whose services or fields you use
   in `dependsOn`. The API warns at boot about a field no installed module reads.
4. **UUIDs are `BINARY(16)`, named `id`, `*_id` or `*_by`.** Reads decode only those names (any other comes back
   as a Buffer); writes go through `uuidBin(id)`. Kysely runs with `CamelCasePlugin`: write `ownerId` for the
   column `owner_id`.
5. **Errors are `AppError`s with a code** (`<module>.<key>`), a status and a text in `messages` for en and lo.
   Don't return ad-hoc error bodies.
6. **The API describes itself.** Routes use `createRoute` with zod schemas. After changing routes, run
   `pnpm run openapi` and regenerate the web's types (`cd apps/web && pnpm run api:types`).
7. **Every UI string is translated.** Keys in your area files for en and lo; no literal text in templates.
8. **Use the platform's screens and components** (`PlatformDataTable`, forms, dialogs, `useConfirm`) before
   writing your own, so lists, filters, empty states and phone layouts behave the same everywhere.
9. **Test against a real database.** One test file per module through the HTTP API with `TestClient`, covering
   the allowed path and at least one refusal. See [testing.md](testing.md).
10. **Stay upgradeable.** Don't edit `platform.modules.ts` or the generated `package.json` files by hand; don't
    import a platform package's internal paths, only what it exports.

## Done means

- `pnpm run typecheck` and `RUN_DB_TESTS=1 pnpm run test` pass.
- `cd apps/api && pnpm run openapi:verify` passes (the committed `openapi.json` is current).
- New strings exist in en and lo; the page renders in the browser with no console error.
- Migrations are new files with new names; a migration that already ran anywhere is never edited.

## Platform updates

- `nelv upgrade` bumps every `@elvine-sk/platform-*` package together and prints the release notes, including
  migration notes. Run `pnpm run migrate` afterwards.
- `nelv diff` shows upstream changes to copied files, `nelv update` applies them.
- `nelv doctor` checks configuration, versions, registry access and the database.
