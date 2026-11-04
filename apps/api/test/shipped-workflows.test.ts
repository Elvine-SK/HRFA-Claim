import { join } from 'node:path'
import { dbTestsEnabled } from '@elvine-sk/platform-db/testing'
import type { PlatformApp } from '@elvine-sk/platform-server'
import type { TestClient } from '@elvine-sk/platform-server/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createWorkflow } from './agreement-fixtures.ts'
import { adminClient, API, bootApp, hrmClient } from './helpers.ts'

const modules = ['agreements', 'payments', 'settlements']
const keys = ['agreement', 'payment', 'settlement']

describe.skipIf(!dbTestsEnabled)('shipped approval workflows', () => {
  let platform: PlatformApp
  let admin: TestClient

  beforeAll(async () => {
    platform = await bootApp()
    admin = await adminClient(platform)
    // The test database is built without `migrate`'s sync; create them from the same files when missing.
    for (const m of modules) await createWorkflow(admin, join(import.meta.dirname, `../src/modules/${m}/workflow.json`))
  })
  afterAll(async () => {
    await platform?.ctx.db.destroy()
  })

  it('the agreement, payment and settlement workflows are shipped with the app, as in their workflow.json', async () => {
    const res = await admin.get(`${API}/approval/workflows`)
    expect(res.status).toBe(200)
    for (const key of keys) {
      const w = res.body.data.find((x: any) => x.key === key)
      expect(w, key).toBeTruthy()
      expect(w.shipped, key).toBe(true)
      expect(w.shippedStatus, key).toBe('current')
    }
  })

  it('refuses the workflow list to a user without approval rights', async () => {
    const { client } = await hrmClient(platform, admin, '10129')
    const res = await client.get(`${API}/approval/workflows`)
    expect(res.status).toBe(403)
  })
})
