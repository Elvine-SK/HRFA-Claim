import { authTestConfig, createTestUser, loginAs } from '@elvine-sk/platform-auth/testing'
import { AUTHORIZATION_ADMIN } from '@elvine-sk/platform-authorization'
import { uuidv7 } from '@elvine-sk/platform-core'
import { createDatabase, runWithContext, sql, SYSTEM_CONTEXT } from '@elvine-sk/platform-db'
import { testSourceUrl } from '@elvine-sk/platform-db/testing'
import type { PlatformApp } from '@elvine-sk/platform-server'
import { createTestApp, TestClient } from '@elvine-sk/platform-server/testing'
import { expect } from 'vitest'
import { modules } from '../src/app.ts'
import { hrmTestSource } from './hrm-test-source.ts'

export const API = '/api/v1'

/** The app as tests boot it, with the `hrm` source pointing at the fixture database unless `hrmUrl` is given. */
export async function bootApp(options: { hrmUrl?: string; config?: Record<string, unknown> } = {}) {
  const platform = await createTestApp({
    modules: modules(),
    config: authTestConfig({ dataSources: [hrmTestSource(options.hrmUrl)], ...options.config }),
  })
  await platform.ready()
  return platform
}

export async function signedIn(platform: PlatformApp, email: string) {
  const client = new TestClient(platform)
  expect((await loginAs(client, email)).status).toBe(200)
  return client
}

/** A signed-in super administrator. */
export async function adminClient(platform: PlatformApp) {
  const root = await createTestUser(platform)
  await runWithContext(SYSTEM_CONTEXT, () => platform.ctx.services.get(AUTHORIZATION_ADMIN).grantSuper(root.id))
  return signedIn(platform, root.email)
}

/** A role with `permissions`, created through the admin API; returns its id. */
export async function role(admin: TestClient, key: string, permissions: string[]) {
  const res = await admin.post(`${API}/authz/roles`, { key, name: key, permissions })
  expect(res.status, JSON.stringify(res.body)).toBe(201)
  return res.body.data.id as string
}

/** A new password user with `roleIds`, signed in. */
export async function userWith(platform: PlatformApp, admin: TestClient, roleIds: string[] = []) {
  const u = await createTestUser(platform)
  if (roleIds.length) expect((await admin.put(`${API}/authz/users/${u.id}/roles`, { roleIds })).status).toBe(200)
  return { id: u.id, client: await signedIn(platform, u.email) }
}

/** A `mysql://` URL nothing listens on, for "HRM is down" tests. */
export const DOWN_URL = 'mysql://app:app_dev@127.0.0.1:1/hr_fam_test_down'

/**
 * An HRM employee signed in through the handoff, as HRM would send them: a fresh code is put in the fixture
 * `tb_app_handoff`, redeemed through `GET /auth/hrm`, and `roleIds` are granted afterwards.
 */
export async function hrmClient(platform: PlatformApp, admin: TestClient, eid: string, roleIds: string[] = []) {
  const code = `test-${eid}-${uuidv7()}`
  // The app reads HRM in read-only transactions, so the code goes in through a connection of its own.
  const hrm = createDatabase<any>({ url: testSourceUrl('hrm'), poolSize: 1 })
  try {
    await sql`INSERT INTO tb_app_handoff (code_hash, eid, created_at, expires_at)
      VALUES (SHA2(${code}, 256), ${eid}, NOW(), '2099-01-01 00:00:00')`.execute(hrm)
  } finally {
    await hrm.destroy()
  }
  const client = new TestClient(platform)
  const res = await client.get(`${API}/auth/hrm?code=${encodeURIComponent(code)}`)
  expect(res.status, `sign-in of ${eid}`).toBe(302)
  const session = await client.get(`${API}/auth/session`)
  client.csrfToken = session.body.data.csrfToken
  const userId = session.body.data.user.id as string
  if (roleIds.length) expect((await admin.put(`${API}/authz/users/${userId}/roles`, { roleIds })).status).toBe(200)
  return { userId, client }
}
