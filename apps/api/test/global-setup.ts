import { authTestConfig } from '@elvine-sk/platform-auth/testing'
import { dbTestsEnabled, setupTestDatabase } from '@elvine-sk/platform-db/testing'
import { createTestApp } from '@elvine-sk/platform-server/testing'
import { modules } from '../src/app.ts'

/** With RUN_DB_TESTS=1: recreate the test database from every module's migrations once per run. */
export default async function setup() {
  if (!dbTestsEnabled) return
  const platform = await createTestApp({ modules: modules(), config: authTestConfig() })
  const sources = platform.migrationSources
  await platform.ctx.db.destroy()
  await setupTestDatabase(sources, 'hr_fam')
}
