# Testing

Tests live in `apps/api/test/` and run with Vitest. Test a module through its HTTP API against a real
MariaDB: that exercises the routes, validation, authorization, transactions and migrations together, the way a
browser uses them. Keep pure logic (a price calculation) in plain unit tests next to it.

## Running

```sh
podman compose up -d                     # MariaDB on :3306, also creates hr_fam_test
export TEST_DATABASE_URL=mysql://app:app_dev@localhost:3306/hr_fam_test
RUN_DB_TESTS=1 pnpm run test
```

- Database tests are wrapped in `describe.skipIf(!dbTestsEnabled)` (`@elvine-sk/platform-db/testing`) and skip
  without `RUN_DB_TESTS=1`; `CI=true` also enables them. The app's CI sets both.
- The suite uses its own database, `hr_fam_test_hr_fam` (`TEST_DATABASE_SUITE` in `vitest.config.ts`),
  created on demand. `test/global-setup.ts` runs once per run: it drops every table (only in a database whose
  name contains `test`) and runs the migrations of every module in `modules()`, yours included.
- Files run one after another (`fileParallelism: false`); data stays between files within a run. Make tests
  independent of each other's rows: unique emails and keys (`createTestUser` randomises the email), and look up
  the ids you created rather than counting rows.

## An app test

```ts
import { authTestConfig, createTestUser, loginAs } from '@elvine-sk/platform-auth/testing'
import { AUTHORIZATION_ADMIN } from '@elvine-sk/platform-authorization'
import { runWithContext, SYSTEM_CONTEXT } from '@elvine-sk/platform-db'
import { dbTestsEnabled } from '@elvine-sk/platform-db/testing'
import type { PlatformApp } from '@elvine-sk/platform-server'
import { createTestApp, TestClient } from '@elvine-sk/platform-server/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { modules } from '../src/app.ts'

const API = '/api/v1'

describe.skipIf(!dbTestsEnabled)('notes', () => {
  let platform: PlatformApp
  let admin: TestClient

  const signedIn = async (email: string) => {
    const client = new TestClient(platform)
    expect((await loginAs(client, email)).status).toBe(200)
    return client
  }

  beforeAll(async () => {
    platform = await createTestApp({ modules: modules(), config: authTestConfig() })
    await platform.ready()
    const root = await createTestUser(platform)
    await runWithContext(SYSTEM_CONTEXT, () =>
      platform.ctx.services.get(AUTHORIZATION_ADMIN).grantSuper(root.id),
    )
    admin = await signedIn(root.email)
  })
  afterAll(() => platform.ctx.db.destroy())

  it('refuses someone without the permission', async () => {
    const someone = await signedIn((await createTestUser(platform)).email)
    expect((await someone.post(`${API}/notes`, { title: 'x' })).status).toBe(403)
  })
})
```

- `createTestApp({ modules, config: authTestConfig() })`: silent logger, memory rate-limit store,
  `NODE_ENV=test`, the suite's database. It does not migrate (the global setup did). `authTestConfig()` supplies
  fixed secrets and cheap password hashing. Then `await platform.ready()` runs the modules' `onReady` hooks
  (the permission catalog sync among them).
- Give people access the way an administrator would: create roles and policies through the API as the super
  administrator (`POST /authz/roles`, `POST /authz/roles/{id}/policies`, `PUT /authz/users/{id}/roles`), so the
  test also proves your permissions and policy fields are declared.
- Test the refusals, not only the happy path: a person without the permission (`403`), a record outside their
  scope (`404` or `403`, as your route answers), a stale `version` (`409`), invalid input (`422`).

## Users and clients

- `createTestUser(platform, { email?, password?, status?, mfaRequired?, emailVerified? })` inserts a user and
  returns `{ id, email, password }` (default password `TEST_PASSWORD`).
- `TestClient(platform)` acts as a same-origin browser: keeps cookies, sends `Origin`, echoes the CSRF token on
  writes. Methods `get`, `post`, `put`, `patch`, `delete`, and `upload(path, text, contentType = 'text/csv')`.
  Responses are `{ status, body, headers }` with JSON parsed.
- `loginAs(client, email, password?)` signs in and stores the CSRF token.

## Jobs, mail, time

- The job worker never starts in tests. After a request that queues work, run it with
  `await platform.ctx.services.get(JOBS).drain()` (`@elvine-sk/platform-jobs`); it also sends pending mail.
- Capture mail with a `MemoryTransport` (`@elvine-sk/platform-auth`): in the test, build the module list with
  `auth({ mailTransport: mail })` in place of the generated `auth()`, then read `mail.last(to)`.
- Platform code reads the time through `now()`. Move it with `setClock(() => addMinutes(new Date(), 16))` from
  `@elvine-sk/platform-core` and reset it with `setClock(null)` in `afterEach`.
- DB helpers without an app: `useTestDatabase()` registers a pool and returns `close`; `withRollback(fn)` runs
  `fn` in a transaction that always rolls back (its `afterCommit` hooks run at once).
