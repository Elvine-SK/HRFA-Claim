# HR-FAM

Enterprise app on the Nelvine platform: a Hono + Kysely/MariaDB API in `apps/api` and a Nuxt UI web app in
`apps/web`. This file is yours: `nelv` wrote it once and never changes it. Keep your team's conventions here.

## Platform guides

Read `docs/platform/README.md` first, then the guide for the task (module, authorization, web, testing, files,
security, external data sources, single sign-on, deployment). They follow the installed platform version (`nelv update` keeps them
current) and describe the recommended way to build on it. Follow them unless this file says otherwise.

## Commands

```sh
podman compose up -d                  # MariaDB on :3306 (docker compose works too)
pnpm run migrate
pnpm run dev:api        # API on :3335
pnpm run dev:web        # web on :3336
pnpm run typecheck
RUN_DB_TESTS=1 pnpm run test   # TEST_DATABASE_URL: see docs/platform/testing.md
pnpm run openapi        # after changing routes; then: cd apps/web && pnpm run api:types
```

## Rules in short

- Your API code goes in `apps/api/src/modules/<name>/`, registered in `apps/api/src/modules/index.ts`. Change
  platform modules with `nelv add <capability>`; never edit `apps/api/src/platform.modules.ts` or the
  generated `package.json` files by hand.
- Query through `currentDb()`, write in `inTransaction`, record changes with `writeHistory`.
- Every route checks access: `authorize` for one record, a scoped select (`applyScope`, `scopeAll`, `ownRows`,
  `scopedBy`) passed to `paginate` for a list.
- UUID columns are `BINARY(16)` named `id`, `*_id` or `*_by`; write them with `uuidBin(id)`.
- Every UI string in en and lo; your keys in `apps/web/i18n/locales/app.*.json`.
- Add a test through the HTTP API for each route, including a refusal.
- Never edit a migration that has run anywhere: add a new one.
- Prefer adding a new file over editing a copied platform file; `nelv update` merges edits to copied files.

## Team conventions

<!-- Add your own: naming, review rules, branches, who to ask. -->
