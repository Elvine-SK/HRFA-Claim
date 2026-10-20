import { authTestConfig, createTestUser, loginAs } from '@elvine-sk/platform-auth/testing'
import { AUTHORIZATION_ADMIN } from '@elvine-sk/platform-authorization'
import { runWithContext, SYSTEM_CONTEXT } from '@elvine-sk/platform-db'
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
