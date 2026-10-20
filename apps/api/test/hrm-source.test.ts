import { authTestConfig } from '@elvine-sk/platform-auth/testing'
import { source } from '@elvine-sk/platform-db'
import { dbTestsEnabled } from '@elvine-sk/platform-db/testing'
import type { PlatformApp } from '@elvine-sk/platform-server'
import { createTestApp } from '@elvine-sk/platform-server/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { modules } from '../src/app.ts'
import '../src/sources/hrm.ts'
import { hrmTestSource } from './hrm-test-source.ts'

describe.skipIf(!dbTestsEnabled)('hrm source', () => {
  let platform: PlatformApp

  beforeAll(async () => {
    platform = await createTestApp({
      modules: modules(),
      config: authTestConfig({ dataSources: [hrmTestSource()] }),
    })
  })
  afterAll(async () => {
    await platform?.ctx.db.destroy()
  })

  it('reads upper-case HRM columns through camelCase names', async () => {
    const row = await source('hrm')
      .selectFrom('hrmEmployee')
      .select(['eid', 'nameLao', 'branchCode'])
      .where('eid', '=', '10001')
      .executeTakeFirstOrThrow()
    expect(row).toEqual({ eid: '10001', nameLao: 'ສົມພອນ', branchCode: '888010' })
  })

  it('refuses writes', async () => {
    await expect(
      source('hrm').updateTable('hrmEmployee').set({ nameLao: 'x' }).where('eid', '=', '10001').execute(),
    ).rejects.toMatchObject({ sqlMessage: expect.stringMatching(/READ ONLY/i) })
  })
})
